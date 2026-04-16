"""
PRESTO Flask server — htxlang demo on port 4003.
Seeds demo data and serves templates through the engine pipeline.
"""

import os
import json
from flask import Flask, request, Response
from engine import Pipeline, SQLiteAdapter, ModuleRegistry

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "public"))
adapter = SQLiteAdapter(":memory:")
registry = ModuleRegistry()
pipeline = Pipeline(TEMPLATE_DIR, adapter, secret="demo-secret-key", registry=registry)


def seed_data():
    """Seed demo data into SQLite."""
    adapter.ensure_table("page", {
        "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
        "title": "TEXT",
        "slug": "TEXT UNIQUE",
        "body": "TEXT",
        "status": "TEXT DEFAULT 'published'",
    })
    adapter.ensure_table("post", {
        "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
        "title": "TEXT",
        "slug": "TEXT UNIQUE",
        "body": "TEXT",
        "status": "TEXT DEFAULT 'published'",
    })

    pages = [
        {"title": "Home", "slug": "home", "body": "Welcome to PRESTO", "status": "published"},
        {"title": "About", "slug": "about", "body": "About PRESTO engine", "status": "published"},
        {"title": "Contact", "slug": "contact", "body": "Get in touch", "status": "published"},
    ]
    for p in pages:
        adapter.create("page", p)

    posts = [
        {"title": "First Post", "slug": "first-post", "body": "Content of the first post", "status": "published"},
        {"title": "Second Post", "slug": "second-post", "body": "Content of the second post", "status": "published"},
        {"title": "Third Post", "slug": "third-post", "body": "Content of the third post", "status": "published"},
    ]
    for p in posts:
        adapter.create("post", p)


seed_data()


def get_auth_context():
    """Extract auth context from cookies/headers."""
    # Demo: check for X-User header or cookie
    user_name = request.headers.get("X-User") or request.cookies.get("user")
    user_role = request.headers.get("X-Role") or request.cookies.get("role")
    if user_name:
        return {"auth": {"user": {"name": user_name, "role": user_role or "user"}}}
    return {"auth": {"user": None}}


@app.route("/", defaults={"path": ""}, methods=["GET", "POST"])
@app.route("/<path:path>", methods=["GET", "POST"])
def catch_all(path):
    url_path = "/" + path if path else "/"

    # Parse request body
    body = {}
    if request.method == "POST":
        content_type = request.content_type or ""
        if "application/json" in content_type:
            body = request.get_json(silent=True) or {}
        elif "application/x-www-form-urlencoded" in content_type:
            body = dict(request.form)
        else:
            body = dict(request.form) if request.form else {}

    headers_dict = dict(request.headers)
    context = get_auth_context()

    result = pipeline.process(
        url_path,
        method=request.method,
        headers=headers_dict,
        body=body,
        context=context,
    )

    return Response(
        result["body"],
        status=result["status"],
        headers=result.get("headers", {}),
    )


if __name__ == "__main__":
    print("PRESTO engine running on http://localhost:4003")
    app.run(host="0.0.0.0", port=4003, debug=True)
