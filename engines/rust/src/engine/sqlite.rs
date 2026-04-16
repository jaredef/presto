use crate::engine::{ContentAdapter, Identifier, QueryParams};
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::sync::Mutex;

pub struct SqliteAdapter {
    conn: Mutex<Connection>,
}

impl SqliteAdapter {
    pub fn new(path: &str) -> Self {
        let conn = if path == ":memory:" {
            Connection::open_in_memory().expect("open in-memory SQLite")
        } else {
            Connection::open(path).expect("open SQLite database")
        };

        Self {
            conn: Mutex::new(conn),
        }
    }

    pub fn seed(&self) {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS post (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            INSERT OR IGNORE INTO post (title, slug, body, status) VALUES
                ('Welcome to PRESTO', 'welcome', 'This is the first post built with the PRESTO engine.', 'published'),
                ('Getting Started', 'getting-started', 'Learn how to build with htxlang templates.', 'published'),
                ('Advanced Templates', 'advanced-templates', 'Explore components, layouts, and data binding.', 'published');

            CREATE TABLE IF NOT EXISTS page (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                body TEXT NOT NULL
            );

            INSERT OR IGNORE INTO page (title, slug, body) VALUES
                ('About', 'about', 'About this PRESTO-powered site.'),
                ('Contact', 'contact', 'Get in touch.');
        ",
        )
        .expect("seed database");
    }
}

fn sanitize_identifier(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect()
}

fn row_to_value(column_names: &[String], row: &rusqlite::Row) -> Value {
    let mut map = Map::new();
    for (i, name) in column_names.iter().enumerate() {
        let value: Value = match row.get_ref(i) {
            Ok(rusqlite::types::ValueRef::Null) => Value::Null,
            Ok(rusqlite::types::ValueRef::Integer(n)) => json!(n),
            Ok(rusqlite::types::ValueRef::Real(f)) => json!(f),
            Ok(rusqlite::types::ValueRef::Text(s)) => {
                Value::String(String::from_utf8_lossy(s).to_string())
            }
            Ok(rusqlite::types::ValueRef::Blob(_)) => Value::Null,
            Err(_) => Value::Null,
        };
        map.insert(name.clone(), value);
    }
    Value::Object(map)
}

impl ContentAdapter for SqliteAdapter {
    fn query(&self, params: &QueryParams) -> Vec<Value> {
        let conn = self.conn.lock().unwrap();
        let table = sanitize_identifier(&params.type_name);

        let mut sql = format!("SELECT * FROM \"{}\"", table);

        if let Some(ref where_clause) = params.where_clause {
            sql.push_str(&format!(" WHERE {}", where_clause));
        }
        if let Some(ref order) = params.order {
            sql.push_str(&format!(" ORDER BY {}", order));
        }
        if let Some(limit) = params.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }
        if let Some(offset) = params.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("SQLite query error: {} (sql: {})", e, sql);
                return Vec::new();
            }
        };

        let column_names: Vec<String> =
            stmt.column_names().iter().map(|s| s.to_string()).collect();
        let column_count = column_names.len();

        let mut results = Vec::new();
        let mut rows = match stmt.query([]) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("SQLite query execution error: {}", e);
                return Vec::new();
            }
        };

        while let Ok(Some(row)) = rows.next() {
            results.push(row_to_value(&column_names[..column_count], row));
        }

        results
    }

    fn get(&self, type_name: &str, identifier: &Identifier) -> Option<Value> {
        let conn = self.conn.lock().unwrap();
        let table = sanitize_identifier(type_name);

        let (sql, param) = match identifier {
            Identifier::Slug(slug) => (
                format!("SELECT * FROM \"{}\" WHERE slug = ?1", table),
                slug.clone(),
            ),
            Identifier::Id(id) => (
                format!("SELECT * FROM \"{}\" WHERE id = ?1", table),
                id.clone(),
            ),
        };

        let mut stmt = conn.prepare(&sql).ok()?;
        let column_names: Vec<String> =
            stmt.column_names().iter().map(|s| s.to_string()).collect();

        let mut rows = stmt.query(rusqlite::params![param]).ok()?;

        if let Ok(Some(row)) = rows.next() {
            Some(row_to_value(&column_names, row))
        } else {
            None
        }
    }

    fn create(&self, type_name: &str, data: &Value) -> Value {
        let conn = self.conn.lock().unwrap();
        let table = sanitize_identifier(type_name);

        if let Value::Object(map) = data {
            let columns: Vec<&str> = map
                .keys()
                .filter(|k| *k != "_action")
                .map(|k| k.as_str())
                .collect();
            let placeholders: Vec<String> =
                (1..=columns.len()).map(|i| format!("?{}", i)).collect();
            let values: Vec<String> = columns
                .iter()
                .filter_map(|k| map.get(*k))
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .collect();

            let sql = format!(
                "INSERT INTO \"{}\" ({}) VALUES ({})",
                table,
                columns.join(", "),
                placeholders.join(", ")
            );

            let params: Vec<&dyn rusqlite::types::ToSql> = values
                .iter()
                .map(|v| v as &dyn rusqlite::types::ToSql)
                .collect();

            match conn.execute(&sql, params.as_slice()) {
                Ok(_) => {
                    let id = conn.last_insert_rowid();
                    json!({"id": id, "success": true})
                }
                Err(e) => json!({"error": e.to_string()}),
            }
        } else {
            json!({"error": "invalid data"})
        }
    }

    fn update(&self, type_name: &str, id: &str, data: &Value) -> bool {
        let conn = self.conn.lock().unwrap();
        let table = sanitize_identifier(type_name);

        if let Value::Object(map) = data {
            let sets: Vec<String> = map
                .iter()
                .filter(|(k, _)| k.as_str() != "_action")
                .enumerate()
                .map(|(i, (k, _))| format!("{} = ?{}", k, i + 1))
                .collect();
            let values: Vec<String> = map
                .iter()
                .filter(|(k, _)| k.as_str() != "_action")
                .map(|(_, v)| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .collect();

            let sql = format!(
                "UPDATE \"{}\" SET {} WHERE id = ?{}",
                table,
                sets.join(", "),
                values.len() + 1
            );

            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
                values.into_iter().map(|v| Box::new(v) as Box<dyn rusqlite::types::ToSql>).collect();
            params.push(Box::new(id.to_string()));

            let params_ref: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p.as_ref()).collect();

            conn.execute(&sql, params_ref.as_slice()).is_ok()
        } else {
            false
        }
    }

    fn delete(&self, type_name: &str, id: &str) -> bool {
        let conn = self.conn.lock().unwrap();
        let table = sanitize_identifier(type_name);
        let sql = format!("DELETE FROM \"{}\" WHERE id = ?1", table);
        conn.execute(&sql, rusqlite::params![id]).is_ok()
    }
}
