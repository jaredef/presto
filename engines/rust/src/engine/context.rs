use serde_json::{json, Value};

pub fn resolve_path(ctx: &Value, path: &str) -> Value {
    let path = path.trim();
    if path.is_empty() {
        return Value::Null;
    }

    // Handle pipes
    if let Some(pipe_pos) = path.find('|') {
        let value_path = path[..pipe_pos].trim();
        let pipe_name = path[pipe_pos + 1..].trim();
        let value = resolve_path(ctx, value_path);
        return apply_pipe(&value, pipe_name);
    }

    let keys: Vec<&str> = path.split('.').collect();
    let mut current = ctx;

    for key in keys {
        match current {
            Value::Object(map) => match map.get(key) {
                Some(v) => current = v,
                None => return Value::Null,
            },
            Value::Array(arr) => {
                if let Ok(idx) = key.parse::<usize>() {
                    match arr.get(idx) {
                        Some(v) => current = v,
                        None => return Value::Null,
                    }
                } else {
                    return Value::Null;
                }
            }
            _ => return Value::Null,
        }
    }

    current.clone()
}

fn apply_pipe(value: &Value, pipe: &str) -> Value {
    let s = value_to_string(value);
    match pipe {
        "uppercase" => Value::String(s.to_uppercase()),
        "lowercase" => Value::String(s.to_lowercase()),
        "capitalize" => {
            let mut chars = s.chars();
            let result = match chars.next() {
                Some(c) => {
                    let upper: String = c.to_uppercase().collect();
                    upper + chars.as_str()
                }
                None => String::new(),
            };
            Value::String(result)
        }
        "trim" => Value::String(s.trim().to_string()),
        "length" => match value {
            Value::Array(arr) => json!(arr.len()),
            Value::String(s) => json!(s.len()),
            _ => json!(0),
        },
        "json" => Value::String(serde_json::to_string(value).unwrap_or_default()),
        _ => value.clone(),
    }
}

pub fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

pub fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map_or(false, |f| f != 0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(arr) => !arr.is_empty(),
        Value::Object(_) => true,
    }
}

pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn set_context_value(ctx: &mut Value, key: &str, value: Value) {
    if let Value::Object(map) = ctx {
        map.insert(key.to_string(), value);
    }
}
