use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct RouteResult {
    pub template_path: PathBuf,
    pub params: HashMap<String, String>,
}

pub fn resolve_route(template_dir: &Path, path: &str) -> Option<RouteResult> {
    let clean_path = path.trim_start_matches('/').trim_end_matches('/');

    // 1. Static: templateDir + path + ".htx"
    if !clean_path.is_empty() {
        let static_path = template_dir.join(format!("{}.htx", clean_path));
        if static_path.exists() && static_path.starts_with(template_dir) {
            return Some(RouteResult {
                template_path: static_path,
                params: HashMap::new(),
            });
        }
    }

    // 2. Index: templateDir + path + "/index.htx"
    let index_path = if clean_path.is_empty() {
        template_dir.join("index.htx")
    } else {
        template_dir.join(clean_path).join("index.htx")
    };

    if index_path.exists() && index_path.starts_with(template_dir) {
        return Some(RouteResult {
            template_path: index_path,
            params: HashMap::new(),
        });
    }

    // 3. Dynamic: Walk segments, try exact then [param]
    if !clean_path.is_empty() {
        let segments: Vec<&str> = clean_path.split('/').collect();
        let mut params = HashMap::new();

        if let Some(path) = resolve_dynamic(template_dir, &segments, 0, &mut params) {
            return Some(RouteResult {
                template_path: path,
                params,
            });
        }
    }

    None
}

fn resolve_dynamic(
    current_dir: &Path,
    segments: &[&str],
    index: usize,
    params: &mut HashMap<String, String>,
) -> Option<PathBuf> {
    if index >= segments.len() {
        return None;
    }

    let segment = segments[index];
    let is_last = index == segments.len() - 1;

    if is_last {
        // Try exact file
        let exact = current_dir.join(format!("{}.htx", segment));
        if exact.exists() {
            return Some(exact);
        }

        // Try [param].htx
        if let Some(param_file) = find_param_file(current_dir) {
            let param_name = extract_param_name(&param_file);
            params.insert(param_name, segment.to_string());
            return Some(param_file);
        }

        // Try directory with index
        let dir_index = current_dir.join(segment).join("index.htx");
        if dir_index.exists() {
            return Some(dir_index);
        }

        // Try [param] directory with index
        if let Some(param_dir) = find_param_dir(current_dir) {
            let param_name = extract_param_name_from_dir(&param_dir);
            params.insert(param_name, segment.to_string());
            let inner_index = param_dir.join("index.htx");
            if inner_index.exists() {
                return Some(inner_index);
            }
        }
    } else {
        // Try exact directory
        let exact_dir = current_dir.join(segment);
        if exact_dir.is_dir() {
            if let Some(path) = resolve_dynamic(&exact_dir, segments, index + 1, params) {
                return Some(path);
            }
        }

        // Try [param] directory
        if let Some(param_dir) = find_param_dir(current_dir) {
            let param_name = extract_param_name_from_dir(&param_dir);
            params.insert(param_name.clone(), segment.to_string());
            if let Some(path) = resolve_dynamic(&param_dir, segments, index + 1, params) {
                return Some(path);
            }
            params.remove(&param_name);
        }
    }

    None
}

fn find_param_file(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('[') && name.ends_with("].htx") {
            return Some(entry.path());
        }
    }
    None
}

fn find_param_dir(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('[') && name.ends_with(']') && entry.path().is_dir() {
            return Some(entry.path());
        }
    }
    None
}

fn extract_param_name(path: &Path) -> String {
    let name = path.file_stem().unwrap_or_default().to_string_lossy();
    name.trim_start_matches('[')
        .trim_end_matches(']')
        .to_string()
}

fn extract_param_name_from_dir(path: &Path) -> String {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    name.trim_start_matches('[')
        .trim_end_matches(']')
        .to_string()
}
