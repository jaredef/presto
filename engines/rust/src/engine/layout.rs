use crate::engine::resolver::normalize_path;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static LAYOUT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:/>|></htx:layout>)"#)
        .unwrap()
});

#[derive(Debug, Clone)]
pub enum LayoutDirective {
    None,
    Src(String),
    Default,
}

pub fn extract_layout_directive(content: &str) -> (String, LayoutDirective) {
    if let Some(caps) = LAYOUT_RE.captures(content) {
        let full = caps.get(0).unwrap();
        let directive = if caps.get(2).is_some() {
            LayoutDirective::None
        } else if let Some(src) = caps.get(1) {
            LayoutDirective::Src(src.as_str().to_string())
        } else {
            LayoutDirective::Default
        };

        let stripped = format!("{}{}", &content[..full.start()], &content[full.end()..]);
        (stripped, directive)
    } else {
        (content.to_string(), LayoutDirective::Default)
    }
}

pub fn walk_layouts(template_path: &Path, template_dir: &Path) -> Vec<PathBuf> {
    let mut layouts = Vec::new();
    let mut current_dir = template_path
        .parent()
        .unwrap_or(template_dir)
        .to_path_buf();
    let template_dir_normalized = normalize_path(template_dir);

    loop {
        let layout_path = current_dir.join("_layout.htx");
        if layout_path.exists() {
            layouts.push(layout_path.clone());

            // Stop at doctype (root layout)
            if let Ok(content) = std::fs::read_to_string(&layout_path) {
                if content.to_lowercase().contains("<!doctype") {
                    break;
                }
            }
        }

        let normalized_current = normalize_path(&current_dir);
        if normalized_current == template_dir_normalized {
            break;
        }

        match current_dir.parent() {
            Some(parent) => {
                let parent_normalized = normalize_path(parent);
                if !parent_normalized.starts_with(&template_dir_normalized) {
                    break;
                }
                current_dir = parent.to_path_buf();
            }
            None => break,
        }
    }

    layouts
}

pub fn wrap_layout(
    content: &str,
    layout_directive: &LayoutDirective,
    template_path: &Path,
    template_dir: &Path,
    is_hx_request: bool,
) -> String {
    match layout_directive {
        LayoutDirective::None => content.to_string(),
        LayoutDirective::Src(src) => {
            let layout_path = if src.starts_with('/') {
                template_dir.join(src.trim_start_matches('/'))
            } else {
                template_path
                    .parent()
                    .unwrap_or(template_dir)
                    .join(src)
            };

            if let Ok(layout_content) = std::fs::read_to_string(&layout_path) {
                layout_content.replace("__content__", content)
            } else {
                content.to_string()
            }
        }
        LayoutDirective::Default => {
            let layouts = walk_layouts(template_path, template_dir);

            if layouts.is_empty() {
                return content.to_string();
            }

            let mut result = content.to_string();

            for (i, layout_path) in layouts.iter().enumerate() {
                // Skip root layout for HX-Request
                if is_hx_request && i == layouts.len() - 1 {
                    continue;
                }

                if let Ok(layout_content) = std::fs::read_to_string(layout_path) {
                    result = layout_content.replace("__content__", &result);
                }
            }

            result
        }
    }
}
