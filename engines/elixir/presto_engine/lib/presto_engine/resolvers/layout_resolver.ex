defmodule PrestoEngine.Resolvers.LayoutResolver do
  @moduledoc """
  Layout wrapping. Walks from file directory to template root collecting _layout.htx files.
  Stops at doctype. Replaces __content__. htx:layout directive overrides walk.
  HX-Request header skips root layout.
  """

  @layout_pattern ~r/<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:\/>|><\/htx:layout>)/i

  def extract_layout_directive(html) do
    case Regex.run(@layout_pattern, html) do
      [_full, src] when is_binary(src) and src != "" ->
        {:src, src}

      [_full, "", "none"] ->
        :none

      [_full, _] ->
        :default

      nil ->
        :default
    end
  end

  def strip_layout_directive(html) do
    Regex.replace(@layout_pattern, html, "")
  end

  def wrap(content, template_file, layout_directive, opts \\ []) do
    is_hx_request = Keyword.get(opts, :hx_request, false)

    case layout_directive do
      :none ->
        content

      {:src, src} ->
        apply_explicit_layout(content, src)

      :default ->
        apply_walk_layout(content, template_file, is_hx_request)
    end
  end

  defp apply_explicit_layout(content, src) do
    template_dir = PrestoEngine.Router.template_dir()
    layout_path = Path.join(template_dir, String.trim_leading(src, "/"))

    case File.read(layout_path) do
      {:ok, layout_html} ->
        String.replace(layout_html, "__content__", content)

      _ ->
        content
    end
  end

  defp apply_walk_layout(content, template_file, is_hx_request) do
    template_dir = PrestoEngine.Router.template_dir() |> Path.expand()
    file_dir = Path.dirname(template_file) |> Path.expand()

    layouts = collect_layouts(file_dir, template_dir, [])

    # If HX-Request, skip the root layout (the last one collected)
    layouts =
      if is_hx_request and length(layouts) > 0 do
        List.delete_at(layouts, -1)
      else
        layouts
      end

    # Apply layouts from innermost to outermost
    Enum.reduce(layouts, content, fn layout_html, acc ->
      String.replace(layout_html, "__content__", acc)
    end)
  end

  defp collect_layouts(dir, root, acc) do
    layout_path = Path.join(dir, "_layout.htx")

    acc =
      if File.exists?(layout_path) do
        case File.read(layout_path) do
          {:ok, content} ->
            # If layout has doctype, it's the outermost — stop after this
            acc ++ [content]

          _ ->
            acc
        end
      else
        acc
      end

    # Check if last layout has doctype — if so, stop
    has_doctype = case List.last(acc) do
      nil -> false
      content -> String.contains?(String.downcase(content), "<!doctype")
    end

    if has_doctype or dir == root or Path.dirname(dir) == dir do
      acc
    else
      collect_layouts(Path.dirname(dir), root, acc)
    end
  end
end
