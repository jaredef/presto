use crate::engine::context::set_context_value;
use crate::engine::expression::eval_htx_attr_raw;
use crate::engine::{ContentAdapter, Identifier, QueryParams};
use regex::Regex;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;
use uuid::Uuid;

static INCLUDE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<htx:include\s+src\s*=\s*"([^"]+)"\s*/>"#).unwrap());

static COMPONENT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:/>|>(.*?)</htx:component>)"#)
        .unwrap()
});

static PROPS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<htx:props>(.*?)</htx:props>").unwrap());

static HTX_SCRIPT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<htx:script>(.*?)</htx:script>").unwrap());

static DATA_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<htx:data\s+([^>]*)/>"#).unwrap());

static LET_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*/>"#).unwrap());

static ATTR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(\w[\w-]*)\s*=\s*"([^"]*)""#).unwrap());

static PROP_LINE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(\w+)\s*=\s*"([^"]*)""#).unwrap());

static SLOT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<htx:slot\s*/>").unwrap());

static PROP_SUB_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{\s*(\w+)\s*\}\}").unwrap());

pub fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                components.pop();
            }
            Component::CurDir => {}
            c => components.push(c),
        }
    }
    components.iter().collect()
}

pub fn resolve_template_path(
    template_dir: &Path,
    current_file: &Path,
    src: &str,
) -> Option<PathBuf> {
    if src.contains("..") {
        return None;
    }

    let path = if src.starts_with('/') {
        template_dir.join(src.trim_start_matches('/'))
    } else {
        current_file
            .parent()
            .unwrap_or(template_dir)
            .join(src)
    };

    let normalized = normalize_path(&path);
    let template_dir_normalized = normalize_path(template_dir);

    if normalized.starts_with(&template_dir_normalized) && normalized.exists() {
        Some(normalized)
    } else {
        None
    }
}

// --- INCLUDES ---

