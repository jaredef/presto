package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"presto-go/engine"
)

func main() {
	templateDir := "templates"
	publicDir := "public"
	secret := os.Getenv("PRESTO_SECRET")
	if secret == "" {
		secret = "presto-dev-secret-key-change-in-production"
	}
	dbPath := "presto.db"

	adapter, err := engine.NewSQLiteAdapter(dbPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer adapter.Close()

	initDB(adapter)

	registry := engine.NewModuleRegistry()

	// Register a demo channel handler
	registry.RegisterChannelHandler(&demoChannelHandler{})

	// Register auth context provider
	registry.RegisterContextProvider("auth", &authContextProvider{})

	eng := engine.NewEngine(templateDir, publicDir, secret, adapter, registry)

	mux := http.NewServeMux()

	// Stage 1: Static files
	fs := http.FileServer(http.Dir(publicDir))
	mux.Handle("/public/", http.StripPrefix("/public/", fs))

	// Stage 2: Channel API
	mux.HandleFunc("/api/channel/", engine.ChannelMiddleware(registry, secret))

	// Mutation endpoint
	mux.HandleFunc("/api/mutate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body := parseBody(r)
		tokenStr, _ := body["_token"].(string)
		if tokenStr == "" {
			tokenStr = r.FormValue("_token")
		}

		payload, err := engine.TokenVerify(tokenStr, secret)
		if err != nil {
			http.Error(w, "invalid token", http.StatusForbidden)
			return
		}

		action, _ := payload["action"].(string)
		typeName, _ := payload["type"].(string)
		recordId, _ := payload["recordId"].(string)

		var result interface{}
		var opErr error

		switch action {
		case "create":
			result, opErr = adapter.Create(typeName, body)
		case "update":
			var ok bool
			ok, opErr = adapter.Update(typeName, recordId, body)
			result = ok
		case "delete":
			var ok bool
			ok, opErr = adapter.Delete(typeName, recordId)
			result = ok
		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
			return
		}

		if opErr != nil {
			http.Error(w, opErr.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// Template routes
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Skip static files
		if strings.HasPrefix(r.URL.Path, "/public/") || strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		route := engine.ResolveRoute(templateDir, r.URL.Path)
		if !route.Found {
			w.WriteHeader(http.StatusNotFound)
			// Try 404 template
			notFoundPath := filepath.Join(templateDir, "404.htx")
			if _, err := os.Stat(notFoundPath); err == nil {
				req := buildHtxRequest(r, route.Params)
				html, err := eng.Resolve(notFoundPath, req)
				if err == nil {
					fmt.Fprint(w, html)
					return
				}
			}
			fmt.Fprint(w, "404 Not Found")
			return
		}

		req := buildHtxRequest(r, route.Params)

		// Stage 3: Middleware chain
		var resp *engine.HtxResponse
		chain := buildMiddlewareChain(registry.Middlewares, func() *engine.HtxResponse {
			html, err := eng.Resolve(route.FilePath, req)
			if err != nil {
				return &engine.HtxResponse{StatusCode: 500, Body: err.Error()}
			}
			return &engine.HtxResponse{StatusCode: 200, Body: html, Headers: map[string]string{"Content-Type": "text/html; charset=utf-8"}}
		})
		resp = chain(req)

		for k, v := range resp.Headers {
			w.Header().Set(k, v)
		}
		if resp.Headers == nil || resp.Headers["Content-Type"] == "" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}
		w.WriteHeader(resp.StatusCode)
		fmt.Fprint(w, resp.Body)
	})

	port := ":4001"
	log.Printf("PRESTO engine running on http://localhost%s", port)
	log.Fatal(http.ListenAndServe(port, mux))
}

func buildHtxRequest(r *http.Request, params map[string]string) *engine.HtxRequest {
	headers := map[string]string{}
	for k := range r.Header {
		headers[k] = r.Header.Get(k)
	}

	cookies := map[string]string{}
	for _, c := range r.Cookies() {
		cookies[c.Name] = c.Value
	}

	body := parseBody(r)

	return &engine.HtxRequest{
		Method:  r.Method,
		Path:    r.URL.Path,
		Headers: headers,
		Cookies: cookies,
		Params:  params,
		Body:    body,
		Raw:     r,
	}
}

func parseBody(r *http.Request) map[string]interface{} {
	body := make(map[string]interface{})
	ct := r.Header.Get("Content-Type")
	if strings.Contains(ct, "application/json") {
		b, err := io.ReadAll(r.Body)
		if err == nil && len(b) > 0 {
			json.Unmarshal(b, &body)
		}
	} else if strings.Contains(ct, "application/x-www-form-urlencoded") {
		b, _ := io.ReadAll(r.Body)
		vals, _ := url.ParseQuery(string(b))
		for k, v := range vals {
			if len(v) == 1 {
				body[k] = v[0]
			} else {
				iface := make([]interface{}, len(v))
				for i, s := range v {
					iface[i] = s
				}
				body[k] = iface
			}
		}
	}
	return body
}

func buildMiddlewareChain(middlewares []engine.Middleware, final func() *engine.HtxResponse) func(*engine.HtxRequest) *engine.HtxResponse {
	if len(middlewares) == 0 {
		return func(req *engine.HtxRequest) *engine.HtxResponse {
			return final()
		}
	}

	return func(req *engine.HtxRequest) *engine.HtxResponse {
		var i int
		var next func() *engine.HtxResponse
		next = func() *engine.HtxResponse {
			i++
			if i >= len(middlewares) {
				return final()
			}
			return middlewares[i].Handle(req, next)
		}
		return middlewares[0].Handle(req, next)
	}
}

func initDB(adapter *engine.SQLiteAdapter) {
	db := adapter.DB()
	db.Exec(`CREATE TABLE IF NOT EXISTS post (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		slug TEXT UNIQUE,
		body TEXT,
		status TEXT DEFAULT 'draft',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)

	var count int
	db.QueryRow("SELECT COUNT(*) FROM post").Scan(&count)
	if count == 0 {
		db.Exec(`INSERT INTO post (title, slug, body, status) VALUES
			('First Post', 'first-post', 'This is the first post content.', 'published'),
			('Second Post', 'second-post', 'This is the second post content.', 'published'),
			('Third Post', 'third-post', 'This is the third post content.', 'published'),
			('Draft Post', 'draft-post', 'This is a draft.', 'draft')`)
	}
}

// Demo channel handler
type demoChannelHandler struct{}

func (h *demoChannelHandler) Module() string { return "demo" }
func (h *demoChannelHandler) Handle(subPath string, query map[string]string, userId string, ctx engine.ChannelContext) engine.ChannelResponse {
	return engine.ChannelResponse{
		Status: 200,
		Data:   map[string]interface{}{"message": "hello from demo channel", "path": subPath, "user": userId},
	}
}

// Auth context provider
type authContextProvider struct{}

func (p *authContextProvider) Resolve(req *engine.HtxRequest) map[string]interface{} {
	result := map[string]interface{}{
		"auth": map[string]interface{}{
			"user": nil,
		},
	}
	if req == nil {
		return result
	}
	// Simple cookie-based auth for demo
	if name, ok := req.Cookies["user_name"]; ok && name != "" {
		role := req.Cookies["user_role"]
		if role == "" {
			role = "user"
		}
		result["auth"] = map[string]interface{}{
			"user": map[string]interface{}{
				"name": name,
				"role": role,
			},
		}
	}
	return result
}
