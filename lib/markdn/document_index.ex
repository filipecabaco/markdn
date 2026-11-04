defmodule Markdn.DocumentIndex do
  @moduledoc """
  The list of markdown documents under the root, walked once and shared.

  The palette and the multibuffer both need every document under the root, and
  both ask on every keystroke. Walking the tree per request is fine on a laptop
  disk (under a second for a large monorepo) and not fine inside the packed
  sidecar, where each `ls` and `lstat` crosses ampoule's guest boundary: the
  same walk takes ten seconds there. With a walk per keystroke, and the browser
  abandoning each request while the server keeps walking, the walks queue behind
  one another and no answer ever arrives.

  So this process owns the list and makes the walk single-flight:

    * A fresh list is answered from memory.
    * A list older than `@refresh_after_ms` is still answered from memory, and a
      walk starts in the background — files changed outside the app (a
      `git checkout`, another editor) show up a moment later rather than never.
    * With no list for the current `{root, show_hidden}` yet, the caller waits
      for the walk, and every other caller that arrives meanwhile waits on the
      *same* walk instead of starting its own.

  Documents the app itself writes, creates, renames or trashes are applied to the
  list in place (`changed/2`), so a file just created is in the palette at once,
  without another walk. A change that lands while a walk is running is replayed
  on that walk's result, which may have listed the directory before the change.

  A process is justified here: the list is state that must outlive a request, and
  concurrent requests must share one walk rather than race their own.
  """

  use GenServer

  alias Markdn.Documents

  @refresh_after_ms 30_000

  # Long enough for a cold walk of a whole home directory inside the sidecar.
  @call_timeout :timer.minutes(2)

  @type key :: {root :: String.t(), show_hidden :: boolean()}
  @type document :: %{name: String.t(), path: String.t(), mtime: integer()}

  @doc """
  Starts the index.

  ## Options

    * `:prewarm` - walk the current root at boot, so the first palette open is
      answered from memory (default `false`)
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Every document under `key`'s root.

  Without the index running (`mix run --no-start`, a script), this walks
  directly: correct, only uncached.
  """
  @spec documents(key()) :: [document()]
  def documents(key) do
    case GenServer.whereis(__MODULE__) do
      nil -> Documents.scan(key)
      pid -> pid |> GenServer.call({:documents, key}, @call_timeout) |> unwrap()
    end
  end

  # A crashed walk is not an empty tree, and answering [] would say it was.
  defp unwrap({:ok, documents}), do: documents
  defp unwrap({:error, reason}), do: exit({:walk_failed, reason})

  @doc """
  Records that the app changed `paths` (relative to `key`'s root).

  Each path is looked at again and added, updated or dropped. A cast, but the
  caller's next `documents/1` is still answered after it: messages from one
  process to another arrive in the order they were sent.
  """
  @spec changed(key(), [String.t()]) :: :ok
  def changed(key, paths) when is_list(paths) do
    case GenServer.whereis(__MODULE__) do
      nil -> :ok
      pid -> GenServer.cast(pid, {:changed, key, paths})
    end
  end

  # --- Server ----------------------------------------------------------------

  @impl true
  def init(opts) do
    state = %{
      key: nil,
      documents: [],
      walked_at: nil,
      # %{task: Task.t(), key: key()} while a walk runs.
      walk: nil,
      # Callers waiting for a key that has no list yet: [{from, key}].
      waiters: [],
      # Changes made while a walk ran: [{key, path}], newest first.
      pending: []
    }

    if Keyword.get(opts, :prewarm, false),
      do: {:ok, state, {:continue, :prewarm}},
      else: {:ok, state}
  end

  @impl true
  def handle_continue(:prewarm, state), do: {:noreply, start_walk(state, Documents.index_key())}

  @impl true
  def handle_call({:documents, key}, _from, %{key: key} = state) do
    state = if stale?(state), do: start_walk(state, key), else: state
    {:reply, {:ok, state.documents}, state}
  end

  def handle_call({:documents, key}, from, state) do
    state = %{state | waiters: [{from, key} | state.waiters]}
    {:noreply, start_walk(state, key)}
  end

  @impl true
  def handle_cast({:changed, key, paths}, state) do
    state = Enum.reduce(paths, state, &apply_change(&2, key, &1))

    # Kept only while a walk runs: its result is the one that may predate them.
    state =
      if state.walk,
        do: %{state | pending: Enum.map(paths, &{key, &1}) ++ state.pending},
        else: state

    {:noreply, state}
  end

  @impl true
  def handle_info({ref, documents}, %{walk: %{task: %Task{ref: ref}, key: key}} = state) do
    Process.demonitor(ref, [:flush])

    state = %{
      state
      | key: key,
        documents: documents,
        walked_at: System.monotonic_time(:millisecond),
        walk: nil
    }

    state =
      state.pending
      |> Enum.reverse()
      |> Enum.reduce(%{state | pending: []}, fn {change_key, path}, acc ->
        apply_change(acc, change_key, path)
      end)

    {:noreply, state |> reply_waiters(key, {:ok, state.documents}) |> next_walk()}
  end

  def handle_info(
        {:DOWN, ref, :process, _pid, reason},
        %{walk: %{task: %Task{ref: ref}, key: key}} = state
      ) do
    state = %{state | walk: nil, pending: []}
    {:noreply, state |> reply_waiters(key, {:error, reason}) |> next_walk()}
  end

  # --- Internals ---------------------------------------------------------------

  # Read per call rather than at boot so a test can shorten it for one case.
  defp stale?(%{walked_at: walked_at}) do
    refresh_after = Application.get_env(:markdn, :index_refresh_after_ms, @refresh_after_ms)
    System.monotonic_time(:millisecond) - walked_at > refresh_after
  end

  # One walk at a time. A request for another key while one runs is picked up by
  # `next_walk/1` when it finishes, rather than racing it.
  defp start_walk(%{walk: nil} = state, key) do
    task = Task.Supervisor.async_nolink(Markdn.TaskSupervisor, fn -> Documents.scan(key) end)
    %{state | walk: %{task: task, key: key}}
  end

  defp start_walk(state, _key), do: state

  defp next_walk(%{waiters: []} = state), do: state

  defp next_walk(%{waiters: waiters} = state),
    do: start_walk(state, waiters |> List.last() |> elem(1))

  defp reply_waiters(state, key, reply) do
    {ready, waiting} =
      Enum.split_with(state.waiters, fn {_from, waiter_key} -> waiter_key == key end)

    Enum.each(ready, fn {from, _key} -> GenServer.reply(from, reply) end)
    %{state | waiters: waiting}
  end

  # A change under another root (or hidden-files setting) than the list was
  # walked for is not this list's concern: the next walk for that key sees it.
  defp apply_change(%{key: key} = state, key, path) do
    others = Enum.reject(state.documents, &(&1.path == path))

    documents =
      case Documents.index_entry(key, path) do
        {:ok, document} -> [document | others]
        :none -> others
      end

    %{state | documents: documents}
  end

  defp apply_change(state, _key, _path), do: state
end
