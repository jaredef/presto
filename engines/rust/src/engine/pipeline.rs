use crate::engine::context::set_context_value;
use crate::engine::control::{resolve_auth, resolve_each, resolve_if};
use crate::engine::expression::{evaluate_expressions, protect_blocks, restore_blocks};
use crate::engine::layout::{extract_layout_directive, wrap_layout};
use crate::engine::resolver::{
    resolve_components, resolve_data, resolve_htx_scripts, resolve_includes, resolve_lets,
};
use crate::engine::router::resolve_route;
use crate::engine::security::{prepare_actions, resolve_grants};
use crate::engine::{AppState, HtxRequest, HtxResponse};
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::LazyLock;

pub fn run_pipeline(request: &HtxRequest, state: &AppState) -> HtxResponse {
    // Stage 1: Static file serving (handled in main.rs)
    // Stage 2: Channel API (handled in main.rs)

    // Route resolution
    let route = match resolve_route(&state.template_dir, &request.path) {
        Some(r) => r,
        None => return HtxResponse::not_found(),
    };

    // Read template
    let mut content = match std::fs::read_to_string(&route.template_path) {
        Ok(c) => c,
        Err(_) => return HtxResponse::not_found(),
    };

    // Initialize data context
    let mut ctx = json!({});

    // Add route params to context
    for (k, v) in &route.params {
        set_context_value(&mut ctx, k, Value::String(v.clone()));
    }
    for (k, v) in &request.params {
        set_context_value(&mut ctx, k, Value::String(v.clone()));
    }

    // Add query params
    if !request.query.is_empty() {
        let query_obj: serde_json::Map<String, Value> = request
            .query
            .iter()
            .map(|(k, v)| (k.clone(), Value::String(v.clone())))
            .collect();
        set_context_value(&mut ctx, "query", Value::Object(query_obj));
    }

    // Add auth context
    if let Some(auth_cookie) = request.cookies.get("auth_user") {
        set_context_value(
            &mut ctx,
            "auth",
            json!({"user": {"name": auth_cookie, "role": "admin"}}),
        );
    } else {
        set_context_value(&mut ctx, "auth", json!({"user": null}));
    }

    // Stage 3: Middleware chain
    {
        let modules = state.modules.lock().unwrap();
        let mut response = HtxResponse::ok(String::new());
        for mw in &modules.middleware {
            if !mw.handle(request, &mut response) {
                return response;
            }
        }
    }

    // Stage 4: Context provider injection
    {
        let modules = state.modules.lock().unwrap();
        for (_name, provider) in &modules.context_providers {
            let provided = provider.resolve(request);
            for (k, v) in provided {
                set_context_value(&mut ctx, &k, v);
            }
        }
    }

    // Stage 5: Pre-layout template processors (no-op for base engine)

    // Stage 6: htx:include expansion
    let mut visited = HashSet::new();
    content = resolve_includes(
        &content,
        &state.template_dir,
        &route.template_path,
        &mut visited,
        0,
    );

    // Stage 7: htx:component resolution
    let mut script_collector = Vec::new();
    visited.clear();
    content = resolve_components(
        &content,
        &state.template_dir,
        &route.template_path,
        &mut script_collector,
        &mut visited,
        0,
    );

    // Stage 8: Page-level htx:script extraction
    content = resolve_htx_scripts(&content, &mut script_collector);

    // Stage 9: htx:let binding
    content = resolve_lets(&content, &mut ctx);

    // Stage 10: htx:data -> adapter query
    content = resolve_data(&content, &mut ctx, state.adapter.as_ref());

    // Stage 11: htx:grant
    content = resolve_grants(&content, &mut ctx, &state.secret);

    // Stage 12: htx:action
    content = prepare_actions(&content, &mut ctx, &state.secret);

    // Stage 13: htx:auth / htx:unauth
    content = resolve_auth(&content, &ctx);

    // Stage 14: htx:each / htx:if control flow
    content = resolve_each(&content, &ctx);
    content = resolve_if(&content, &ctx);

    // Stage 15: htx:v / {htx:} expression evaluation
    content = evaluate_expressions(&content, &ctx);

    // Stage 15b: Extract layout directive BEFORE stripping
    let (stripped_content, layout_directive) = extract_layout_directive(&content);
    content = stripped_content;

    // Stage 16: Strip remaining htx: directives (protect htx:raw)
    content = strip_htx_directives(&content);

    // Stage 17: Post-layout template processors (no-op)

    // Stage 18: Layout wrapping
    content = wrap_layout(
        &content,
        &layout_directive,
        &route.template_path,
        &state.template_dir,
        request.is_hx_request(),
    );

    // Stage 19: Post-layout pass
    content = resolve_auth(&content, &ctx);
    content = resolve_if(&content, &ctx);
    content = resolve_each(&content, &ctx);
    content = evaluate_expressions(&content, &ctx);

    // Stage 20: Script injection
    if !script_collector.is_empty() {
        let script_block = format!(
            "<!--PRESTO:SCRIPT:BEGIN-->\n{}\n<!--PRESTO:SCRIPT:END-->",
            script_collector
                .iter()
                .map(|s| format!("PRESTO:SCRIPT_OPEN{}PRESTO:SCRIPT_CLOSE", s))
                .collect::<Vec<_>>()
                .join("\n")
        );

        if let Some(pos) = content.rfind("</body>") {
            content.insert_str(pos, &format!("\n{}\n", script_block));
        } else {
            content.push_str(&format!("\n{}", script_block));
        }
    }

    // Stage 21: Final expression pass
    content = evaluate_expressions(&content, &ctx);

    // Stage 22: Replace PRESTO:SCRIPT placeholders, strip htx:raw wrappers
    content = content.replace("PRESTO:SCRIPT_OPEN", "<script>");
    content = content.replace("PRESTO:SCRIPT_CLOSE", "</script>");
    content = strip_htx_raw_wrappers(&content);

    HtxResponse::ok(content)
}

fn strip_htx_directives(content: &str) -> String {
    static HTX_TAG_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?s)</?htx:[^>]*>").unwrap());

    // Protect script + raw blocks from being stripped
    let protected = protect_blocks(content);
    let stripped = HTX_TAG_RE
        .replace_all(&protected.content, "")
        .to_string();
    restore_blocks(&stripped, &protected.blocks)
}

fn strip_htx_raw_wrappers(content: &str) -> String {
    static RAW_OPEN_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"<htx:raw(?:\s[^>]*)?>").unwrap());
    static RAW_CLOSE_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"</htx:raw>").unwrap());

    let result = RAW_OPEN_RE.replace_all(content, "").to_string();
    RAW_CLOSE_RE.replace_all(&result, "").to_string()
}
