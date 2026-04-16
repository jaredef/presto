package engine

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

func ChannelMiddleware(registry *ModuleRegistry, secret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse /api/channel/{module}/{path...}
		path := strings.TrimPrefix(r.URL.Path, "/api/channel/")
		parts := strings.SplitN(path, "/", 2)
		if len(parts) < 1 || parts[0] == "" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		moduleName := parts[0]
		subPath := ""
		if len(parts) == 2 {
			subPath = parts[1]
		}

		// Find handler
		handler, ok := registry.ChannelHandlers[moduleName]
		if !ok {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		// Validate Bearer token
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")

		payload, err := TokenVerify(token, secret)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Check scope
		expectedScope := fmt.Sprintf("channel:%s", moduleName)
		scope, _ := payload["scope"].(string)
		if scope != expectedScope {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		userId, _ := payload["sub"].(string)

		// Parse body
		var body map[string]interface{}
		if r.Body != nil {
			json.NewDecoder(r.Body).Decode(&body)
		}
		if body == nil {
			body = make(map[string]interface{})
		}

		// Parse query
		query := map[string]string{}
		for k, v := range r.URL.Query() {
			if len(v) > 0 {
				query[k] = v[0]
			}
		}

		resp := handler.Handle(subPath, query, userId, ChannelContext{
			Method: r.Method,
			Body:   body,
		})

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.Status)
		json.NewEncoder(w).Encode(resp.Data)
	}
}
