defmodule PrestoEngineTest do
  use ExUnit.Case

  alias PrestoEngine.{Token, Expression, Pipeline}
  alias PrestoEngine.Resolvers.{
    IncludeResolver,
    ComponentResolver,
    ControlFlow,
    GrantResolver,
    MutationHandler,
    AuthConditionals
  }

  @template_dir "templates"

  setup_all do
    # Ensure the app is started for SQLite adapter + ModuleRegistry
    Application.ensure_all_started(:presto_engine)
    :ok
  end

  # ─── Test 1: Home page renders with layout ───
  test "1. home page renders with layout" do
    {:ok, html} = Pipeline.run(Path.join(@template_dir, "index.htx"),
      context: %{"auth" => %{"user" => nil}})

    assert html =~ "<!DOCTYPE html>"
    assert html =~ "<body>"
    assert html =~ "</body>"
    assert html =~ "Recent Posts"
  end

  # ─── Test 2: 404 for missing route ───
  test "2. 404 for missing route" do
    result = PrestoEngine.Router.resolve("/this-page-does-not-exist")
    assert result == {:error, :not_found}
  end

  # ─── Test 3: Dynamic [slug] resolves with params ───
  test "3. dynamic [slug] resolves with params" do
    result = PrestoEngine.Router.resolve("/blog/first-post")
    assert {:ok, path, params} = result
    assert path =~ "[slug].htx"
    assert params["slug"] == "first-post"
  end

  # ─── Test 4: Include expands partial ───
  test "4. include expands partial" do
    html = "<htx:include src=\"/partials/nav.htx\" />\n<p>Content</p>"
    result = IncludeResolver.resolve(html, Path.join(@template_dir, "index.htx"))
    assert result =~ "<nav>Home | About</nav>"
    assert result =~ "<p>Content</p>"
    refute result =~ "htx:include"
  end

  # ─── Test 5: Component renders with props + slot ───
  test "5. component renders with props + slot" do
    html = "<htx:component src=\"components/card.htx\" title=\"Hello\">\n  <p>Slot content here.</p>\n</htx:component>"
    {:ok, collector} = Agent.start_link(fn -> [] end)
    result = ComponentResolver.resolve(html, Path.join(@template_dir, "index.htx"), collector)
    Agent.stop(collector)

    assert result =~ "<h3>Hello</h3>"
    assert result =~ "<p>Slot content here.</p>"
    assert result =~ "class=\"card\""
    refute result =~ "htx:props"
    refute result =~ "htx:slot"
  end

  # ─── Test 6: htx:v resolves, pipes work, HTML escaped ───
  test "6. htx:v resolves, pipes work, HTML escaped" do
    # Basic resolve
    html = "<p><htx:v>name</htx:v></p>"
    result = Expression.evaluate(html, %{"name" => "Jared"})
    assert result == "<p>Jared</p>"

    # Pipe
    html = "<span><htx:v>title | uppercase</htx:v></span>"
    result = Expression.evaluate(html, %{"title" => "presto"})
    assert result == "<span>PRESTO</span>"

    # HTML escaping
    html = "<p><htx:v>content</htx:v></p>"
    result = Expression.evaluate(html, %{"content" => "<script>alert('xss')</script>"})
    assert result == "<p>&lt;script&gt;alert('xss')&lt;/script&gt;</p>"
  end

  # ─── Test 7: htx:v raw outputs unescaped ───
  test "7. htx:v raw outputs unescaped" do
    html = "<div><htx:v raw>html</htx:v></div>"
    result = Expression.evaluate(html, %{"html" => "<b>bold</b>"})
    assert result == "<div><b>bold</b></div>"
  end

  # ─── Test 8: Script blocks untouched by expression engine ───
  test "8. script blocks untouched by expression engine" do
    html = "<p><htx:v>name</htx:v></p>\n<script>var x = \"{{ safe }}\";</script>"
    result = Expression.evaluate(html, %{"name" => "Test"})
    assert result =~ "<p>Test</p>"
    assert result =~ "var x = \"{{ safe }}\""
  end

  # ─── Test 9: htx:raw blocks untouched ───
  test "9. htx:raw blocks untouched" do
    html = "<htx:raw><htx:v>not.evaluated</htx:v></htx:raw>"
    result = Expression.evaluate(html, %{})
    # The raw wrapper is still present after expression eval; stage 22 strips it
    assert result =~ "<htx:v>not.evaluated</htx:v>"
  end

  # ─── Test 10: htx:data + htx:each renders database records ───
  test "10. htx:data + htx:each renders database records" do
    {:ok, html} = Pipeline.run(Path.join(@template_dir, "index.htx"),
      context: %{"auth" => %{"user" => nil}})

    # Should contain post titles from seeded data
    assert html =~ "Third Post"
    assert html =~ "Second Post"
    assert html =~ "First Post"
  end

  # ─── Test 11: htx:if true shows, false hides ───
  test "11. htx:if true shows, false hides" do
    html = "<htx:if test=\"user\"><p>Hello</p></htx:if>"

    # True case
    result = ControlFlow.resolve_if(html, %{"user" => %{"name" => "Jared"}})
    assert result =~ "<p>Hello</p>"

    # False case
    result = ControlFlow.resolve_if(html, %{"user" => nil})
    refute result =~ "<p>Hello</p>"
  end

  # ─── Test 12: htx:else shows when condition false ───
  test "12. htx:else shows when condition false" do
    html = "<htx:if test=\"user\"><p>Hello</p></htx:if><htx:else><p>Sign in</p></htx:else>"

    # True
    result = ControlFlow.resolve_if(html, %{"user" => %{"name" => "Jared"}})
    assert result =~ "<p>Hello</p>"
    refute result =~ "Sign in"

    # False
    result = ControlFlow.resolve_if(html, %{"user" => nil})
    assert result =~ "<p>Sign in</p>"
    refute result =~ "<p>Hello</p>"
  end

  # ─── Test 13: htx:empty renders for empty collection ───
  test "13. htx:empty renders for empty collection" do
    html = "<htx:each items=\"items\" as=\"item\">\n<li><htx:v>item.name</htx:v></li>\n<htx:empty>\n<p>No items.</p>\n</htx:each>"

    result = ControlFlow.resolve_each(html, %{"items" => []})
    assert result =~ "No items."
    refute result =~ "<li>"
  end

  # ─── Test 14: htx:grant materializes signed token ───
  test "14. htx:grant materializes signed token" do
    html = "<htx:grant type=\"channel\" module=\"demo\" as=\"channelGrant\" />"
    {_html, context} = GrantResolver.resolve(html, %{})
    grant = context["channelGrant"]
    assert grant != nil
    assert grant["type"] == "channel"
    assert grant["token"] != nil

    # Verify the token is valid
    {:ok, payload} = Token.verify(grant["token"])
    assert payload["scope"] == "channel:demo"
  end

  # ─── Test 15: htx:auth hides from unauthenticated ───
  test "15. htx:auth hides from unauthenticated" do
    html = "<htx:auth><p>Logged in</p></htx:auth><htx:unauth><p>Please sign in</p></htx:unauth>"
    result = AuthConditionals.resolve(html, %{"auth" => %{"user" => nil}})
    assert result =~ "Please sign in"
    refute result =~ "Logged in"
  end

  # ─── Test 16: htx:layout none = no wrapping ───
  test "16. htx:layout none = no wrapping" do
    File.write!(Path.join(@template_dir, "test-no-layout.htx"),
      "<htx:layout none />\n<h1>Raw</h1>")

    {:ok, html} = Pipeline.run(Path.join(@template_dir, "test-no-layout.htx"),
      context: %{"auth" => %{"user" => nil}})

    assert html =~ "<h1>Raw</h1>"
    refute html =~ "<!DOCTYPE"
    refute html =~ "<body>"

    File.rm(Path.join(@template_dir, "test-no-layout.htx"))
  end

  # ─── Test 17: htx:layout src = explicit layout ───
  test "17. htx:layout src = explicit layout" do
    {:ok, html} = Pipeline.run(Path.join(@template_dir, "custom-layout.htx"),
      context: %{"auth" => %{"user" => nil}})

    assert html =~ "<title>Minimal</title>"
    assert html =~ "Custom Layout Page"
  end

  # ─── Test 18: Channel API 200 with valid token ───
  test "18. channel API 200 with valid token" do
    token = Token.sign(%{"sub" => "user1", "scope" => "channel:demo", "jti" => "test"}, ttl: 120)

    conn =
      Plug.Test.conn(:get, "/api/channel/demo/test-path")
      |> Plug.Conn.put_req_header("authorization", "Bearer #{token}")
      |> Plug.Conn.fetch_query_params()

    conn = PrestoEngine.PlugRouter.call(conn, PrestoEngine.PlugRouter.init([]))
    assert conn.status == 200

    body = Jason.decode!(conn.resp_body)
    assert body["message"] == "Hello from demo channel"
  end

  # ─── Test 19: Channel API 401 with invalid token ───
  test "19. channel API 401 with invalid token" do
    conn =
      Plug.Test.conn(:get, "/api/channel/demo/test")
      |> Plug.Conn.put_req_header("authorization", "Bearer invalid.token")
      |> Plug.Conn.fetch_query_params()

    conn = PrestoEngine.PlugRouter.call(conn, PrestoEngine.PlugRouter.init([]))
    assert conn.status == 401
  end

  # ─── Test 20: Channel API 403 with wrong scope ───
  test "20. channel API 403 with wrong scope" do
    token = Token.sign(%{"sub" => "user1", "scope" => "channel:other", "jti" => "test"}, ttl: 120)

    conn =
      Plug.Test.conn(:get, "/api/channel/demo/test")
      |> Plug.Conn.put_req_header("authorization", "Bearer #{token}")
      |> Plug.Conn.fetch_query_params()

    conn = PrestoEngine.PlugRouter.call(conn, PrestoEngine.PlugRouter.init([]))
    assert conn.status == 403
  end

  # ─── Test 21: Action token roundtrip succeeds ───
  test "21. action token roundtrip succeeds" do
    html = "<htx:action name=\"update\" type=\"post\" record=\"42\" />"
    {_html, context} = MutationHandler.prepare(html, %{})

    actions = context["$actions"]
    assert actions["update"] != nil

    token = actions["update"]["token"]
    assert {:ok, payload} = Token.verify(token)
    assert payload["action"] == "update"
    assert payload["type"] == "post"
    assert payload["recordId"] == "42"
  end

  # ─── Test 22: Tampered action token rejected ───
  test "22. tampered action token rejected" do
    html = "<htx:action name=\"delete\" type=\"post\" record=\"1\" />"
    {_html, context} = MutationHandler.prepare(html, %{})
    token = context["$actions"]["delete"]["token"]

    # Tamper with the token
    [payload_b64, _sig] = String.split(token, ".")
    tampered = payload_b64 <> ".tampered_signature"

    assert {:error, :invalid_signature} = Token.verify(tampered)
  end
end
