defmodule PrestoEngine.Resolvers.MutationHandler do
  @moduledoc """
  Two-phase mutations.
  Prepare (GET): <htx:action> generates signed tokens, stored in $actions.
  Execute (POST): Verify token, route to adapter.
  """

  alias PrestoEngine.Token

  @action_pattern ~r/<htx:action\s+([^>]*)\/>/

  def prepare(html, context) do
    matches = Regex.scan(@action_pattern, html)

    actions =
      Enum.reduce(matches, %{}, fn [_full, attrs_str], acc ->
        attrs = parse_attrs(attrs_str)
        name = Map.get(attrs, "name", "default")
        type = Map.get(attrs, "type", "")

        # Resolve {htx:} bindings in record attribute
        record_id = Map.get(attrs, "record", "")
        record_id = resolve_attr_bindings(record_id, context)

        payload = %{"action" => name, "type" => type, "recordId" => record_id}
        token = Token.sign(payload, ttl: 3600)

        Map.put(acc, name, %{"token" => token, "action" => name, "type" => type, "recordId" => record_id})
      end)

    new_context = Map.put(context, "$actions", actions)
    html = Regex.replace(@action_pattern, html, "")

    {html, new_context}
  end

  def execute(token, adapter) do
    case Token.verify(token) do
      {:ok, payload} ->
        action = Map.get(payload, "action")
        type = Map.get(payload, "type")
        record_id = Map.get(payload, "recordId")

        case action do
          "create" -> {:ok, adapter.create(type, %{})}
          "update" -> {:ok, adapter.update(type, record_id, %{})}
          "delete" -> {:ok, adapter.delete(type, record_id)}
          _ -> {:error, :unknown_action}
        end

      error ->
        error
    end
  end

  def execute(token, adapter, body) do
    case Token.verify(token) do
      {:ok, payload} ->
        action = Map.get(payload, "action")
        type = Map.get(payload, "type")
        record_id = Map.get(payload, "recordId")

        case action do
          "create" -> {:ok, adapter.create(type, body)}
          "update" -> {:ok, adapter.update(type, record_id, body)}
          "delete" -> {:ok, adapter.delete(type, record_id)}
          _ -> {:error, :unknown_action}
        end

      error ->
        error
    end
  end

  defp resolve_attr_bindings(str, context) do
    Regex.replace(~r/\{htx:([^}]+)\}/, str, fn _full, path ->
      case PrestoEngine.Expression.resolve_path(String.trim(path), context) do
        nil -> ""
        val -> to_string(val)
      end
    end)
  end

  defp parse_attrs(attrs_str) do
    Regex.scan(~r/([\w-]+)\s*=\s*"([^"]*)"/, attrs_str)
    |> Enum.reduce(%{}, fn [_, key, value], acc ->
      Map.put(acc, key, value)
    end)
  end
end
