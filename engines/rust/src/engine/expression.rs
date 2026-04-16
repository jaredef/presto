use crate::engine::context::{html_escape, resolve_path, value_to_string};
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;
use uuid::Uuid;

static SCRIPT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?si)<script(?:\s[^>]*)?>.*?</script>").unwrap());

static RAW_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?si)<htx:raw(?:\s[^>]*)?>.*?</htx:raw>").unwrap());

static HTV_TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:/>|>(.*?)</htx:v>)"#)
        .unwrap()
});

static HTX_ATTR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{htx:([^}]+)\}").unwrap());

pub struct ProtectedContent {
    pub content: String,
    pub blocks: Vec<(String, String)>,
}

pub fn protect_blocks(content: &str) -> ProtectedContent {
    let mut result = content.to_string();
    let mut blocks = Vec::new();
    let prefix = Uuid::new_v4().simple().to_string();

    // Protect <script> blocks
    loop {
        let Some(m) = SCRIPT_RE.find(&result) else {
            break;
        };
        let marker = format!("<!--PRESTO:{}:{}-->", prefix, blocks.len());
        let original = m.as_str().to_string();
        let start = m.start();
        let end = m.end();
        blocks.push((marker.clone(), original));
        result = format!("{}{}{}", &result[..start], marker, &result[end..]);
    }

    // Protect <htx:raw> blocks
    loop {
        let Some(m) = RAW_RE.find(&result) else {
            break;
        };
        let marker = format!("<!--PRESTO:{}:{}-->", prefix, blocks.len());
        let original = m.as_str().to_string();
        let start = m.start();
        let end = m.end();
        blocks.push((marker.clone(), original));
        result = format!("{}{}{}", &result[..start], marker, &result[end..]);
    }

    ProtectedContent {
        content: result,
        blocks,
    }
}

pub fn restore_blocks(content: &str, blocks: &[(String, String)]) -> String {
    let mut result = content.to_string();
    for (marker, original) in blocks.iter().rev() {
        result = result.replace(marker.as_str(), original);
    }
    result
}

pub fn eval_htx_v(content: &str, ctx: &Value) -> String {
    HTV_TAG_RE
        .replace_all(content, |caps: &regex::Captures| {
            let is_raw = caps.get(1).is_some();
            let path = caps
                .get(2)
                .or(caps.get(3))
                .map(|m| m.as_str().trim())
                .unwrap_or("");

            let value = resolve_path(ctx, path);
            let s = value_to_string(&value);

            if is_raw {
                s
            } else {
                html_escape(&s)
            }
        })
        .to_string()
}

pub fn eval_htx_attr(content: &str, ctx: &Value) -> String {
    HTX_ATTR_RE
        .replace_all(content, |caps: &regex::Captures| {
            let path = caps[1].trim();
            let value = resolve_path(ctx, path);
            html_escape(&value_to_string(&value))
        })
        .to_string()
}

/// Raw attribute resolution (no HTML escaping) for internal use
pub fn eval_htx_attr_raw(content: &str, ctx: &Value) -> String {
    HTX_ATTR_RE
        .replace_all(content, |caps: &regex::Captures| {
            let path = caps[1].trim();
            let value = resolve_path(ctx, path);
            value_to_string(&value)
        })
        .to_string()
}

pub fn evaluate_expressions(content: &str, ctx: &Value) -> String {
    let protected = protect_blocks(content);
    let result = eval_htx_v(&protected.content, ctx);
    let result = eval_htx_attr(&result, ctx);
    restore_blocks(&result, &protected.blocks)
}
