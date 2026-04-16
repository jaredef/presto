mod engine;

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use engine::pipeline::run_pipeline;
use engine::resolver::normalize_path;
use engine::security::execute_mutation;
use engine::sqlite::SqliteAdapter;
use engine::{AppState, ChannelHandler, ChannelResponse, HtxRequest, ModuleRegistry};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

async fn handle_request(
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<Arc<AppState>>,
) -> HttpResponse {
    let path = req.path().to_string();

    let mut headers = HashMap::new();
    for (key, value) in req.headers() {
        headers.insert(
            key.as_str().to_lowercase(),
            value.to_str().unwrap_or("").to_string(),
        );
    }

    let mut cookies = HashMap::new();
    if let Some(cookie_header) = headers.get("cookie") {
        for pair in cookie_header.split(';') {
            let pair = pair.trim();
            if let Some(eq_pos) = pair.find('=') {
                cookies.insert(
                    pair[..eq_pos].trim().to_string(),
                    pair[eq_pos + 1..].trim().to_string(),
                );
            }
        }
    }

    let mut query = HashMap::new();
    if let Some(qs) = req.uri().query() {
        for pair in qs.split('&') {
            if let Some(eq_pos) = pair.find('=') {
                query.insert(
                    percent_decode(&pair[..eq_pos]),
                    percent_decode(&pair[eq_pos + 1..]),
                );
            }
        }
    }

    let content_type = headers.get("content-type").cloned().unwrap_or_default();
    let body_value = if body.is_empty() {
        json!({})
    } else if content_type.contains("application/json") {
        serde_json::from_slice(&body).unwrap_or(json!({}))
    } else if content_type.contains("application/x-www-form-urlencoded") {
        parse_form_body(&body)
    } else {
        json!({})
    };

    let method = req.method().as_str().to_string();

    // Channel API
    if path.starts_with("/api/channel/") {
        let auth_header = headers.get("authorization").map(|s| s.as_str());
        let modules = state.modules.lock().unwrap();
        let response = engine::channel::handle_channel(
            &path, &query, &method, &body_value, auth_header, &state.secret, &modules,
        );
        return HttpResponse::build(
            actix_web::http::StatusCode::from_u16(response.status).unwrap(),
        )
        .content_type("application/json")
        .body(serde_json::to_string(&response.data).unwrap_or_default());
    }

    // Mutation handling
    if method == "POST" {
        if let Some(token) = body_value.get("_action").and_then(|v| v.as_str()) {
            match execute_mutation(token, &body_value, &state.secret, state.adapter.as_ref()) {
                Ok(result) => {
                    return HttpResponse::Ok()
                        .content_type("application/json")
                        .body(serde_json::to_string(&result).unwrap_or_default());
                }
                Err(e) => {
                    return HttpResponse::BadRequest()
                        .content_type("application/json")
                        .body(json!({"error": e}).to_string());
                }
            }
        }
    }

    let htx_request = HtxRequest {
        method,
        path,
        headers,
        params: HashMap::new(),
        query,
        body: body_value,
        cookies,
    };

    let response = run_pipeline(&htx_request, &state);

    let mut http_response =
        HttpResponse::build(actix_web::http::StatusCode::from_u16(response.status).unwrap());
    for (key, value) in &response.headers {
        http_response.insert_header((key.as_str(), value.as_str()));
    }
    http_response.body(response.body)
}

fn parse_form_body(body: &[u8]) -> Value {
    let body_str = String::from_utf8_lossy(body);
    let mut map = serde_json::Map::new();
    for pair in body_str.split('&') {
        if let Some(eq_pos) = pair.find('=') {
            let key = percent_decode(&pair[..eq_pos].replace('+', " "));
            let value = percent_decode(&pair[eq_pos + 1..].replace('+', " "));
            map.insert(key, Value::String(value));
        }
    }
    Value::Object(map)
}

fn percent_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn guess_content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") | Some("htm") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

async fn serve_static(req: HttpRequest, state: web::Data<Arc<AppState>>) -> HttpResponse {
    let path = req.path().strip_prefix("/public/").unwrap_or("");
    let file_path = state.public_dir.join(path);
    let normalized = normalize_path(&file_path);
    if !normalized.starts_with(&state.public_dir) {
        return HttpResponse::NotFound().finish();
    }
    if normalized.exists() && normalized.is_file() {
        let ct = guess_content_type(&normalized);
        match std::fs::read(&normalized) {
            Ok(data) => HttpResponse::Ok().content_type(ct).body(data),
            Err(_) => HttpResponse::NotFound().finish(),
        }
    } else {
        HttpResponse::NotFound().finish()
    }
}

