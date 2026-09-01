defmodule Markdn.Documents do
  @moduledoc """
  Reading, writing and listing markdown documents under a confined root.

  Every path that arrives from the webview or from an MCP client is untrusted, so
  each one is resolved and then checked to be inside `root/0` before any file
  operation runs. `Path.expand/2` collapses `..` segments *before* the check, so
  `../../.ssh/id_rsa` is rejected rather than followed.
  """

  @extensions ~w(.md .markdown .mdx)

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

  @doc "Root directory the document API is confined to."
  @spec root() :: String.t()
  def root do
    Application.get_env(:markdn, :root) || System.user_home!()
  end

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
        |> Enum.reject(&String.starts_with?(&1, "."))
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
