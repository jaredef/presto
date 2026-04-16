defmodule PrestoEngine.Resolvers.ComponentResolver do
  @moduledoc """
  Resolves <htx:component src="path" prop="val">slot</htx:component>.
  Parses htx:props defaults, overrides with passed attrs, replaces {{ prop }} syntax,
  injects slot content at <htx:slot />, extracts htx:script bodies.
  """

  @component_pattern ~r/<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>)/
  @props_pattern ~r/<htx:props>([\s\S]*?)<\/htx:props>/
  @slot_pattern ~r/<htx:slot\s*\/>/
  @script_pattern ~r/<htx:script>([\s\S]*?)<\/htx:script>/
  @prop_sub_pattern ~r/\{\{\s*(\w+)\s*\}\}/

  def resolve(html, current_file, script_collector) do
    Regex.replace(@component_pattern, html, fn _full, src, attrs_str, slot_content ->
      slot_content = slot_content || ""

      case resolve_component_path(src, current_file) do
        {:ok, file_path} ->
          case File.read(file_path) do
            {:ok, component_html} ->
              process_component(component_html, attrs_str, slot_content, file_path, script_collector)

            _ ->
              ""
          end

        :error ->
          ""
      end
    end)
  end

  defp process_component(component_html, attrs_str, slot_content, _file_path, script_collector) do
    # Parse default props
    defaults = parse_props_defaults(component_html)

    # Parse passed attributes
    passed = parse_attrs(attrs_str)

    # Merge: passed overrides defaults
    props = Map.merge(defaults, passed)

    # Strip htx:props block
    html = Regex.replace(@props_pattern, component_html, "")

    # Extract htx:script blocks
    scripts = Regex.scan(@script_pattern, html) |> Enum.map(fn [_, body] -> body end)
    html = Regex.replace(@script_pattern, html, "")

    # Replace {{ prop }} placeholders
    html = Regex.replace(@prop_sub_pattern, html, fn _full, prop_name ->
      Map.get(props, prop_name, "")
    end)

    # Inject slot content at <htx:slot />
    html = Regex.replace(@slot_pattern, html, fn _ -> slot_content end)

    # Push scripts to collector with IIFE wrapping
    if script_collector && scripts != [] do
      component_id = "htx-#{:erlang.unique_integer([:positive])}"

      Enum.each(scripts, fn script_body ->
        wrapped = """
        <script data-htx-id="#{component_id}">
        (function() {
        #{String.trim(script_body)}
        })();
        </script>
        """

        Agent.update(script_collector, fn scripts -> [wrapped | scripts] end)
      end)
    end

    html
  end

  defp parse_props_defaults(html) do
    case Regex.run(@props_pattern, html) do
      [_, content] ->
        content
        |> String.split("\n", trim: true)
        |> Enum.reduce(%{}, fn line, acc ->
          line = String.trim(line)

          case Regex.run(~r/^(\w+)\s*=\s*"([^"]*)"/, line) do
            [_, key, value] -> Map.put(acc, key, value)
            _ -> acc
          end
        end)

      _ ->
        %{}
    end
  end

  defp parse_attrs(attrs_str) when is_binary(attrs_str) do
    Regex.scan(~r/(\w+)\s*=\s*"([^"]*)"/, attrs_str)
    |> Enum.reduce(%{}, fn [_, key, value], acc ->
      if key != "src", do: Map.put(acc, key, value), else: acc
    end)
  end

  defp parse_attrs(_), do: %{}

  defp resolve_component_path(src, current_file) do
    if String.contains?(src, "..") do
      :error
    else
      template_dir = PrestoEngine.Router.template_dir()

      path =
        if String.starts_with?(src, "/") do
          Path.join(template_dir, String.trim_leading(src, "/"))
        else
          current_dir = Path.dirname(current_file)
          Path.join(current_dir, src)
        end

      {:ok, path}
    end
  end
end
