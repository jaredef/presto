defmodule PrestoEngine.Resolvers.IncludeResolver do
  @moduledoc """
  Resolves <htx:include src="path" /> directives.
  Recursive with max depth 10. Path traversal rejected.
  """

  @max_depth 10
  @include_pattern ~r/<htx:include\s+src\s*=\s*"([^"]+)"\s*\/>/

  def resolve(html, current_file, depth \\ 0)

  def resolve(html, _current_file, depth) when depth >= @max_depth, do: html

  def resolve(html, current_file, depth) do
    Regex.replace(@include_pattern, html, fn _full, src ->
      case resolve_path(src, current_file) do
        {:ok, file_path} ->
          case File.read(file_path) do
            {:ok, content} -> resolve(content, file_path, depth + 1)
            _ -> ""
          end

        :error ->
          ""
      end
    end)
  end

  defp resolve_path(src, current_file) do
    if String.contains?(src, "..") do
      :error
    else
      template_dir = PrestoEngine.Router.template_dir()

      path =
        if String.starts_with?(src, "/") do
          # Absolute from template root
          Path.join(template_dir, String.trim_leading(src, "/"))
        else
          # Relative to current file
          current_dir = Path.dirname(current_file)
          Path.join(current_dir, src)
        end

      {:ok, path}
    end
  end
end
