defmodule Markdn.Documents do
  @moduledoc """
  Reading, writing and listing markdown documents under a confined root.

  Every path that arrives from the webview or from an MCP client is untrusted, so
  each one is resolved and then checked to be inside `root/0` before any file
  operation runs. `Path.expand/2` collapses `..` segments *before* the check, so
  `../../.ssh/id_rsa` is rejected rather than followed — and symlinks are
  resolved before it too, so a link inside the root cannot be a door out of it.
  """

  require Logger

  alias Markdn.DocumentIndex
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
  # walk: dependency, build and cache trees, plus macOS's ~/Library, which is
  # enormous and is not hidden, so the dotfile rule below does not catch it.
  @skip_dirs ~w(node_modules _build deps target dist build coverage vendor
                __pycache__ Pods .git .svn .hg Library)

  # Names that are files and never documents, known from the name alone. In a
  # source tree most entries are these — three in four, in the Supabase
  # monorepo — and each would otherwise cost an `lstat` just to learn it is not
  # a directory to descend into. Inside the packed sidecar an `lstat` crosses
  # the WebAssembly boundary, so these were most of a walk's time, and spent its
  # entry budget before it reached the documents. A directory named like one of
  # these (`types.ts/`) is skipped too; that is the price, and it is a rare one.
  # Ambiguous suffixes a directory really does carry (`socket.io`, `v1.0`,
  # `example.com`) are deliberately not listed.
  @not_documents ~w(
    .ts .tsx .js .jsx .mjs .cjs .mts .cts .vue .svelte .astro .css .scss .sass .less
    .json .jsonc .yaml .yml .toml .lock .sql .graphql .gql .prisma .xml .csv .tsv
    .ex .exs .heex .eex .erl .hrl .rs .go .py .rb .php .java .kt .kts .swift .m .h
    .c .cc .cpp .hpp .cs .dart .lua .sh .bash .zsh .ps1 .tf .hcl .proto
    .png .jpg .jpeg .gif .webp .avif .svg .ico .bmp .tiff .heic .psd
    .mp4 .mov .webm .mp3 .wav .ogg .woff .woff2 .ttf .otf .eot
    .pdf .zip .gz .tgz .tar .wasm .map .snap .log .txt .html .htm .env
  )

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
    pinned_root() || Settings.get("root") || Markdn.Host.home()
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

  The check runs on the path with every symlink resolved, because that is what
  the OS will open: `notes/link.md -> /etc/passwd` names a path inside the root
  and a file outside it. A link that stays inside the root is fine. The path
  handed back is the unresolved one, so relative paths shown in the UI keep the
  names the user sees in the tree.

  Returns `{:ok, absolute_path}` or `{:error, :outside_root}`.
  """
  @spec safe_path(String.t()) :: {:ok, String.t()} | {:error, :outside_root}
  def safe_path(path) when is_binary(path) do
    root = root()
    expanded = Path.expand(path, root)

    # Compare on segments, not string prefixes: "/home/user-evil" has "/home/user"
    # as a string prefix but is a different directory. Both sides are resolved:
    # the root itself may sit behind a link (macOS's /tmp is /private/tmp).
    with true <- inside?(expanded, root),
         {:ok, real} <- real_path(expanded),
         {:ok, real_root} <- real_path(root),
         true <- inside?(real, real_root) do
      {:ok, expanded}
    else
      _ -> {:error, :outside_root}
    end
  end

  def safe_path(_), do: {:error, :outside_root}

  # Enough for any honest chain of links; a loop gives up instead of spinning.
  @max_link_hops 40

  # The path the OS would actually reach, symlinks followed. Elixir has no
  # realpath, so it is walked one segment at a time. `..` inside a link's target
  # is applied to the *resolved* directory, as the kernel does — collapsing it
  # lexically with Path.expand would answer "inside" for `link/..` where the
  # kernel goes to the parent of wherever `link` points. Segments that do not
  # exist yet (a file about to be created) are taken as written.
  defp real_path(path) do
    ["/" | segments] = Path.split(path)
    walk("/", segments, 0)
  end

  defp walk(_dir, _segments, hops) when hops > @max_link_hops, do: {:error, :eloop}
  defp walk(dir, [], _hops), do: {:ok, dir}
  defp walk(dir, ["." | rest], hops), do: walk(dir, rest, hops)
  defp walk(dir, [".." | rest], hops), do: walk(Path.dirname(dir), rest, hops)

  defp walk(dir, [segment | rest], hops) do
    next = Path.join(dir, segment)

    case File.read_link(next) do
      {:ok, target} ->
        {base, target_segments} =
          case Path.split(target) do
            ["/" | absolute] -> {"/", absolute}
            relative -> {dir, relative}
          end

        walk(base, target_segments ++ rest, hops + 1)

      # Not a link, or not there yet: either way it is part of the real path.
      {:error, _} ->
        walk(next, rest, hops)
    end
  end

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
         :ok <- File.mkdir_p(Path.dirname(abs)),
         :ok <- File.write(abs, contents) do
      # A save can create the file, and always moves its mtime — which is the
      # order the palette lists recent documents in.
      indexed([abs])
    end
  end

  def write(_, _), do: {:error, :invalid_contents}

  @doc """
  Creates a new markdown document, refusing to replace one that already exists.

  `write/2` overwrites by design — it is what Save does. Creating is the one
  operation where the user has named a file they believe is not there yet, so an
  existing file at that path is an error (`:eexist`) rather than silently lost.
  The check and the write are one `:exclusive` open, so there is no window
  between them for another writer to land in.

  Returns `{:ok, relative_path}`, the path normalised against the root, which is
  the form the file tree and the open-document state use.
  """
  @spec create(String.t(), String.t()) :: {:ok, String.t()} | {:error, atom()}
  def create(path, contents \\ "")

  def create(path, contents) when is_binary(path) and is_binary(contents) do
    with {:ok, abs} <- safe_path(path),
         :ok <- check_extension(abs),
         :ok <- File.mkdir_p(Path.dirname(abs)),
         :ok <- File.write(abs, contents, [:exclusive]) do
      indexed([abs])
      {:ok, relative(abs)}
    end
  end

  def create(_, _), do: {:error, :invalid_contents}

  @doc """
  Renames (or moves) a markdown document within the root.

  Like `create/2`, an existing file at `to` is an error (`:eexist`), never
  replaced: `rename(2)` itself would overwrite it without a word. Both ends are
  confined to the root and must be markdown, so this cannot turn a note into an
  executable or pull a file in from outside.

  Returns `{:ok, relative_to}`.
  """
  @spec rename(String.t(), String.t()) :: {:ok, String.t()} | {:error, atom()}
  def rename(from, to) when is_binary(from) and is_binary(to) do
    with {:ok, source} <- safe_path(from),
         {:ok, target} <- safe_path(to),
         :ok <- check_extension(source),
         :ok <- check_extension(target),
         :ok <- check_regular(source),
         :ok <- check_free(source, target),
         :ok <- File.mkdir_p(Path.dirname(target)),
         :ok <- File.rename(source, target) do
      indexed([source, target])
      {:ok, relative(target)}
    end
  end

  def rename(_, _), do: {:error, :missing_path}

  # Renaming to the same path, or only changing case on a case-insensitive disk,
  # names the source itself — that is not a collision.
  defp check_free(source, target) do
    cond do
      String.downcase(source) == String.downcase(target) -> :ok
      File.exists?(target) -> {:error, :eexist}
      true -> :ok
    end
  end

  @doc """
  Moves a markdown document to the user's Trash, where it can be restored.

  Never a permanent delete: a right-click is too easy to get wrong for that. The
  move is done by the platform's own trash tool (see `trash_command/0`), with
  the path passed as an argument rather than spliced into a script.
  """
  @spec trash(String.t()) :: :ok | {:error, atom()}
  def trash(path) when is_binary(path) do
    with {:ok, abs} <- safe_path(path),
         :ok <- check_extension(abs),
         :ok <- check_regular(abs),
         :ok <- run_trash(abs) do
      indexed([abs])
    end
  end

  def trash(_), do: {:error, :missing_path}

  defp run_trash(abs) do
    case trash_command() do
      nil ->
        {:error, :trash_unavailable}

      {command, args} ->
        case System.cmd(command, args ++ [abs], stderr_to_stdout: true) do
          {_, 0} ->
            :ok

          {output, status} ->
            Logger.warning("trash of #{abs} failed (#{status}): #{String.trim(output)}")
            {:error, :trash_failed}
        end
    end
  end

  # Overridable through config so tests do not fill the developer's real Trash.
  # macOS 15+ ships /usr/bin/trash (`-s` makes a failed move exit non-zero);
  # older macOS asks Finder, with the path as `argv` so it is never AppleScript
  # source; Linux desktops have `gio trash`.
  defp trash_command do
    Application.get_env(:markdn, :trash_command) || default_trash_command()
  end

  defp default_trash_command do
    cond do
      File.exists?("/usr/bin/trash") ->
        {"/usr/bin/trash", ["-s"]}

      Markdn.Host.os_type() == {:unix, :darwin} ->
        {"osascript",
         [
           "-e",
           "on run argv",
           "-e",
           ~S|tell application "Finder" to delete (POSIX file (item 1 of argv))|,
           "-e",
           "end run"
         ]}

      gio = System.find_executable("gio") ->
        {gio, ["trash"]}

      true ->
        nil
    end
  end

  # Rename and trash act on documents, not on directories or symlinks: a symlink
  # could point anywhere, and a directory takes every document inside with it.
  defp check_regular(abs) do
    case File.lstat(abs) do
      {:ok, %File.Stat{type: :regular}} -> :ok
      {:ok, _} -> {:error, :not_a_document}
      {:error, reason} -> {:error, reason}
    end
  end

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

  @doc """
  `path` as the UI names it: relative to the root, with `.` and `..` resolved.

  An MCP client may write `./notes/a.md` or an absolute path for the file the
  editor has open as `notes/a.md`; save notifications are compared by string, so
  they carry this form.
  """
  @spec relative_path(String.t()) :: {:ok, String.t()} | {:error, :outside_root}
  def relative_path(path) do
    with {:ok, abs} <- safe_path(path), do: {:ok, relative(abs)}
  end

  # Case-insensitive: macOS filesystems are, and `README.MD` is a common name.
  defp markdown?(name), do: String.downcase(Path.extname(name)) in @extensions

  # Dotfiles are noise in a document tree by default, but a notes directory that
  # lives in a dotfolder is a real thing, so it is a setting rather than a rule.
  defp hidden?(name), do: hidden?(name, Settings.get("showHiddenFiles"))
  defp hidden?(name, show_hidden), do: String.starts_with?(name, ".") and not show_hidden

  # What a walk never descends into or lists, decided from the name alone so it
  # costs no `lstat` and nothing from the entry budget. The setting is passed in
  # rather than read per entry: a walk visits thousands of names.
  defp skipped?(name, show_hidden) do
    hidden?(name, show_hidden) or name in @skip_dirs or not_document?(name)
  end

  defp not_document?(name), do: String.downcase(Path.extname(name)) in @not_documents

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

  Answered by `Markdn.DocumentIndex`, which walks once and shares the result:
  inside the packed sidecar a walk costs seconds, and this is asked on every
  keystroke. Public because content search lists the same tree the fuzzy finder
  does — duplicating the brakes in a second module is how the two drift apart.
  """
  @spec walk() :: [%{name: String.t(), path: String.t(), mtime: integer()}]
  def walk, do: DocumentIndex.documents(index_key())

  @doc """
  What a walk depends on: the root, and whether hidden files are shown.

  Changing either is a different list, so the index keys on both.
  """
  @spec index_key() :: DocumentIndex.key()
  def index_key, do: {root(), Settings.get("showHiddenFiles")}

  @doc """
  Walks the tree for `key` — the uncached work behind `walk/0`.

  Bounded by depth and by an entry budget, and never follows a symlink, so the
  cost is the same whether the root is a project checkout or a home directory.
  """
  @spec scan(DocumentIndex.key()) :: [%{name: String.t(), path: String.t(), mtime: integer()}]
  def scan({root, show_hidden}) do
    root
    |> crawl("", @max_depth, show_hidden, {[], @max_entries})
    |> elem(0)
  end

  @doc """
  The index entry for one root-relative `path`, as a walk of `key` would list it.

  `:none` when a walk would not list it: gone, not markdown, a symlink, too deep,
  or under a hidden or skipped directory. This is how a change the app made is
  folded into the index without walking again.
  """
  @spec index_entry(DocumentIndex.key(), String.t()) ::
          {:ok, %{name: String.t(), path: String.t(), mtime: integer()}} | :none
  def index_entry({root, show_hidden}, path) do
    segments = Path.split(path)
    name = List.last(segments)

    # A walk descends @max_depth directories below the root, so a file is listed
    # with at most @max_depth + 1 segments.
    listed? =
      length(segments) <= @max_depth + 1 and markdown?(name) and
        not Enum.any?(segments, &skipped?(&1, show_hidden))

    with true <- listed?,
         {:ok, %File.Stat{type: :regular, mtime: mtime}} <-
           File.lstat(Path.join(root, path), time: :posix) do
      {:ok, %{name: name, path: path, mtime: mtime}}
    else
      _ -> :none
    end
  end

  # Tells the index what the app just changed, by the paths a walk would list.
  defp indexed(abs_paths) do
    DocumentIndex.changed(index_key(), Enum.map(abs_paths, &relative/1))
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

  defp crawl(_dir, _rel, depth, _show_hidden, acc) when depth < 0, do: acc

  defp crawl(dir, rel, depth, show_hidden, acc) do
    case File.ls(dir) do
      {:ok, names} -> Enum.reduce(names, acc, &visit(&1, dir, rel, depth, show_hidden, &2))
      # An unreadable directory (permissions, a dangling mount) must not abort the
      # search — the rest of the tree is still worth returning.
      {:error, _} -> acc
    end
  end

  defp visit(_name, _dir, _rel, _depth, _show_hidden, {_found, 0} = acc), do: acc

  defp visit(name, dir, rel, depth, show_hidden, {found, budget} = acc) do
    if skipped?(name, show_hidden) do
      acc
    else
      full = Path.join(dir, name)
      relative = if rel == "", do: name, else: rel <> "/" <> name

      # lstat, not stat: a symlink is never followed. That both bounds the walk
      # against cycles and keeps a link out of the root from surfacing files the
      # editor would refuse to open anyway.
      case File.lstat(full, time: :posix) do
        {:ok, %File.Stat{type: :directory}} ->
          crawl(full, relative, depth - 1, show_hidden, {found, budget - 1})

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
