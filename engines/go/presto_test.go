package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"presto-go/engine"
)

type testEnv struct {
	engine      *engine.Engine
	adapter     *engine.SQLiteAdapter
	registry    *engine.ModuleRegistry
	templateDir string
	secret      string
}

func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	tmpDir := t.TempDir()
	templateDir := filepath.Join(tmpDir, "templates")
	os.MkdirAll(filepath.Join(templateDir, "partials"), 0755)
	os.MkdirAll(filepath.Join(templateDir, "components"), 0755)
	os.MkdirAll(filepath.Join(templateDir, "blog"), 0755)
	os.MkdirAll(filepath.Join(templateDir, "layouts"), 0755)

	dbPath := filepath.Join(tmpDir, "test.db")
	adapter, err := engine.NewSQLiteAdapter(dbPath)
	if err != nil {
		t.Fatal(err)
	}

	db := adapter.DB()
	db.Exec(`CREATE TABLE post (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT, slug TEXT, body TEXT, status TEXT
	)`)
	db.Exec(`INSERT INTO post (title, slug, body, status) VALUES
		('First', 'first-post', 'Content 1', 'published'),
		('Second', 'second-post', 'Content 2', 'published'),
		('Third', 'third-post', 'Content 3', 'published')`)

	secret := "test-secret-key"
	registry := engine.NewModuleRegistry()
	registry.RegisterChannelHandler(&demoChannelHandler{})
	registry.RegisterContextProvider("auth", &authContextProvider{})

	eng := engine.NewEngine(templateDir, filepath.Join(tmpDir, "public"), secret, adapter, registry)

	return &testEnv{
		engine:      eng,
		adapter:     adapter,
		registry:    registry,
		templateDir: templateDir,
		secret:      secret,
	}
}

func (te *testEnv) writeTemplate(relPath, content string) {
	full := filepath.Join(te.templateDir, relPath)
	os.MkdirAll(filepath.Dir(full), 0755)
	os.WriteFile(full, []byte(content), 0644)
}

func (te *testEnv) resolve(templateRel string, req *engine.HtxRequest) (string, error) {
	return te.engine.Resolve(filepath.Join(te.templateDir, templateRel), req)
}

func noAuthReq() *engine.HtxRequest {
	return &engine.HtxRequest{
		Method:  "GET",
		Path:    "/",
		Headers: map[string]string{},
		Cookies: map[string]string{},
		Params:  map[string]string{},
	}
}

func authReq(name, role string) *engine.HtxRequest {
	return &engine.HtxRequest{
		Method:  "GET",
		Path:    "/",
		Headers: map[string]string{},
		Cookies: map[string]string{"user_name": name, "user_role": role},
		Params:  map[string]string{},
	}
}

// Test 1: Home page renders with layout
func TestHomePageWithLayout(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("_layout.htx", `<!DOCTYPE html><html><body>__content__</body></html>`)
	te.writeTemplate("index.htx", `<h1>Hello</h1>`)

	html, err := te.resolve("index.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<!DOCTYPE html>") {
		t.Error("missing DOCTYPE")
	}
	if !strings.Contains(html, "<h1>Hello</h1>") {
		t.Error("missing content")
	}
	if !strings.Contains(html, "<body>") {
		t.Error("missing layout body")
	}
}

// Test 2: 404 for missing route
func TestMissingRoute404(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	route := engine.ResolveRoute(te.templateDir, "/nonexistent")
	if route.Found {
		t.Error("expected route to not be found")
	}
}

// Test 3: Dynamic [slug] resolves with params
func TestDynamicSlugRoute(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("blog/[slug].htx", `<h1><htx:v>params.slug</htx:v></h1>`)

	route := engine.ResolveRoute(te.templateDir, "/blog/hello-world")
	if !route.Found {
		t.Fatal("route not found")
	}
	if route.Params["slug"] != "hello-world" {
		t.Errorf("expected slug=hello-world, got %s", route.Params["slug"])
	}

	req := noAuthReq()
	req.Params = route.Params
	// Use layout none to avoid layout wrapping complications
	te.writeTemplate("blog/[slug].htx", `<htx:layout none /><h1><htx:v>params.slug</htx:v></h1>`)
	html, err := te.engine.Resolve(route.FilePath, req)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<h1>hello-world</h1>") {
		t.Errorf("expected resolved slug, got: %s", html)
	}
}

