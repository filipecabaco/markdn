defmodule Markdn.Documents do
  @moduledoc """
  Reading, writing and listing markdown documents under a confined root.

  Every path that arrives from the webview or from an MCP client is untrusted, so
  each one is resolved and then checked to be inside `root/0` before any file
  operation runs. `Path.expand/2` collapses `..` segments *before* the check, so
  `../../.ssh/id_rsa` is rejected rather than followed.
  """

  alias Markdn.Fuzzy
  alias Markdn.Settings

  @extensions ~w(.md .markdown .mdx)

  # Search walks the tree rather than one level, so it needs its own brakes: a
  # home directory is not a project checkout. Depth and entry budget together
  # bound the work regardless of what is under the root, including a symlink
  # cycle (symlinks are skipped outright — see `visit/6`).
  @max_depth 8
  @max_entries 20_000
  @default_limit 50

  # Directories that are never worth walking for documents and are expensive to
  # walk: dependency and build trees, plus macOS's ~/Library, which is enormous
  # and is not hidden, so the dotfile rule below does not catch it.
  @skip_dirs ~w(node_modules _build deps target dist build .git .svn .hg Library)

  # Images a document may reference. Kept separate from @extensions: the document
  # API must not hand back arbitrary binaries, and the image API must not hand
  # back source.
  @image_types %{
    ".png" => "image/png",
    ".jpg" => "image/jpeg",
    ".jpeg" => "image/jpeg",
    ".gif" => "image/gif",
    ".webp" => "image/webp",
    ".avif" => "image/avif",
    ".svg" => "image/svg+xml"
  }

  @doc """
  Root directory the document API is confined to.

  Three sources, in falling precedence: `MARKDN_ROOT` (via application env), the
  `root` setting, then the user's home directory. The environment wins because it
  is the documented way to *narrow* what the app may touch when launching it —
  a settings file the app itself writes must not be able to widen that again.
  """
  @spec root() :: String.t()
  def root do
    pinned_root() || Settings.get("root") || System.user_home!()
  end

  @doc """
  Whether the root is pinned by `MARKDN_ROOT` and so cannot be changed at runtime.

  The settings UI reads this to disable the field rather than offer an edit that
  the API would then refuse.
  """
  @spec root_locked?() :: boolean()
  def root_locked?, do: not is_nil(pinned_root())

  defp pinned_root, do: Application.get_env(:markdn, :root)

  @doc "Markdown extensions treated as editable documents."
  @spec extensions() :: [String.t()]
  def extensions, do: @extensions

  @doc """
  Resolves `path` against the root and rejects anything that escapes it.

  Returns `{:ok, absolute_path}` or `{:error, :outside_root}`.
  """
  @spec safe_path(String.t()) :: {:ok, String.t()} | {:error, :outside_root}
  def safe_path(path) when is_binary(path) do
    root = root()
    expanded = Path.expand(path, root)

    # Compare on segments, not string prefixes: "/home/user-evil" has "/home/user"
    # as a string prefix but is a different directory.
    if inside?(expanded, root), do: {:ok, expanded}, else: {:error, :outside_root}
  end

  def safe_path(_), do: {:error, :outside_root}

  defp inside?(path, root) do
    path_parts = Path.split(path)
    root_parts = Path.split(root)
    List.starts_with?(path_parts, root_parts)
  end

  @doc "Reads a markdown document. Returns `{:ok, contents}`."
  @spec read(String.t()) :: {:ok, String.t()} | {:error, atom()}
  def read(path) do
    with {:ok, abs} <- safe_path(path),
         :ok <- check_extension(abs),
         {:ok, contents} <- File.read(abs) do
      {:ok, contents}
    end
  end

  @doc "Writes a markdown document, creating parent directories as needed."
  @spec write(String.t(), String.t()) :: :ok | {:error, atom()}
  def write(path, contents) when is_binary(contents) do
    with {:ok, abs} <- safe_path(path),
         :ok <- check_extension(abs),
         :ok <- File.mkdir_p(Path.dirname(abs)) do
      File.write(abs, contents)
    end
  end

  def write(_, _), do: {:error, :invalid_contents}

  @doc """
  Lists markdown documents under `path`, one level deep.

  Directories are returned alongside files so the UI can build a tree lazily
  rather than walking the whole home directory up front.
  """
  @spec list(String.t()) :: {:ok, [map()]} | {:error, atom()}
  def list(path \\ ".") do
    with {:ok, abs} <- safe_path(path),
         {:ok, names} <- File.ls(abs) do
      entries =
        names
        |> Enum.reject(&hidden?/1)
        |> Enum.map(&entry(abs, &1))
        |> Enum.reject(&is_nil/1)
        |> Enum.sort_by(&{&1.type != :directory, String.downcase(&1.name)})

      {:ok, entries}
    end
  end

  defp entry(dir, name) do
    full = Path.join(dir, name)

    cond do
      File.dir?(full) -> %{name: name, path: relative(full), type: :directory}
      markdown?(name) -> %{name: name, path: relative(full), type: :file}
      true -> nil
    end
  end

  defp relative(abs), do: Path.relative_to(abs, root())

  defp markdown?(name), do: Path.extname(name) in @extensions

  # Dotfiles are noise in a document tree by default, but a notes directory that
  # lives in a dotfolder is a real thing, so it is a setting rather than a rule.
  defp hidden?(name), do: String.starts_with?(name, ".") and not Settings.get("showHiddenFiles")

  @doc """
  Fuzzy-searches markdown documents anywhere under the root.

  `query` matches as a subsequence of the document's path, so `dsn` finds
  `docs/design-notes.md`. Results are ranked by `Markdn.Fuzzy`, with a match in
  the file name preferred over one that only lands in the directories above it —
  a name is what the user is thinking of when they type.

  An empty query is not an error: it returns the most recently modified
  documents, which is what a palette should show before anything is typed.

  Each result carries `matches`, the indices in `path` that the query hit, so the
  caller can highlight them without re-running the match.

  ## Options

    * `:limit` - results to return (default #{@default_limit})
  """
  @spec search(String.t(), keyword()) :: [map()]
  def search(query, opts \\ []) when is_binary(query) do
    limit = Keyword.get(opts, :limit, @default_limit)
    trimmed = String.trim(query)

    walk() |> rank(trimmed) |> Enum.take(limit)
  end

  @doc """
  Every markdown document under the root, as `%{name:, path:, mtime:}`.

  Bounded by depth and by an entry budget, and never follows a symlink, so the
  cost is the same whether the root is a project checkout or a home directory.
  Public because content search walks the same tree the fuzzy finder does —
  duplicating the brakes in a second module is how the two drift apart.
  """
  @spec walk() :: [%{name: String.t(), path: String.t(), mtime: integer()}]
  def walk do
    root()
    |> crawl("", @max_depth, {[], @max_entries})
    |> elem(0)
  end

  defp rank(documents, "") do
    documents
    |> Enum.sort_by(& &1.mtime, :desc)
    |> Enum.map(&Map.merge(&1, %{score: 0, matches: []}))
  end

  defp rank(documents, query) do
    documents
    |> Enum.map(&scored(&1, query))
    |> Enum.reject(&is_nil/1)
    # Ties broken by the shorter path: with two equally good matches, the one
    # nearer the root is the one the user is more likely to mean.
    |> Enum.sort_by(&{-&1.score, String.length(&1.path), &1.path})
  end

  defp scored(document, query) do
    case Fuzzy.match(document.path, query) do
      :nomatch ->
        nil

      {:ok, score, matches} ->
        # The name is a suffix of the path, so a hit inside it is worth more than
        # the same hit spread across parent directories.
        name_bonus = if Fuzzy.score(document.name, query), do: 30, else: 0
        Map.merge(document, %{score: score + name_bonus, matches: matches})
    end
  end

  defp crawl(_dir, _rel, depth, acc) when depth < 0, do: acc

  defp crawl(dir, rel, depth, acc) do
    case File.ls(dir) do
      {:ok, names} -> Enum.reduce(names, acc, &visit(&1, dir, rel, depth, &2))
      # An unreadable directory (permissions, a dangling mount) must not abort the
      # search — the rest of the tree is still worth returning.
      {:error, _} -> acc
    end
  end

  defp visit(_name, _dir, _rel, _depth, {_found, 0} = acc), do: acc

  defp visit(name, dir, rel, depth, {found, budget} = acc) do
    if hidden?(name) or name in @skip_dirs do
      acc
    else
      full = Path.join(dir, name)
      relative = if rel == "", do: name, else: rel <> "/" <> name

      # lstat, not stat: a symlink is never followed. That both bounds the walk
      # against cycles and keeps a link out of the root from surfacing files the
      # editor would refuse to open anyway.
      case File.lstat(full, time: :posix) do
        {:ok, %File.Stat{type: :directory}} ->
          crawl(full, relative, depth - 1, {found, budget - 1})

        {:ok, %File.Stat{type: :regular, mtime: mtime}} ->
          if markdown?(name),
            do: {[%{name: name, path: relative, mtime: mtime} | found], budget - 1},
            else: {found, budget - 1}

        _ ->
          {found, budget - 1}
      end
    end
  end

  @doc """
  Reads an image a document references, confined to the same root.

  Returns `{:ok, mime, binary}`. The extension allowlist is what stops this from
  being a general file-read endpoint: without it, `/api/image?path=../../.ssh/id_rsa`
  would be served as an image and read perfectly well by the caller.
  """
  @spec read_image(String.t()) :: {:ok, String.t(), binary()} | {:error, atom()}
  def read_image(path) do
    path
    |> image_candidates()
    |> Enum.reduce_while({:error, :enoent}, fn candidate, _last ->
      case load_image(candidate) do
        {:ok, _mime, _bytes} = ok -> {:halt, ok}
        error -> {:cont, error}
      end
    end)
  end

  # A leading "/" in a document is ambiguous: authors write `/logo.svg` meaning
  # "the root of my document tree", and also paste real absolute paths like
  # `/Users/me/notes/logo.svg`. Root-relative is tried first because it is the
  # common authoring convention; the literal path is tried second and still has to
  # survive the root check, so neither reading widens what can be read.
  defp image_candidates("/" <> rest = path), do: [Path.join(root(), rest), path]
  defp image_candidates(path), do: [path]

  defp load_image(path) do
    with {:ok, abs} <- safe_path(path),
         {:ok, mime} <- image_type(abs),
         {:ok, bytes} <- File.read(abs) do
      {:ok, mime, bytes}
    end
  end

  defp image_type(path) do
    case Map.fetch(@image_types, path |> Path.extname() |> String.downcase()) do
      {:ok, mime} -> {:ok, mime}
      :error -> {:error, :unsupported_extension}
    end
  end

  defp check_extension(path) do
    if markdown?(path), do: :ok, else: {:error, :unsupported_extension}
  end
end
