defmodule PrestoEngine.Resolvers.ControlFlow do
  @moduledoc """
  Handles htx:each iteration and htx:if/htx:else conditionals.
  Each iteration creates a child context with $index, $first, $last.
  Evaluates expressions within each item scope.
  """

  alias PrestoEngine.Expression

  @each_pattern ~r/<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)<\/htx:each>/
  @empty_pattern ~r/<htx:empty\s*\/?>/
  @if_pattern ~r/<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)<\/htx:if>(?:\s*<htx:else\s*>([\s\S]*?)<\/htx:else>)?/

  def resolve(html, context) do
    html
    |> resolve_each(context)
    |> resolve_if(context)
  end

  def resolve_each(html, context) do
    Regex.replace(@each_pattern, html, fn _full, items_path, as_name, body ->
      items = Expression.resolve_path(items_path, context)

      case items do
        items when is_list(items) and length(items) > 0 ->
          count = length(items)

          items
          |> Enum.with_index()
          |> Enum.map(fn {item, index} ->
            child_context =
              context
              |> Map.put(as_name, item)
              |> Map.put("$index", index)
              |> Map.put("$first", index == 0)
              |> Map.put("$last", index == count - 1)

            # Split body at htx:empty — only use the part before it
            {item_body, _empty_body} = split_at_empty(body)

            # Evaluate expressions within the item context
            item_body
            |> resolve_each(child_context)
            |> resolve_if(child_context)
            |> Expression.evaluate(child_context)
          end)
          |> Enum.join("")

        _ ->
          # Empty or nil — render the htx:empty section
          {_item_body, empty_body} = split_at_empty(body)
          empty_body
      end
    end)
  end

  def resolve_if(html, context) do
    Regex.replace(@if_pattern, html, fn
      _full, test_path, if_content, else_content ->
        value = Expression.resolve_path(test_path, context)

        if Expression.truthy?(value) do
          if_content
          |> resolve_if(context)
          |> Expression.evaluate(context)
        else
          (else_content || "")
          |> resolve_if(context)
          |> Expression.evaluate(context)
        end
    end)
  end

  defp split_at_empty(body) do
    case Regex.split(@empty_pattern, body, parts: 2) do
      [item_body, empty_body] -> {item_body, empty_body}
      [item_body] -> {item_body, ""}
    end
  end
end
