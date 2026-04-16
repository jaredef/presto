defmodule PrestoEngine.Router do
  @moduledoc """
  Template router: static, index, and dynamic [param] resolution.
  """

  def template_dir do
    Application.get_env(:presto_engine, :template_dir, "templates")
  end

  def resolve(path) do
    path = normalize_path(path)
    static_path = Path.join(template_dir(), path <> ".htx")
    index_path = Path.join(template_dir(), Path.join(path, "index.htx"))

    cond do
      File.exists?(static_path) ->
        {:ok, static_path, %{}}

      File.exists?(index_path) ->
        {:ok, index_path, %{}}

      true ->
        resolve_dynamic(String.split(path, "/", trim: true), template_dir(), %{})
    end
  end

  defp normalize_path("/"), do: "index"
  defp normalize_path("/" <> rest), do: rest
  defp normalize_path(""), do: "index"
  defp normalize_path(path), do: path

  defp resolve_dynamic([], dir, params) do
    index = Path.join(dir, "index.htx")

    if File.exists?(index) do
      {:ok, index, params}
    else
      {:error, :not_found}
    end
  end

  defp resolve_dynamic([segment | rest], dir, params) do
    # Try exact match first
    exact_file = Path.join(dir, segment <> ".htx")
    exact_dir = Path.join(dir, segment)

    cond do
      rest == [] and File.exists?(exact_file) ->
        {:ok, exact_file, params}

      File.dir?(exact_dir) ->
        resolve_dynamic(rest, exact_dir, params)

      true ->
        # Try dynamic [param] match
        find_dynamic_segment(rest, dir, segment, params)
    end
  end

  defp find_dynamic_segment(rest, dir, segment_value, params) do
    # Look for [param].htx or [param]/ directory
    case File.ls(dir) do
      {:ok, entries} ->
        # Try [param].htx first (when no more segments)
        param_file = Enum.find(entries, fn entry ->
          rest == [] and Regex.match?(~r/^\[.+\]\.htx$/, entry)
        end)

        param_dir = Enum.find(entries, fn entry ->
          Regex.match?(~r/^\[.+\]$/, entry) and File.dir?(Path.join(dir, entry))
        end)

        cond do
          param_file != nil ->
            param_name = param_file
            |> String.trim_leading("[")
            |> String.trim_trailing("].htx")

            {:ok, Path.join(dir, param_file), Map.put(params, param_name, segment_value)}

          param_dir != nil ->
            param_name = param_dir
            |> String.trim_leading("[")
            |> String.trim_trailing("]")

            resolve_dynamic(rest, Path.join(dir, param_dir), Map.put(params, param_name, segment_value))

          true ->
            {:error, :not_found}
        end

      _ ->
        {:error, :not_found}
    end
  end
end