// Test 4: Include expands partial
func TestIncludeExpandsPartial(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("partials/nav.htx", `<nav>Home | About</nav>`)
	te.writeTemplate("page.htx", `<htx:layout none /><htx:include src="/partials/nav.htx" /><p>Content</p>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<nav>Home | About</nav>") {
		t.Error("include not expanded")
	}
	if !strings.Contains(html, "<p>Content</p>") {
		t.Error("content missing")
	}
}

// Test 5: Component renders with props + slot
func TestComponentPropsSlot(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("components/card.htx", `<htx:props>
title = "Default"
</htx:props>
<div class="card"><h3>{{ title }}</h3><htx:slot /></div>`)

	te.writeTemplate("page.htx", `<htx:layout none /><htx:component src="components/card.htx" title="Hello">
  <p>Slot content here.</p>
</htx:component>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<h3>Hello</h3>") {
		t.Errorf("prop not substituted, got: %s", html)
	}
	if !strings.Contains(html, "<p>Slot content here.</p>") {
		t.Error("slot content missing")
	}
}

// Test 6: htx:v resolves, pipes work, HTML escaped
func TestExpressionPipesEscape(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:let title="presto" /><span><htx:v>title | uppercase</htx:v></span><p><htx:v>content</htx:v></p>`)

	// We need to inject content with HTML chars via context provider
	// Use a simpler approach: test expression + pipe
	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<span>PRESTO</span>") {
		t.Errorf("pipe not applied, got: %s", html)
	}

	// Test HTML escaping separately
	te.writeTemplate("esc.htx", `<htx:layout none /><htx:let xss="<script>alert('xss')</script>" /><p><htx:v>xss</htx:v></p>`)
	html2, _ := te.resolve("esc.htx", noAuthReq())
	if !strings.Contains(html2, "&lt;script&gt;") {
		t.Errorf("HTML not escaped, got: %s", html2)
	}
}

// Test 7: htx:v raw outputs unescaped
func TestRawOutput(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:let html="<b>bold</b>" /><div><htx:v raw>html</htx:v></div>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<b>bold</b>") {
		t.Errorf("raw not output, got: %s", html)
	}
}

// Test 8: Script blocks untouched by expression engine
func TestScriptBlocksUntouched(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:let name="Test" /><p><htx:v>name</htx:v></p>
<script>var x = "{{ safe }}";</script>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<p>Test</p>") {
		t.Error("expression not resolved")
	}
	if !strings.Contains(html, `var x = "{{ safe }}"`) {
		t.Errorf("script block was modified, got: %s", html)
	}
}

// Test 9: htx:raw blocks untouched
func TestRawBlockUntouched(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:raw><htx:v>not.evaluated</htx:v></htx:raw>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<htx:v>not.evaluated</htx:v>") {
		t.Errorf("raw block was evaluated, got: %s", html)
	}
}

// Test 10: htx:data + htx:each renders database records
func TestDataEachRendersRecords(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:data type="post" where="status = 'published'" order="id desc" limit="3" as="posts" />
<htx:each items="posts" as="post">
<li><htx:v>post.title</htx:v></li>
</htx:each>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<li>Third</li>") {
		t.Errorf("missing Third, got: %s", html)
	}
	if !strings.Contains(html, "<li>Second</li>") {
		t.Error("missing Second")
	}
	if !strings.Contains(html, "<li>First</li>") {
		t.Error("missing First")
	}
}

// Test 11: htx:if true shows, false hides
func TestIfTrue(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:let show="yes" /><htx:if test="show"><p>Visible</p></htx:if>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<p>Visible</p>") {
		t.Errorf("if-true content not shown, got: %s", html)
	}
}

// Test 12: htx:else shows when condition false
func TestIfElse(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	// auth.user is null for unauthenticated
	te.writeTemplate("page.htx", `<htx:layout none /><htx:if test="auth.user">
<p>Hello</p>
</htx:if>
<htx:else>
<p>Sign in</p>
</htx:else>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<p>Sign in</p>") {
		t.Errorf("else not rendered, got: %s", html)
	}
	if strings.Contains(html, "<p>Hello</p>") {
		t.Error("if-true content should be hidden")
	}
}