pub fn resolve_includes(
    content: &str,
    template_dir: &Path,
    current_file: &Path,
    visited: &mut HashSet<PathBuf>,
    depth: usize,
) -> String {
    if depth > 10 {
        return content.to_string();
    }

    let mut result = content.to_string();

    for _ in 0..100 {
        let Some(caps) = INCLUDE_RE.captures(&result) else {
            break;
        };
        let full = caps.get(0).unwrap();
        let src = caps[1].to_string();
        let start = full.start();
        let end = full.end();

        let replacement = match resolve_template_path(template_dir, current_file, &src) {
            Some(path) => {
                let canonical = normalize_path(&path);
                if visited.contains(&canonical) {
                    format!("<!-- htx:include circular: {} -->", src)
                } else {
                    match std::fs::read_to_string(&path) {
                        Ok(file_content) => {
                            visited.insert(canonical.clone());
                            let resolved = resolve_includes(
                                &file_content,
                                template_dir,
                                &path,
                                visited,
                                depth + 1,
                            );
                            visited.remove(&canonical);
                            resolved
                        }
                        Err(_) => format!("<!-- htx:include not found: {} -->", src),
                    }
                }
            }
            None => format!("<!-- htx:include invalid path: {} -->", src),
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
    }

    result
}

// --- COMPONENTS ---

pub fn resolve_components(
    content: &str,
    template_dir: &Path,
    current_file: &Path,
    script_collector: &mut Vec<String>,
    visited: &mut HashSet<PathBuf>,
    depth: usize,
) -> String {
    if depth > 10 {
        return content.to_string();
    }

    let mut result = content.to_string();

    for _ in 0..100 {
        let Some(caps) = COMPONENT_RE.captures(&result) else {
            break;
        };
        let full = caps.get(0).unwrap();
        let src = caps[1].to_string();
        let attrs_str = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
        let slot_content = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
        let start = full.start();
        let end = full.end();

        let replacement = match resolve_template_path(template_dir, current_file, &src) {
            Some(path) => {
                let canonical = normalize_path(&path);
                if visited.contains(&canonical) {
                    format!("<!-- htx:component circular: {} -->", src)
                } else {
                    match std::fs::read_to_string(&path) {
                        Ok(file_content) => {
                            visited.insert(canonical.clone());
                            let resolved = resolve_single_component(
                                &file_content,
                                &attrs_str,
                                &slot_content,
                                template_dir,
                                &path,
                                script_collector,
                                visited,
                                depth,
                            );
                            visited.remove(&canonical);
                            resolved
                        }
                        Err(_) => format!("<!-- htx:component not found: {} -->", src),
                    }
                }
            }
            None => format!("<!-- htx:component invalid path: {} -->", src),
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
    }

    result
}

fn resolve_single_component(
    template: &str,
    attrs_str: &str,
    slot_content: &str,
    template_dir: &Path,
    component_path: &Path,
    script_collector: &mut Vec<String>,
    visited: &mut HashSet<PathBuf>,
    depth: usize,
) -> String {
    let component_id = Uuid::new_v4().to_string();

    // Parse prop defaults
    let mut props = HashMap::new();
    if let Some(props_caps) = PROPS_RE.captures(template) {
        let props_content = &props_caps[1];
        for line in props_content.lines() {
            let trimmed = line.trim();
            if let Some(cap) = PROP_LINE_RE.captures(trimmed) {
                props.insert(cap[1].to_string(), cap[2].to_string());
            }
        }
    }

    // Override with passed attributes
    for cap in ATTR_RE.captures_iter(attrs_str) {
        let key = &cap[1];
        let value = &cap[2];
        if key != "src" {
            props.insert(key.to_string(), value.to_string());
        }
    }

    // Remove htx:props block
    let mut content = PROPS_RE.replace(template, "").to_string();

    // Extract htx:script blocks
    let mut scripts = Vec::new();
    while let Some(caps) = HTX_SCRIPT_RE.captures(&content) {
        scripts.push(caps[1].to_string());
        let full = caps.get(0).unwrap();
        let s = full.start();
        let e = full.end();
        content = format!("{}{}", &content[..s], &content[e..]);
    }

    // Replace {{ prop }} with prop values
    content = PROP_SUB_RE
        .replace_all(&content, |caps: &regex::Captures| {
            let name = &caps[1];
            props.get(name).cloned().unwrap_or_default()
        })
        .to_string();

    // Replace <htx:slot /> with slot content
    content = SLOT_RE.replace(&content, slot_content).to_string();

    // Add data-htx-id to first element if there are scripts
    if !scripts.is_empty() {
        if let Some(pos) = content.find('>') {
            if pos > 0 && content.as_bytes()[pos - 1] == b'/' {
                content.insert_str(pos - 1, &format!(" data-htx-id=\"{}\"", component_id));
            } else {
                content.insert_str(pos, &format!(" data-htx-id=\"{}\"", component_id));
            }
        }

        for script in &scripts {
            let iife = format!(
                "(function(){{ var el = document.querySelector('[data-htx-id=\"{}\"]'); {} }})();",
                component_id,
                script.trim()
            );
            script_collector.push(iife);
        }
    }

    // Recurse for nested components
    resolve_components(
        &content,
        template_dir,
        component_path,
        script_collector,
        visited,
        depth + 1,
    )
}

// --- HTX:SCRIPT (page-level) ---

pub fn resolve_htx_scripts(content: &str, script_collector: &mut Vec<String>) -> String {
    let mut result = content.to_string();

    while let Some(caps) = HTX_SCRIPT_RE.captures(&result) {
        script_collector.push(caps[1].to_string());
        let full = caps.get(0).unwrap();
        let s = full.start();
        let e = full.end();
        result = format!("{}{}", &result[..s], &result[e..]);
    }

    result
}

// --- HTX:LET ---

pub fn resolve_lets(content: &str, ctx: &mut Value) -> String {
    let mut result = content.to_string();

    let matches: Vec<_> = LET_RE
        .captures_iter(&result)
        .map(|caps| {
            let name = caps[1].to_string();
            let value = caps[2].to_string();
            let full = caps.get(0).unwrap();
            (full.start(), full.end(), name, value)
        })
        .collect();

    // Set context values in forward order
    for (_, _, name, value) in &matches {
        set_context_value(ctx, name, Value::String(value.clone()));
    }

    // Remove directives in reverse order to preserve indices
    for (start, end, _, _) in matches.iter().rev() {
        result = format!("{}{}", &result[..*start], &result[*end..]);
    }

    result
}

// --- HTX:DATA ---

pub fn resolve_data(content: &str, ctx: &mut Value, adapter: &dyn ContentAdapter) -> String {
    let mut result = content.to_string();

    while let Some(caps) = DATA_RE.captures(&result) {
        let full = caps.get(0).unwrap();
        let attrs_str = &caps[1];
        let start = full.start();
        let end = full.end();

        let mut attrs = HashMap::new();
        for cap in ATTR_RE.captures_iter(attrs_str) {
            let key = cap[1].to_string();
            let raw_value = cap[2].to_string();
            // Resolve {htx:} expressions in attribute values (raw, no escaping)
            let resolved = eval_htx_attr_raw(&raw_value, ctx);
            attrs.insert(key, resolved);
        }

        let type_name = attrs.get("type").cloned().unwrap_or_default();
        let as_name = attrs.get("as").cloned().unwrap_or(type_name.clone());
        let slug = attrs.get("slug").cloned();

        let data = if let Some(slug_val) = slug {
            match adapter.get(&type_name, &Identifier::Slug(slug_val)) {
                Some(record) => record,
                None => Value::Null,
            }
        } else {
            let where_clause = attrs.get("where").cloned();
            let order = attrs.get("order").cloned();
            let limit = attrs.get("limit").and_then(|l| l.parse().ok());
            let offset = attrs.get("offset").and_then(|o| o.parse().ok());

            let params = QueryParams {
                type_name: type_name.clone(),
                where_clause,
                order,
                limit,
                offset,
            };
            Value::Array(adapter.query(&params))
        };

        set_context_value(ctx, &as_name, data);
        result = format!("{}{}", &result[..start], &result[end..]);
    }

    result
}
