defmodule PrestoEngine.Resolvers.GrantResolver do
  @moduledoc """
  Resolves <htx:grant type="T" as="var" />.
  Materializes scoped, signed, time-limited credentials.
  Types: websocket, channel, asset.
  """

  alias PrestoEngine.Token

  @grant_pattern ~r/<htx:grant\s+([^>]*)\/>/

  def resolve(html, context) do
    matches = Regex.scan(@grant_pattern, html)

    new_context =
      Enum.reduce(matches, context, fn [_full, attrs_str], ctx ->
        attrs = parse_attrs(attrs_str)
        type = Map.get(attrs, "type")
        as_name = Map.get(attrs, "as", type)

        credential = materialize(type, attrs, ctx)

        if credential do
          Map.put(ctx, as_name, credential)
        else
          ctx
        end
      end)

    html = Regex.replace(@grant_pattern, html, "")
    {html, new_context}
  end

  defp materialize("websocket", _attrs, _ctx) do
    token = Token.sign(%{"sub" => "anonymous", "scope" => "websocket", "jti" => random_id()}, ttl: 120)
    %{"token" => token, "type" => "websocket"}
  end

  defp materialize("channel", attrs, _ctx) do
    module = Map.get(attrs, "module", "default")
    scope = "channel:#{module}"
    token = Token.sign(%{"sub" => "anonymous", "scope" => scope, "jti" => random_id()}, ttl: 120)
    %{"token" => token, "type" => "channel", "module" => module}
  end

  defp materialize("asset", attrs, _ctx) do
    path = Map.get(attrs, "path", "/")
    signed_url = Token.sign_url(path)
    %{"url" => signed_url, "type" => "asset"}
  end

  defp materialize(_, _, _), do: nil

  defp parse_attrs(attrs_str) do
    Regex.scan(~r/(\w[\w-]*)\s*=\s*"([^"]*)"/, attrs_str)
    |> Enum.reduce(%{}, fn [_, key, value], acc ->
      Map.put(acc, key, value)
    end)
  end

  defp random_id do
    :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)
  end
end