// Test 13: htx:empty renders for empty collection
func TestEmptyCollection(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:data type="post" where="status = 'nonexistent'" as="items" />
<htx:each items="items" as="item">
<li><htx:v>item.title</htx:v></li>
<htx:empty>
<p>No items.</p>
</htx:each>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<p>No items.</p>") {
		t.Errorf("empty not rendered, got: %s", html)
	}
}

// Test 14: htx:grant materializes signed token
func TestGrantMaterializesToken(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:grant type="channel" module="demo" as="demoToken" /><p><htx:v>demoToken</htx:v></p>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	// Token should be a base64url.base64url format
	if !strings.Contains(html, "<p>") || strings.Contains(html, "<p></p>") {
		t.Errorf("token not materialized, got: %s", html)
	}
	// Extract token and verify it
	start := strings.Index(html, "<p>") + 3
	end := strings.Index(html, "</p>")
	token := html[start:end]
	if !strings.Contains(token, ".") {
		t.Errorf("token format invalid: %s", token)
	}
	payload, err := engine.TokenVerify(token, te.secret)
	if err != nil {
		t.Errorf("token verification failed: %v", err)
	}
	if scope, _ := payload["scope"].(string); scope != "channel:demo" {
		t.Errorf("wrong scope: %s", scope)
	}
}

// Test 15: htx:auth hides from unauthenticated
func TestAuthHidesUnauthenticated(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:auth><p>Logged in</p></htx:auth><htx:unauth><p>Please sign in</p></htx:unauth>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, "Logged in") {
		t.Error("auth content shown to unauthenticated user")
	}
	if !strings.Contains(html, "Please sign in") {
		t.Errorf("unauth content not shown, got: %s", html)
	}
}

// Test 16: htx:layout none = no wrapping
func TestLayoutNone(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("_layout.htx", `<!DOCTYPE html><html><body>__content__</body></html>`)
	te.writeTemplate("page.htx", "<htx:layout none />\n<h1>Raw</h1>")

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, "DOCTYPE") {
		t.Error("layout was applied despite 'none'")
	}
	if !strings.Contains(html, "<h1>Raw</h1>") {
		t.Errorf("content missing, got: %s", html)
	}
}

// Test 17: htx:layout src = explicit layout
func TestLayoutSrc(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("_layout.htx", `<!DOCTYPE html><html><body>__content__</body></html>`)
	te.writeTemplate("layouts/custom.htx", `<!DOCTYPE html><html><head><title>Custom</title></head><body class="custom">__content__</body></html>`)
	te.writeTemplate("page.htx", `<htx:layout src="/layouts/custom.htx" /><h1>Custom</h1>`)

	html, err := te.resolve("page.htx", noAuthReq())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, `class="custom"`) {
		t.Errorf("custom layout not applied, got: %s", html)
	}
	if !strings.Contains(html, "<h1>Custom</h1>") {
		t.Error("content missing")
	}
}

// Test 18: Channel API 200 with valid token
func TestChannelAPI200(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	token, err := engine.GenerateChannelToken("user1", "channel:demo", te.secret)
	if err != nil {
		t.Fatal(err)
	}

	handler := engine.ChannelMiddleware(te.registry, te.secret)
	req := httptest.NewRequest("GET", "/api/channel/demo/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler(w, req)

	resp := w.Result()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, string(body))
	}

	var data map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&data)
}