// Demo channel handler
struct EchoChannelHandler;
impl ChannelHandler for EchoChannelHandler {
    fn module(&self) -> &str { "echo" }
    fn handle(
        &self, sub_path: &str, _query: &HashMap<String, String>,
        user_id: &str, method: &str, _body: &Value,
    ) -> ChannelResponse {
        ChannelResponse {
            status: 200,
            data: json!({"path": sub_path, "user": user_id, "method": method}),
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let template_dir = PathBuf::from("templates");
    let public_dir = PathBuf::from("public");
    std::fs::create_dir_all(&template_dir).ok();
    std::fs::create_dir_all(&public_dir).ok();

    let adapter = SqliteAdapter::new("presto.db");
    adapter.seed();

    let mut registry = ModuleRegistry::new();
    registry.register_channel_handler(Box::new(EchoChannelHandler));

    let state = Arc::new(AppState {
        template_dir: std::fs::canonicalize(&template_dir).unwrap_or(template_dir),
        public_dir: std::fs::canonicalize(&public_dir).unwrap_or(public_dir),
        secret: b"presto-dev-secret-change-in-production".to_vec(),
        adapter: Arc::new(adapter),
        modules: Arc::new(Mutex::new(registry)),
    });

    println!("PRESTO engine running on http://localhost:4004");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .route("/public/{tail:.*}", web::get().to(serve_static))
            .default_service(web::to(handle_request))
    })
    .bind("0.0.0.0:4004")?
    .run()
    .await
}

// ===== 22 Verification Tests =====
#[cfg(test)]
mod tests {
    use super::*;
    use engine::channel::handle_channel;
    use engine::control::{resolve_auth, resolve_each, resolve_if};
    use engine::expression::evaluate_expressions;
    use engine::context::resolve_path;
    use engine::security::resolve_grants;
    use engine::token::{current_timestamp, sign_token, verify_token};

    fn test_state() -> Arc<AppState> {
        let template_dir = PathBuf::from("templates");
        let public_dir = PathBuf::from("public");
        let adapter = SqliteAdapter::new(":memory:");
        adapter.seed();
        let mut registry = ModuleRegistry::new();
        registry.register_channel_handler(Box::new(EchoChannelHandler));
        Arc::new(AppState {
            template_dir: std::fs::canonicalize(&template_dir).unwrap_or(template_dir),
            public_dir: std::fs::canonicalize(&public_dir).unwrap_or(public_dir),
            secret: b"test-secret-key".to_vec(),
            adapter: Arc::new(adapter),
            modules: Arc::new(Mutex::new(registry)),
        })
    }

    fn make_request(method: &str, path: &str) -> HtxRequest {
        HtxRequest {
            method: method.to_string(), path: path.to_string(),
            headers: HashMap::new(), params: HashMap::new(),
            query: HashMap::new(), body: json!({}), cookies: HashMap::new(),
        }
    }

