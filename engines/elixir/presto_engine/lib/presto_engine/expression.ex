defmodule PrestoEngine.Expression do
  @moduledoc """
  Expression engine for htx:v tags and {htx:} attribute bindings.
  Supports path resolution with dot notation and pipes.
  Protects <script> and <htx:raw> blocks from evaluation.
  """

  alias PrestoEngine.HTML

  @script_pattern ~r/<script(\s[^>]*)?>[\s\S]*?<\/script>/i
  @raw_pattern ~r/<htx:raw(?:\s[^>]*)?>[\s\S]*?<\/htx:raw>/i
  @htx_v_pattern ~r/<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>)/
  @htx_attr_pattern ~r/\{htx:([^}]+)\}/

  def evaluate(html, context) do
    {protected, markers} = protect_blocks(html)
    result = protected
    |> evaluate_htx_v(context)
    |> evaluate_htx_attrs(context)
    restore_blocks(result, markers)
  end

  def evaluate_htx_v(html, context) do
    Regex.replace(@htx_v_pattern, html, fn _full, raw_attr, path_attr, path_content ->
      is_raw = raw_attr != nil and String.trim(raw_attr) != ""
      path = if path_attr != nil and path_attr != "", do: path_attr, else: path_content || ""
      path = String.trim(path)
      value = resolve_path_with_pipes(path, context)

      if is_raw do
        stringify(value)
      else
        HTML.escape(stringify(value))
      end
    end)
  end

  def evaluate_htx_attrs(html, context) do
    Regex.replace(@htx_attr_pattern, html, fn _full, path ->
      path = String.trim(path)
      value = resolve_path_with_pipes(path, context)
      HTML.escape(stringify(value))
    end)
  end

  def resolve_path(path, context) when is_binary(path) do
    path = String.trim(path)

    if path == "" do
      nil
    else
      keys = String.split(path, ".")
      walk(keys, context)
    end
  end

  def resolve_path_with_pipes(expr, context) do
    case String.split(expr, "|", parts: 2) do
      [path] ->
        resolve_path(String.trim(path), context)

      [path, pipe] ->
        value = resolve_path(String.trim(path), context)
        apply_pipe(value, String.trim(pipe))
    end
  end

  def truthy?(nil), do: false
  def truthy?(false), do: false
  def truthy?(0), do: false
  def truthy?(""), do: false
  def truthy?([]), do: false
  def truthy?(_), do: true

  defp walk([], value), do: value
  defp walk(_keys, nil), do: nil
  defp walk([key | rest], map) when is_map(map) do
    val = Map.get(map, key) || Map.get(map, String.to_atom(key))
    walk(rest, val)
  end
  defp walk(_, _), do: nil

  defp apply_pipe(value, "uppercase"), do: value |> stringify() |> String.upcase()
  defp apply_pipe(value, "lowercase"), do: value |> stringify() |> String.downcase()
  defp apply_pipe(value, "capitalize"), do: value |> stringify() |> capitalize()
  defp apply_pipe(value, "trim"), do: value |> stringify() |> String.trim()
  defp apply_pipe(value, "length") when is_list(value), do: length(value)
  defp apply_pipe(value, "length"), do: value |> stringify() |> String.length()
  defp apply_pipe(value, "json"), do: Jason.encode!(value)
  defp apply_pipe(value, _), do: value

  defp capitalize(<<first::utf8, rest::binary>>), do: String.upcase(<<first::utf8>>) <> rest
  defp capitalize(""), do: ""

  defp stringify(nil), do: ""
  defp stringify(value) when is_binary(value), do: value
  defp stringify(value) when is_number(value), do: to_string(value)
  defp stringify(value) when is_atom(value), do: to_string(value)
  defp stringify(value) when is_list(value), do: Jason.encode!(value)
  defp stringify(value) when is_map(value), do: Jason.encode!(value)

  defp protect_blocks(html) do
    {html, markers} = protect_pattern(html, @raw_pattern, "RAW", [])
    {html, markers2} = protect_pattern(html, @script_pattern, "SCRIPT", [])
    {html, markers ++ markers2}
  end

  defp protect_pattern(html, pattern, prefix, acc) do
    case Regex.run(pattern, html, return: :index) do
      [{start, len}] ->
        marker = "___PRESTO_#{prefix}_#{:erlang.unique_integer([:positive])}___"
        block = String.slice(html, start, len)
        new_html = String.slice(html, 0, start) <> marker <> String.slice(html, start + len, String.length(html))
        protect_pattern(new_html, pattern, prefix, [{marker, block} | acc])

      _ ->
        {html, acc}
    end
  end

  defp restore_blocks(html, markers) do
    Enum.reduce(markers, html, fn {marker, block}, acc ->
      String.replace(acc, marker, block)
    end)
  end
end
