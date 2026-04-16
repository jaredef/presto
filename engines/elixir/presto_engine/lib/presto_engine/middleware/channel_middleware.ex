defmodule PrestoEngine.Middleware.ChannelMiddleware do
  @moduledoc """
  Channel API middleware.
  Routes /api/channel/{module}/{path} with Bearer token validation.
  Token must have valid signature, not be expired, and scope must match channel:{module}.
  """

  alias PrestoEngine.Token

  def handle(conn, module_name, sub_path) do
    case extract_bearer(conn) do
      nil ->
        {:error, 401, %{error: "Missing or invalid Authorization header"}}

      token ->
        case Token.verify(token) do
          {:ok, payload} ->
            expected_scope = "channel:#{module_name}"
            actual_scope = Map.get(payload, "scope", "")

            if actual_scope == expected_scope do
              handler = PrestoEngine.ModuleRegistry.get_channel_handler(module_name)

              if handler do
                user_id = Map.get(payload, "sub", "anonymous")
                query = parse_query(conn)
                method = conn.method
                body = parse_body(conn)

                result = handler.handle(sub_path, query, user_id, %{method: method, body: body})
                {:ok, result}
              else
                {:error, 404, %{error: "No handler for module: #{module_name}"}}
              end

            else
              {:error, 403, %{error: "Scope mismatch. Expected #{expected_scope}, got #{actual_scope}"}}
            end

          {:error, :expired} ->
            {:error, 401, %{error: "Token expired"}}

          {:error, _} ->
            {:error, 401, %{error: "Invalid token"}}
        end
    end
  end

  defp extract_bearer(conn) do
    case Plug.Conn.get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> String.trim(token)
      _ -> nil
    end
  end

  defp parse_query(conn) do
    conn.query_params || %{}
  end

  defp parse_body(conn) do
    case conn.body_params do
      %Plug.Conn.Unfetched{} -> %{}
      params -> params || %{}
    end
  end
end