    #[test] fn t01_home_page_with_layout() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/"), &state);
        assert_eq!(resp.status, 200);
        assert!(resp.body.contains("<!DOCTYPE html>"));
        assert!(resp.body.contains("Recent Posts"));
    }

    #[test] fn t02_not_found() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/nonexistent"), &state);
        assert_eq!(resp.status, 404);
    }

    #[test] fn t03_dynamic_slug() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/blog/welcome"), &state);
        assert_eq!(resp.status, 200);
        assert!(resp.body.contains("Welcome to PRESTO"));
    }

    #[test] fn t04_include_expands() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/"), &state);
        assert!(resp.body.contains("Built with PRESTO"));
    }

    #[test] fn t05_component_props_slot() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/"), &state);
        assert!(resp.body.contains("<article>"));
        assert!(resp.body.contains("<h2>"));
    }

    #[test] fn t06_expression_pipes_escape() {
        let ctx = json!({"name": "Jared", "title": "presto", "xss": "<script>alert('xss')</script>"});
        assert_eq!(evaluate_expressions("<p><htx:v>name</htx:v></p>", &ctx), "<p>Jared</p>");
        assert_eq!(evaluate_expressions("<span><htx:v>title | uppercase</htx:v></span>", &ctx), "<span>PRESTO</span>");
        let r = evaluate_expressions("<p><htx:v>xss</htx:v></p>", &ctx);
        assert!(r.contains("&lt;script&gt;"));
    }

    #[test] fn t07_raw_output() {
        let ctx = json!({"html": "<b>bold</b>"});
        assert_eq!(evaluate_expressions("<div><htx:v raw>html</htx:v></div>", &ctx), "<div><b>bold</b></div>");
    }

    #[test] fn t08_script_untouched() {
        let ctx = json!({"name": "Test"});
        let r = evaluate_expressions("<p><htx:v>name</htx:v></p>\n<script>var x = \"{{ safe }}\";</script>", &ctx);
        assert!(r.contains("<p>Test</p>"));
        assert!(r.contains("{{ safe }}"));
    }

    #[test] fn t09_raw_block_untouched() {
        let r = evaluate_expressions("<htx:raw><htx:v>not.evaluated</htx:v></htx:raw>", &json!({}));
        assert!(r.contains("<htx:v>not.evaluated</htx:v>"));
    }

    #[test] fn t10_data_each_renders() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/"), &state);
        assert!(resp.body.contains("Welcome to PRESTO"));
        assert!(resp.body.contains("Getting Started"));
        assert!(resp.body.contains("Advanced Templates"));
    }

    #[test] fn t11_if_true() {
        let ctx = json!({"user": {"name": "Jared"}});
        let r = resolve_if("<htx:if test=\"user\"><p>Hello</p></htx:if>", &ctx);
        assert!(r.contains("<p>Hello</p>"));
    }

    #[test] fn t12_else_shows() {
        let ctx = json!({"user": null});
        let r = resolve_if("<htx:if test=\"user\"><p>Hello</p></htx:if><htx:else><p>Sign in</p></htx:else>", &ctx);
        assert!(r.contains("<p>Sign in</p>"));
        assert!(!r.contains("<p>Hello</p>"));
    }

    #[test] fn t13_empty_collection() {
        let ctx = json!({"items": []});
        let r = resolve_each("<htx:each items=\"items\" as=\"item\">\n<li><htx:v>item.name</htx:v></li>\n<htx:empty>\n<p>No items.</p>\n</htx:each>", &ctx);
        assert!(r.contains("No items."));
    }

    #[test] fn t14_grant_token() {
        let secret = b"test-secret-key";
        let mut ctx = json!({});
        resolve_grants("<htx:grant type=\"channel\" module=\"echo\" as=\"myToken\" />", &mut ctx, secret);
        let tok = resolve_path(&ctx, "myToken");
        assert!(tok.is_string());
        assert!(verify_token(tok.as_str().unwrap(), secret).is_ok());
    }

    #[test] fn t15_auth_hides_unauth() {
        let ctx = json!({"auth": {"user": null}});
        let r = resolve_auth("<htx:auth><p>Logged in</p></htx:auth><htx:unauth><p>Please sign in</p></htx:unauth>", &ctx);
        assert!(!r.contains("Logged in"));
        assert!(r.contains("Please sign in"));
    }

    #[test] fn t16_layout_none() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/test/layout-none"), &state);
        assert_eq!(resp.status, 200);
        assert!(!resp.body.contains("<!DOCTYPE html>"));
        assert!(resp.body.contains("No Layout"));
    }

    #[test] fn t17_layout_src() {
        let state = test_state();
        let resp = run_pipeline(&make_request("GET", "/test/layout-src"), &state);
        assert_eq!(resp.status, 200);
        assert!(resp.body.contains("custom-layout"));
        assert!(resp.body.contains("Custom Layout"));
    }

    #[test] fn t18_channel_200() {
        let secret = b"test-secret-key";
        let token = sign_token(&json!({"sub":"u1","scope":"channel:echo","exp":current_timestamp()+120,"jti":"j1"}), secret);
        let mut r = ModuleRegistry::new();
        r.register_channel_handler(Box::new(EchoChannelHandler));
        let resp = handle_channel("/api/channel/echo/test", &HashMap::new(), "GET", &json!({}), Some(&format!("Bearer {}", token)), secret, &r);
        assert_eq!(resp.status, 200);
    }

    #[test] fn t19_channel_401() {
        let mut r = ModuleRegistry::new();
        r.register_channel_handler(Box::new(EchoChannelHandler));
        let resp = handle_channel("/api/channel/echo/test", &HashMap::new(), "GET", &json!({}), Some("Bearer invalid.token"), b"test-secret-key", &r);
        assert_eq!(resp.status, 401);
    }

    #[test] fn t20_channel_403() {
        let secret = b"test-secret-key";
        let token = sign_token(&json!({"sub":"u1","scope":"channel:other","exp":current_timestamp()+120,"jti":"j1"}), secret);
        let mut r = ModuleRegistry::new();
        r.register_channel_handler(Box::new(EchoChannelHandler));
        let resp = handle_channel("/api/channel/echo/test", &HashMap::new(), "GET", &json!({}), Some(&format!("Bearer {}", token)), secret, &r);
        assert_eq!(resp.status, 403);
    }

    #[test] fn t21_action_roundtrip() {
        let secret = b"test-secret-key";
        let token = sign_token(&json!({"action":"update","type":"post","recordId":"1","exp":current_timestamp()+3600}), secret);
        let p = verify_token(&token, secret).unwrap();
        assert_eq!(p["action"], "update");
        assert_eq!(p["type"], "post");
    }

    #[test] fn t22_tampered_token_rejected() {
        let secret = b"test-secret-key";
        let token = sign_token(&json!({"action":"delete","type":"post","recordId":"1","exp":current_timestamp()+3600}), secret);
        let parts: Vec<&str> = token.splitn(2, '.').collect();
        let tampered = format!("{}xxx.{}", parts[0], parts[1]);
        assert!(verify_token(&tampered, secret).is_err());
    }
}
