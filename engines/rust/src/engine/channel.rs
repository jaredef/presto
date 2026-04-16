use crate::engine::token::verify_token;
use crate::engine::{ChannelResponse, ModuleRegistry};
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn handle_channel(
    path: &str,
    query: &HashMap<String, String>,
    method: &str,
    body: &Value,
    auth_header: Option<&str>,
    secret: &[u8],
    registry: &ModuleRegistry,
) -> ChannelResponse {
    // Parse path: /api/channel/{module}/{sub_path}
    let stripped = path.strip_prefix("/api/channel/").unwrap_or(path);
    let parts: Vec<&str> = stripped.splitn(2, '/').collect();
    let module_name = parts.first().copied().unwrap_or("");
    let sub_path = parts.get(1).copied().unwrap_or("");

    // Validate Bearer token
    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return ChannelResponse {
                status: 401,
                data: json!({"error": "missing or invalid authorization"}),
            }
        }
    };

    let payload = match verify_token(token, secret) {
        Ok(p) => p,
        Err(e) => {
            return ChannelResponse {
                status: 401,
                data: json!({"error": e}),
            }
        }
    };

    // Check scope
    let expected_scope = format!("channel:{}", module_name);
    let token_scope = payload
        .get("scope")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if token_scope != expected_scope {
        return ChannelResponse {
            status: 403,
            data: json!({"error": "scope mismatch"}),
        };
    }

    let user_id = payload
        .get("sub")
        .and_then(|v| v.as_str())
        .unwrap_or("anonymous");

    // Route to handler
    match registry.channel_handlers.get(module_name) {
        Some(handler) => handler.handle(sub_path, query, user_id, method, body),
        None => ChannelResponse {
            status: 404,
            data: json!({"error": "no handler for module"}),
        },
    }
}
