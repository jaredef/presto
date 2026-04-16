use crate::engine::context::{is_truthy, resolve_path, value_to_string};
use crate::engine::expression::evaluate_expressions;
use regex::Regex;
use serde_json::{json, Value};
use std::sync::LazyLock;

static EMPTY_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<htx:empty\s*/?>").unwrap());

static IF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?s)<htx:if\s+test="([^"]+)"\s*>(.*?)</htx:if>(?:\s*<htx:else\s*>(.*?)</htx:else>)?"#,
    )
    .unwrap()
});

static AUTH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)<htx:auth(?:\s+role="([^"]*)")?\s*>(.*?)</htx:auth>"#).unwrap()
});

static UNAUTH_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<htx:unauth\s*>(.*?)</htx:unauth>").unwrap());

// Custom parser for htx:each that handles nesting correctly
pub fn resolve_each(content: &str, ctx: &Value) -> String {
    let open_re: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>"#).unwrap()
    });

    let mut result = content.to_string();

    loop {
        let Some(open_caps) = open_re.captures(&result) else {
            break;
        };
        let full_open = open_caps.get(0).unwrap();
        let items_path = open_caps[1].to_string();
        let as_name = open_caps[2].to_string();
        let start = full_open.start();
        let body_start = full_open.end();

        // Find matching </htx:each> respecting nesting
        let mut depth = 1i32;
        let mut pos = body_start;
        let mut found_end = None;

        while pos < result.len() {
            if result[pos..].starts_with("<htx:each") {
                if let Some(c) = result[pos + 9..].chars().next() {
                    if c.is_whitespace() || c == '>' {
                        depth += 1;
                    }
                }
                pos += 9;
            } else if result[pos..].starts_with("</htx:each>") {
                depth -= 1;
                if depth == 0 {
                    found_end = Some(pos);
                    break;
                }
                pos += "</htx:each>".len();
            } else {
                pos += 1;
            }
        }

        let Some(body_end) = found_end else { break };
        let body = result[body_start..body_end].to_string();
        let tag_end = body_end + "</htx:each>".len();

        let items = resolve_path(ctx, &items_path);

        let replacement = match &items {
            Value::Array(arr) if arr.is_empty() => {
                if let Some(empty_match) = EMPTY_RE.find(&body) {
                    body[empty_match.end()..].to_string()
                } else {
                    String::new()
                }
            }
            Value::Array(arr) => {
                let item_template = if let Some(empty_match) = EMPTY_RE.find(&body) {
                    &body[..empty_match.start()]
                } else {
                    &body
                };

                let len = arr.len();
                let mut parts = Vec::new();

                for (i, item) in arr.iter().enumerate() {
                    let mut child_ctx = ctx.clone();
                    if let Value::Object(ref mut map) = child_ctx {
                        map.insert(as_name.clone(), item.clone());
                        map.insert("$index".to_string(), json!(i));
                        map.insert("$first".to_string(), json!(i == 0));
                        map.insert("$last".to_string(), json!(i == len - 1));
                    }

                    // Resolve nested control flow, then evaluate expressions
                    let evaluated = resolve_each(item_template, &child_ctx);
                    let evaluated = resolve_if(&evaluated, &child_ctx);
                    let evaluated = evaluate_expressions(&evaluated, &child_ctx);
                    parts.push(evaluated);
                }

                parts.join("")
            }
            _ => String::new(),
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[tag_end..]);
    }

    result
}

pub fn resolve_if(content: &str, ctx: &Value) -> String {
    let mut result = content.to_string();

    for _ in 0..200 {
        let Some(caps) = IF_RE.captures(&result) else {
            break;
        };
        let full = caps.get(0).unwrap();
        let test_path = &caps[1];
        let if_content = &caps[2];
        let else_content = caps.get(3).map(|m| m.as_str()).unwrap_or("");
        let start = full.start();
        let end = full.end();

        let test_value = resolve_path(ctx, test_path);
        let replacement = if is_truthy(&test_value) {
            if_content.to_string()
        } else {
            else_content.to_string()
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
    }

    result
}

pub fn resolve_auth(content: &str, ctx: &Value) -> String {
    let mut result = content.to_string();

    let auth = resolve_path(ctx, "auth.user");
    let is_authenticated = is_truthy(&auth);
    let user_role = if is_authenticated {
        resolve_path(ctx, "auth.user.role")
    } else {
        Value::Null
    };

    // Process htx:auth blocks
    for _ in 0..200 {
        let Some(caps) = AUTH_RE.captures(&result) else {
            break;
        };
        let full = caps.get(0).unwrap();
        let required_role = caps.get(1).map(|m| m.as_str());
        let inner = &caps[2];
        let start = full.start();
        let end = full.end();

        let show = if is_authenticated {
            match required_role {
                Some(role) if !role.is_empty() => value_to_string(&user_role) == role,
                _ => true,
            }
        } else {
            false
        };

        let replacement = if show {
            inner.to_string()
        } else {
            String::new()
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
    }

    // Process htx:unauth blocks
    for _ in 0..200 {
        let Some(caps) = UNAUTH_RE.captures(&result) else {
            break;
        };
        let full = caps.get(0).unwrap();
        let inner = &caps[1];
        let start = full.start();
        let end = full.end();

        let replacement = if !is_authenticated {
            inner.to_string()
        } else {
            String::new()
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
    }

    result
}
