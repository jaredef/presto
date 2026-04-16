defmodule PrestoEngine.Resolvers.DataResolver do
  @moduledoc """
  Resolves <htx:data type="T" where="W" order="O" limit="N" as="var" />.
  Queries the content adapter and injects results into context.
  """

  @data_pattern ~r/<htx:data\s+([^>]*)\/>/

  def resolve(html, context, adapter) do
    # Find all htx:data directives and process them
    matches = Regex.scan(@data_pattern, html)

    new_context =
      Enum.reduce(matches, context, fn [_full, attrs_str], ctx ->
        attrs = parse_attrs(attrs_str)
        type = Map.get(attrs, "type")
        as_name = Map.get(attrs, "as", type)

        if type do
          results =
            if Map.has_key?(attrs, "slug") do
              adapter.get(type, %{"slug" => Map.get(attrs, "slug")})
            else
              query = %{type: type}
              query = if attrs["where"], do: Map.put(query, :where, attrs["where"]), else: query
              query = if attrs["order"], do: Map.put(query, :order, attrs["order"]), else: query
              query = if attrs["limit"], do: Map.put(query, :limit, String.to_integer(attrs["limit"])), else: query
              query = if attrs["offset"], do: Map.put(query, :offset, String.to_integer(attrs["offset"])), else: query
              adapter.query(query)
            end

          Map.put(ctx, as_name, results)
        else
          ctx
        end
      end)

    # Strip the data directives
    html = Regex.replace(@data_pattern, html, "")

    {html, new_context}
  end

  defp parse_attrs(attrs_str) do
    Regex.scan(~r/(\w+)\s*=\s*"([^"]*)"/, attrs_str)
    |> Enum.reduce(%{}, fn [_, key, value], acc ->
      Map.put(acc, key, value)
    end)
  end
end
