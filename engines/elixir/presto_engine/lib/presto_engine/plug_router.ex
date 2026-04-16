defmodule PrestoEngine.PlugRouter do
  @moduledoc """
  HTTP router using Plug. Handles static files, channel API, mutation POST,
  and template resolution via the 22-stage pipeline.
  """

  use Plug.Router

  plug Plug.Logger
  plug :match

  plug Plug.Parsers,
    parsers: [:urlencoded, :json],
    pass: ["*/*"],
    json_decoder: Jason

  plug :dispatch

  # Stage 1: Static file serving
  get "/public/*path" do
    file_path = Path.join("public", Enum.join(path, "/"))

    if File.exists?(file_path) and not String.contains?(file_path, "..") do
      send_file(conn, 200, file_path)
    else
      send_resp(conn, 404, "Not Found")
    end
  end

  # Stage 2: Channel API
  match "/api/channel/:module/*path" do
    sub_path = Enum.join(path, "/")

    case PrestoEngine.Middleware.ChannelMiddleware.handle(conn, module, sub_path) do
      {:ok, %{status: status, data: data}} ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(status, Jason.encode!(data))

      {:ok, result} when is_map(result) ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(200, Jason.encode!(result))

      {:error, status, body} ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(status, Jason.encode!(body))
    end
  end

  # Mutation POST handler
  post "/*path" do
    request_path = "/" <> Enum.join(path, "/")

    # Check for action token
    token = conn.body_params["_token"]

    if token do
      adapter = PrestoEngine.Adapters.SQLiteAdapter
      body = Map.drop(conn.body_params, ["_token"])

      case PrestoEngine.Resolvers.MutationHandler.execute(token, adapter, body) do
        {:ok, result} ->
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(200, Jason.encode!(%{ok: true, result: result}))

        {:error, :invalid_signature} ->
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(403, Jason.encode!(%{error: "Invalid token"}))

        {:error, :expired} ->
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(403, Jason.encode!(%{error: "Token expired"}))

        {:error, reason} ->
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(400, Jason.encode!(%{error: to_string(reason)}))
      end
    else
      # No token — try to render the template as a page
      render_template(conn, request_path)
    end
  end

  # Template rendering for GET requests
  get "/*path" do
    request_path = "/" <> Enum.join(path, "/")
    render_template(conn, request_path)
  end

  match _ do
    send_resp(conn, 404, "Not Found")
  end

  defp render_template(conn, request_path) do
    case PrestoEngine.Router.resolve(request_path) do
      {:ok, template_file, params} ->
        # Build context from params, cookies, auth
        auth_context = build_auth_context(conn)
        is_hx = hx_request?(conn)

        context =
          %{"params" => params}
          |> Map.merge(params)
          |> Map.put("auth", auth_context)

        case PrestoEngine.Pipeline.run(template_file,
          context: context,
          request: conn,
          hx_request: is_hx
        ) do
          {:ok, html} ->
            conn
            |> put_resp_content_type("text/html")
            |> send_resp(200, html)

          {:error, _reason} ->
            send_resp(conn, 500, "Internal Server Error")
        end

      {:error, :not_found} ->
        send_resp(conn, 404, "Not Found")
    end
  end

  defp build_auth_context(conn) do
    # Simple cookie-based auth for demo
    cookies = parse_cookies(conn)
    user_name = Map.get(cookies, "user_name")
    user_role = Map.get(cookies, "user_role")

    if user_name do
      %{"user" => %{"name" => user_name, "role" => user_role || "user"}}
    else
      %{"user" => nil}
    end
  end

  defp parse_cookies(conn) do
    case Plug.Conn.get_req_header(conn, "cookie") do
      [cookie_str] ->
        cookie_str
        |> String.split(";")
        |> Enum.map(&String.trim/1)
        |> Enum.reduce(%{}, fn pair, acc ->
          case String.split(pair, "=", parts: 2) do
            [key, value] -> Map.put(acc, key, URI.decode(value))
            _ -> acc
          end
        end)

      _ ->
        %{}
    end
  end

  defp hx_request?(conn) do
    case Plug.Conn.get_req_header(conn, "hx-request") do
      ["true"] -> true
      _ -> false
    end
  end
end
