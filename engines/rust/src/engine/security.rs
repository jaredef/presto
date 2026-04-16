use crate::engine::context::set_context_value;
use crate::engine::expression::eval_htx_attr_raw;
use crate::engine::token::{current_timestamp, sign_token, sign_url, verify_token};
use crate::engine::ContentAdapter;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::LazyLock;
use uuid::Uuid;

static GRANT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<htx:grant\s+([^>]*)/>"#).unwrap());

static ACTION_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<htx:action\s+([^>]*)/>"#).unwrap());

static ATTR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(\w[\w-]*)\s*=\s*"([^"]*)""#).unwrap());

pub fn resolve_grants(content: &str, ctx: &mut Value, secret: &[u8]) -> String {
    let mut result = content.to_string();

    while let Some(caps) = GRANT_RE.captures(&result) {
        let full = caps.get(0).unwrap();
        let attrs_str = &caps[1];
        let start = full.start();
        let end = full.end();

        let mut attrs = HashMap::new();
        for cap in ATTR_RE.captures_iter(attrs_str) {
            attrs.insert(cap[1].to_string(), cap[2].to_string());
        }

        let grant_type = attrs.get("type").cloned().unwrap_or_default();
        let as_name = attrs
            .get("as")
            .cloned()
            .unwrap_or(grant_type.clone());
        let module = attrs.get("module").cloned().unwrap_or_default();
        let ttl: u64 = attrs
            .get("ttl")
            .and_then(|t| t.parse().ok())
            .unwrap_or(match grant_type.as_str() {
                "asset" => 3600,
                _ => 120,
            });

        let exp = current_timestamp() + ttl;

        let credential = match grant_type.as_str() {
            "websocket" => {
                let payload = json!({
                    "sub": "user",
                    "scope": "websocket",
                    "exp": exp,
                    "jti": Uuid::new_v4().to_string(),
                });
                Value::String(sign_token(&payload, secret))
            }
            "channel" => {
                let scope = format!("channel:{}", module);
                let payload = json!({
                    "sub": "user",
                    "scope": scope,
                    "exp": exp,
                    "jti": Uuid::new_v4().to_string(),
                });
                Value::String(sign_token(&payload, secret))
            }
            "asset" => {
                let path = attrs.get("path").cloned().unwrap_or("/".to_string());
                Value::String(sign_url(&path, exp, secret))
            }
            _ => Value::Null,
        };

        set_context_value(ctx, &as_name, credential);
        result = format!("{}{}", &result[..start], &result[end..]);
    }

    result
}

pub fn prepare_actions(content: &str, ctx: &mut Value, secret: &[u8]) -> String {
    let mut result = content.to_string();
    let mut actions = serde_json::Map::new();

    while let Some(caps) = ACTION_RE.captures(&result) {
        let full = caps.get(0).unwrap();
        // Resolve {htx:} only within this action tag's attributes
        let attrs_str = &eval_htx_attr_raw(&caps[1], ctx);
        let start = full.start();
        let end = full.end();

        let mut attrs = HashMap::new();
        for cap in ATTR_RE.captures_iter(attrs_str) {
            attrs.insert(cap[1].to_string(), cap[2].to_string());
        }

        let action_name = attrs.get("name").cloned().unwrap_or_default();
        let type_name = attrs.get("type").cloned().unwrap_or_default();
        let record_id = attrs.get("record").cloned().unwrap_or_default();

        let exp = current_timestamp() + 3600;

        let payload = json!({
            "action": action_name,
            "type": type_name,
            "recordId": record_id,
            "exp": exp,
        });

        let token = sign_token(&payload, secret);
        actions.insert(action_name.clone(), Value::String(token));

        result = format!("{}{}", &result[..start], &result[end..]);
    }

    if !actions.is_empty() {
        set_context_value(ctx, "$actions", Value::Object(actions));
    }

    result
}

pub fn execute_mutation(
    token_str: &str,
    body: &Value,
    secret: &[u8],
    adapter: &dyn ContentAdapter,
) -> Result<Value, String> {
    let payload = verify_token(token_str, secret)?;

    let action = payload
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let type_name = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let record_id = payload
        .get("recordId")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match action {
        "create" => Ok(adapter.create(type_name, body)),
        "update" => {
            let success = adapter.update(type_name, record_id, body);
            Ok(json!({"success": success}))
        }
        "delete" => {
            let success = adapter.delete(type_name, record_id);
            Ok(json!({"success": success}))
        }
        _ => Err(format!("unknown action: {}", action)),
    }
}
