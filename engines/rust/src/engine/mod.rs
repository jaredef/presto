pub mod channel;
pub mod context;
pub mod control;
pub mod expression;
pub mod layout;
pub mod pipeline;
pub mod resolver;
pub mod router;
pub mod security;
pub mod sqlite;
pub mod token;

use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub template_dir: PathBuf,
    pub public_dir: PathBuf,
    pub secret: Vec<u8>,
    pub adapter: Arc<dyn ContentAdapter>,
    pub modules: Arc<Mutex<ModuleRegistry>>,
}

#[derive(Clone, Debug)]
pub struct HtxRequest {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub params: HashMap<String, String>,
    pub query: HashMap<String, String>,
    pub body: Value,
    pub cookies: HashMap<String, String>,
}

impl HtxRequest {
    pub fn is_hx_request(&self) -> bool {
        self.headers
            .get("hx-request")
            .map_or(false, |v| v == "true")
    }
}

pub trait ContentAdapter: Send + Sync {
    fn query(&self, params: &QueryParams) -> Vec<Value>;
    fn get(&self, type_name: &str, identifier: &Identifier) -> Option<Value>;
    fn create(&self, type_name: &str, data: &Value) -> Value;
    fn update(&self, type_name: &str, id: &str, data: &Value) -> bool;
    fn delete(&self, type_name: &str, id: &str) -> bool;
}

#[derive(Debug, Clone, Default)]
pub struct QueryParams {
    pub type_name: String,
    pub where_clause: Option<String>,
    pub order: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone)]
pub enum Identifier {
    Slug(String),
    Id(String),
}

pub struct ModuleRegistry {
    pub middleware: Vec<Box<dyn Middleware>>,
    pub context_providers: HashMap<String, Box<dyn ContextProvider>>,
    pub channel_handlers: HashMap<String, Box<dyn ChannelHandler>>,
}

impl ModuleRegistry {
    pub fn new() -> Self {
        Self {
            middleware: Vec::new(),
            context_providers: HashMap::new(),
            channel_handlers: HashMap::new(),
        }
    }

    pub fn register_channel_handler(&mut self, handler: Box<dyn ChannelHandler>) {
        let module = handler.module().to_string();
        self.channel_handlers.insert(module, handler);
    }
}

pub trait Middleware: Send + Sync {
    fn name(&self) -> &str;
    fn handle(&self, request: &HtxRequest, response: &mut HtxResponse) -> bool;
}

pub trait ContextProvider: Send + Sync {
    fn resolve(&self, request: &HtxRequest) -> HashMap<String, Value>;
}

pub trait ChannelHandler: Send + Sync {
    fn module(&self) -> &str;
    fn handle(
        &self,
        sub_path: &str,
        query: &HashMap<String, String>,
        user_id: &str,
        method: &str,
        body: &Value,
    ) -> ChannelResponse;
}

#[derive(Debug, Clone)]
pub struct ChannelResponse {
    pub status: u16,
    pub data: Value,
}

#[derive(Debug, Clone)]
pub struct HtxResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

impl HtxResponse {
    pub fn ok(body: String) -> Self {
        let mut headers = HashMap::new();
        headers.insert(
            "Content-Type".to_string(),
            "text/html; charset=utf-8".to_string(),
        );
        Self {
            status: 200,
            headers,
            body,
        }
    }

    pub fn not_found() -> Self {
        Self {
            status: 404,
            headers: HashMap::new(),
            body: "<h1>404 Not Found</h1>".to_string(),
        }
    }

    pub fn json(status: u16, data: &Value) -> Self {
        let mut headers = HashMap::new();
        headers.insert(
            "Content-Type".to_string(),
            "application/json".to_string(),
        );
        Self {
            status,
            headers,
            body: serde_json::to_string(data).unwrap_or_default(),
        }
    }
}