// Test 19: Channel API 401 with invalid token
func TestChannelAPI401(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	handler := engine.ChannelMiddleware(te.registry, te.secret)
	req := httptest.NewRequest("GET", "/api/channel/demo/test", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != 401 {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// Test 20: Channel API 403 with wrong scope
func TestChannelAPI403WrongScope(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	// Generate token for wrong module
	token, _ := engine.GenerateChannelToken("user1", "channel:other", te.secret)

	handler := engine.ChannelMiddleware(te.registry, te.secret)
	req := httptest.NewRequest("GET", "/api/channel/demo/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != 403 {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

// Test 21: Action token roundtrip succeeds
func TestActionTokenRoundtrip(t *testing.T) {
	secret := "test-secret"
	token, err := engine.GenerateActionToken("update", "post", "42", secret)
	if err != nil {
		t.Fatal(err)
	}

	payload, err := engine.TokenVerify(token, secret)
	if err != nil {
		t.Fatal("token verification failed:", err)
	}

	if payload["action"] != "update" {
		t.Errorf("wrong action: %v", payload["action"])
	}
	if payload["type"] != "post" {
		t.Errorf("wrong type: %v", payload["type"])
	}
	if payload["recordId"] != "42" {
		t.Errorf("wrong recordId: %v", payload["recordId"])
	}
}

// Test 22: Tampered action token rejected
func TestTamperedTokenRejected(t *testing.T) {
	secret := "test-secret"
	token, _ := engine.GenerateActionToken("delete", "post", "1", secret)

	// Tamper with the token
	tampered := token + "x"
	_, err := engine.TokenVerify(tampered, secret)
	if err == nil {
		t.Error("tampered token should be rejected")
	}

	// Try with wrong secret
	_, err = engine.TokenVerify(token, "wrong-secret")
	if err == nil {
		t.Error("wrong secret should reject token")
	}
}

// Integration test: full end-to-end matching spec example
func TestEndToEndSpecExample(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("_layout.htx", `<!DOCTYPE html>
<html>
<head><title>PRESTO</title></head>
<body>
<nav><htx:auth><htx:v>auth.user.name</htx:v></htx:auth><htx:unauth>Guest</htx:unauth></nav>
__content__
</body>
</html>`)

	te.writeTemplate("partials/footer.htx", `<footer>Built with PRESTO</footer>`)

	te.writeTemplate("components/post-card.htx", `<htx:props>
title = "Untitled"
</htx:props>
<article><h2>{{ title }}</h2><htx:slot /></article>`)

	te.writeTemplate("index.htx", `<htx:data type="post" where="status = 'published'" order="id desc" limit="3" as="posts" />
<htx:let heading="Recent Posts" />

<h1><htx:v>heading</htx:v></h1>

<htx:each items="posts" as="post">
<htx:component src="components/post-card.htx" title="{htx:post.title}">
  <p><htx:v>post.body</htx:v></p>
</htx:component>
</htx:each>

<htx:include src="/partials/footer.htx" />`)

	req := authReq("Jared", "admin")
	html, err := te.resolve("index.htx", req)
	if err != nil {
		t.Fatal(err)
	}

	checks := []struct {
		desc string
		want string
	}{
		{"DOCTYPE", "<!DOCTYPE html>"},
		{"nav with user", "Jared"},
		{"heading", "<h1>Recent Posts</h1>"},
		{"post Third", "<h2>Third</h2>"},
		{"post Second", "<h2>Second</h2>"},
		{"post First", "<h2>First</h2>"},
		{"content 3", "Content 3"},
		{"content 2", "Content 2"},
		{"content 1", "Content 1"},
		{"footer", "<footer>Built with PRESTO</footer>"},
		{"article tag", "<article>"},
	}

	for _, c := range checks {
		if !strings.Contains(html, c.want) {
			t.Errorf("[%s] expected %q in output", c.desc, c.want)
		}
	}

	if strings.Contains(html, "Guest") {
		t.Error("Guest should not appear for authenticated user")
	}

	// Print for inspection
	fmt.Println("=== E2E Output ===")
	fmt.Println(html)
	fmt.Println("=== End ===")
}

func TestAuthWithRole(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	te.writeTemplate("page.htx", `<htx:layout none /><htx:auth role="admin"><p>Admin panel</p></htx:auth>`)

	// Admin user
	html, err := te.resolve("page.htx", authReq("Admin", "admin"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "Admin panel") {
		t.Errorf("admin content not shown, got: %s", html)
	}

	// Regular user
	html2, err := te.resolve("page.htx", authReq("User", "user"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html2, "Admin panel") {
		t.Error("admin content shown to regular user")
	}
}

func TestNoAuthHeader(t *testing.T) {
	te := setupTestEnv(t)
	defer te.adapter.Close()

	handler := engine.ChannelMiddleware(te.registry, te.secret)
	req := httptest.NewRequest("GET", "/api/channel/demo/test", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != 401 {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
