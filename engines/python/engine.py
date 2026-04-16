"""
PRESTO htxlang engine — conformant implementation in Python.
All engine components in one file.
"""

import re
import os
import time
import json
import hmac
import uuid
import base64
import hashlib
import sqlite3
import logging
from copy import deepcopy
from typing import Any, Optional

logger = logging.getLogger("presto")

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def html_escape(s: str) -> str:
    """C8: HTML escape by default — & < > " """
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def is_truthy(val: Any) -> bool:
    """Spec truthiness: falsy = None, False, 0, '', []"""
    if val is None:
        return False
    if val is False:
        return False
    if val == 0:
        return False
    if val == "":
        return False
    if isinstance(val, list) and len(val) == 0:
        return False
    return True


def resolve_path(context: dict, path: str) -> Any:
    """Dot-path resolution into nested dicts/objects."""
    path = path.strip()
    parts = path.split(".")
    cur = context
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
        if cur is None:
            return None
    return cur


def apply_pipe(value: Any, pipe_name: str) -> Any:
    """Pipes: uppercase, lowercase, capitalize, trim, length, json."""
    pipe_name = pipe_name.strip()
    if pipe_name == "uppercase":
        return str(value).upper() if value is not None else ""
    elif pipe_name == "lowercase":
        return str(value).lower() if value is not None else ""
    elif pipe_name == "capitalize":
        return str(value).capitalize() if value is not None else ""
    elif pipe_name == "trim":
        return str(value).strip() if value is not None else ""
    elif pipe_name == "length":
        if isinstance(value, (list, str, dict)):
            return len(value)
        return 0
    elif pipe_name == "json":
        return json.dumps(value)
    return value


def resolve_expression(context: dict, expr: str) -> Any:
    """Resolve an expression (possibly with pipes)."""
    parts = expr.split("|")
    path = parts[0].strip()
    value = resolve_path(context, path)
    for pipe in parts[1:]:
        value = apply_pipe(value, pipe)
    return value


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)


def parse_attrs(attr_str: str) -> dict:
    """Parse HTML-style attributes from a string."""
    attrs = {}
    for m in re.finditer(r'(\w[\w-]*)\s*=\s*"([^"]*)"', attr_str):
        attrs[m.group(1)] = m.group(2)
    # Handle bare attributes like "none", "raw"
    for m in re.finditer(r'(?<!\w)(\w+)(?=\s|$)(?!\s*=)', attr_str):
        name = m.group(1)
        if name not in attrs:
            attrs[name] = True
    return attrs


# ---------------------------------------------------------------------------
# Token signing (HMAC-SHA256)
# ---------------------------------------------------------------------------

class TokenSigner:
    def __init__(self, secret: str):
        self.secret = secret.encode("utf-8")

    def sign(self, payload: dict) -> str:
        payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        payload_b64 = b64url_encode(payload_bytes)
        sig = hmac.new(self.secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
        sig_b64 = b64url_encode(sig)
        return f"{payload_b64}.{sig_b64}"

    def verify(self, token: str) -> Optional[dict]:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, sig_b64 = parts
        expected_sig = hmac.new(
            self.secret, payload_b64.encode("ascii"), hashlib.sha256
        ).digest()
        expected_b64 = b64url_encode(expected_sig)
        if not hmac.compare_digest(sig_b64, expected_b64):
            return None
        try:
            payload = json.loads(b64url_decode(payload_b64))
        except Exception:
            return None
        if "exp" in payload and payload["exp"] < time.time():
            return None
        return payload


# ---------------------------------------------------------------------------
# SQLite ContentAdapter
# ---------------------------------------------------------------------------

class SQLiteAdapter:
    def __init__(self, db_path: str = ":memory:"):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row

    def ensure_table(self, table: str, columns: dict):
        cols = ", ".join(f"{k} {v}" for k, v in columns.items())
        self.conn.execute(f"CREATE TABLE IF NOT EXISTS [{table}] ({cols})")
        self.conn.commit()

    def query(self, params: dict) -> list:
        t = params["type"]
        sql = f"SELECT * FROM [{t}]"
        args = []
        if params.get("where"):
            sql += f" WHERE {params['where']}"
        if params.get("order"):
            sql += f" ORDER BY {params['order']}"
        if params.get("limit"):
            sql += f" LIMIT {int(params['limit'])}"
        if params.get("offset"):
            sql += f" OFFSET {int(params['offset'])}"
        try:
            rows = self.conn.execute(sql, args).fetchall()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"Query error: {e}")
            return []

    def get(self, type_name: str, identifier: dict) -> Optional[dict]:
        if "slug" in identifier:
            sql = f"SELECT * FROM [{type_name}] WHERE slug = ?"
            row = self.conn.execute(sql, [identifier["slug"]]).fetchone()
        elif "id" in identifier:
            sql = f"SELECT * FROM [{type_name}] WHERE id = ?"
            row = self.conn.execute(sql, [identifier["id"]]).fetchone()
        else:
            return None
        return dict(row) if row else None

    def create(self, type_name: str, data: dict) -> dict:
        keys = list(data.keys())
        vals = [data[k] for k in keys]
        placeholders = ", ".join("?" for _ in keys)
        col_names = ", ".join(f"[{k}]" for k in keys)
        cur = self.conn.execute(
            f"INSERT INTO [{type_name}] ({col_names}) VALUES ({placeholders})", vals
        )
        self.conn.commit()
        data["id"] = cur.lastrowid
        return data

    def update(self, type_name: str, record_id: Any, data: dict) -> bool:
        sets = ", ".join(f"[{k}] = ?" for k in data.keys())
        vals = list(data.values()) + [record_id]
        cur = self.conn.execute(
            f"UPDATE [{type_name}] SET {sets} WHERE id = ?", vals
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete(self, type_name: str, record_id: Any) -> bool:
        cur = self.conn.execute(f"DELETE FROM [{type_name}] WHERE id = ?", [record_id])
        self.conn.commit()
        return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Module system
# ---------------------------------------------------------------------------

class ModuleRegistry:
    def __init__(self):
        self.middleware_list: list = []
        self.context_providers: dict = {}
        self.channel_handlers: dict = {}

    def register_middleware(self, mw):
        self.middleware_list.append(mw)

    def register_context_provider(self, name: str, provider):
        self.context_providers[name] = provider

    def register_channel_handler(self, handler):
        self.channel_handlers[handler.module()] = handler


class RestrictedRegistry:
    """Proxy that silently drops undeclared registrations for restricted modules."""

    def __init__(self, real: ModuleRegistry, manifest: dict):
        self._real = real
        self._manifest = manifest

    def register_middleware(self, mw):
        if "middleware" in self._manifest:
            self._real.register_middleware(mw)
        else:
            logger.warning(f"Rejected middleware registration (undeclared)")

    def register_context_provider(self, name: str, provider):
        if "context_providers" in self._manifest and name in self._manifest["context_providers"]:
            self._real.register_context_provider(name, provider)
        else:
            logger.warning(f"Rejected context provider '{name}' (undeclared)")

    def register_channel_handler(self, handler):
        if "channel_handlers" in self._manifest and handler.module() in self._manifest.get("channel_handlers", []):
            self._real.register_channel_handler(handler)
        else:
            logger.warning(f"Rejected channel handler '{handler.module()}' (undeclared)")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

class Router:
    def __init__(self, template_dir: str):
        self.template_dir = template_dir

    def resolve(self, url_path: str) -> Optional[tuple]:
        """Returns (file_path, params) or None."""
        url_path = url_path.rstrip("/") or "/index"

        # Reject path traversal
        if ".." in url_path:
            return None

        # Static: exact .htx match
        static = os.path.join(self.template_dir, url_path.lstrip("/") + ".htx")
        if os.path.isfile(static):
            return (static, {})

        # Index: directory/index.htx
        idx = os.path.join(self.template_dir, url_path.lstrip("/"), "index.htx")
        if os.path.isfile(idx):
            return (idx, {})

        # Dynamic: walk segments
        segments = [s for s in url_path.strip("/").split("/") if s]
        return self._walk_dynamic(self.template_dir, segments, {})

    def _walk_dynamic(self, base: str, segments: list, params: dict) -> Optional[tuple]:
        if not segments:
            return None

        seg = segments[0]
        remaining = segments[1:]

        # Try exact match first
        if remaining:
            exact_dir = os.path.join(base, seg)
            if os.path.isdir(exact_dir):
                result = self._walk_dynamic(exact_dir, remaining, params)
                if result:
                    return result

            # Try exact file at this level (only if no remaining)
        else:
            exact_file = os.path.join(base, seg + ".htx")
            if os.path.isfile(exact_file):
                return (exact_file, params)

        # Try dynamic [param].htx or [param]/ directory
        if not remaining:
            # Look for [param].htx
            for entry in os.listdir(base) if os.path.isdir(base) else []:
                if entry.startswith("[") and entry.endswith("].htx"):
                    param_name = entry[1:-5]
                    params = {**params, param_name: seg}
                    return (os.path.join(base, entry), params)
        else:
            # Look for [param]/ directory
            for entry in os.listdir(base) if os.path.isdir(base) else []:
                if entry.startswith("[") and entry.endswith("]") and os.path.isdir(os.path.join(base, entry)):
                    param_name = entry[1:-1]
                    params = {**params, param_name: seg}
                    result = self._walk_dynamic(os.path.join(base, entry), remaining, params)
                    if result:
                        return result

        return None


# ---------------------------------------------------------------------------
# ExpressionEngine
# ---------------------------------------------------------------------------

class ExpressionEngine:
    # Patterns
    SCRIPT_PROT = re.compile(r'<script(\s[^>]*)?>[\s\S]*?</script>', re.IGNORECASE)
    RAW_PROT = re.compile(r'<htx:raw(?:\s[^>]*)?>[\s\S]*?</htx:raw>', re.IGNORECASE)
    HTV_TAG = re.compile(
        r'<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:/>|>([\s\S]*?)</htx:v>)'
    )
    HTX_ATTR = re.compile(r'\{htx:([^}]+)\}')

    def evaluate(self, html: str, context: dict) -> str:
        """Stage 15: Expression evaluation with script/raw protection."""
        markers = {}
        counter = [0]

        def protect(m):
            key = f"__PRESTO_PROT_{counter[0]}__"
            counter[0] += 1
            markers[key] = m.group(0)
            return key

        # 1) Protect script blocks
        html = self.SCRIPT_PROT.sub(protect, html)
        # 2) Protect htx:raw blocks
        html = self.RAW_PROT.sub(protect, html)

        # 3) Replace htx:v tags
        def replace_htxv(m):
            raw = m.group(1)
            path_attr = m.group(2)
            body = m.group(3)
            expr = path_attr if path_attr is not None else (body or "")
            value = resolve_expression(context, expr)
            if value is None:
                return ""
            value = str(value)
            if raw:
                return value
            return html_escape(value)

        html = self.HTV_TAG.sub(replace_htxv, html)

        # 4) Replace {htx:} attribute bindings
        def replace_attr(m):
            expr = m.group(1)
            value = resolve_expression(context, expr)
            if value is None:
                return ""
            return html_escape(str(value))

        html = self.HTX_ATTR.sub(replace_attr, html)

        # 5) Restore markers
        for key, original in markers.items():
            html = html.replace(key, original)

        return html


# ---------------------------------------------------------------------------
# IncludeResolver
# ---------------------------------------------------------------------------

class IncludeResolver:
    INCLUDE_RE = re.compile(r'<htx:include\s+src\s*=\s*"([^"]+)"\s*/>', re.IGNORECASE)

    def __init__(self, template_dir: str):
        self.template_dir = template_dir

    def resolve(self, html: str, current_file: str, depth: int = 0,
                visited: set = None) -> str:
        if depth > 10:
            return html
        if visited is None:
            visited = set()

        def replacer(m):
            src = m.group(1)
            file_path = self._resolve_path(src, current_file)
            if file_path in visited:
                raise ValueError(f"Circular include detected: {file_path}")
            if not os.path.isfile(file_path):
                return f"<!-- include not found: {src} -->"
            visited_copy = visited | {file_path}
            content = open(file_path, "r").read()
            return self.resolve(content, file_path, depth + 1, visited_copy)

        return self.INCLUDE_RE.sub(replacer, html)

    def _resolve_path(self, src: str, current_file: str) -> str:
        if src.startswith("/"):
            return os.path.join(self.template_dir, src.lstrip("/"))
        return os.path.join(os.path.dirname(current_file), src)


# ---------------------------------------------------------------------------
# ComponentResolver
# ---------------------------------------------------------------------------

class ComponentResolver:
    COMPONENT_RE = re.compile(
        r'<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:/>|>([\s\S]*?)</htx:component>)',
        re.IGNORECASE
    )
    PROPS_RE = re.compile(r'<htx:props>([\s\S]*?)</htx:props>', re.IGNORECASE)
    SLOT_RE = re.compile(r'<htx:slot\s*/>', re.IGNORECASE)
    SCRIPT_RE = re.compile(r'<htx:script>([\s\S]*?)</htx:script>', re.IGNORECASE)
    PROP_LINE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
    PROP_SUB = re.compile(r'\{\{\s*(\w+)\s*\}\}')

    def __init__(self, template_dir: str):
        self.template_dir = template_dir
        self.script_collector: list = []

    def resolve(self, html: str, current_file: str, depth: int = 0,
                visited: set = None) -> str:
        if depth > 10:
            return html
        if visited is None:
            visited = set()

        def replacer(m):
            src = m.group(1)
            attr_str = m.group(2) or ""
            slot_content = m.group(3) or ""

            file_path = self._resolve_path(src, current_file)
            if file_path in visited:
                raise ValueError(f"Circular component detected: {file_path}")

            if not os.path.isfile(file_path):
                return f"<!-- component not found: {src} -->"

            visited_copy = visited | {file_path}
            comp_html = open(file_path, "r").read()

            # Parse defaults from htx:props
            defaults = {}
            props_m = self.PROPS_RE.search(comp_html)
            if props_m:
                for pm in self.PROP_LINE.finditer(props_m.group(1)):
                    defaults[pm.group(1)] = pm.group(2)
                comp_html = self.PROPS_RE.sub("", comp_html)

            # Override with passed attrs
            passed = parse_attrs(attr_str)
            props = {**defaults, **passed}

            # Resolve {htx:} expressions in prop values (for attribute binding in component tags)
            htx_attr_re = re.compile(r'\{htx:([^}]+)\}')
            for k, v in props.items():
                if isinstance(v, str) and '{htx:' in v:
                    props[k] = htx_attr_re.sub(lambda mm: str(resolve_path({}, mm.group(1)) or mm.group(0)), v)

            # Replace {{ propName }} in component body
            def sub_prop(pm):
                name = pm.group(1)
                return str(props.get(name, ""))
            comp_html = self.PROP_SUB.sub(sub_prop, comp_html)

            # Inject slot content
            comp_html = self.SLOT_RE.sub(slot_content, comp_html)

            # Extract htx:script
            comp_id = f"htx-{uuid.uuid4().hex[:8]}"
            for sm in self.SCRIPT_RE.finditer(comp_html):
                script_body = sm.group(1)
                iife = f'(function(){{var el=document.querySelector("[data-htx-id=\\"{comp_id}\\"]");{script_body}}})()'
                self.script_collector.append(iife)
            comp_html = self.SCRIPT_RE.sub("", comp_html)

            # Recurse
            comp_html = self.resolve(comp_html, file_path, depth + 1, visited_copy)
            return comp_html

        return self.COMPONENT_RE.sub(replacer, html)

    def _resolve_path(self, src: str, current_file: str) -> str:
        if src.startswith("/"):
            return os.path.join(self.template_dir, src.lstrip("/"))
        return os.path.join(os.path.dirname(current_file), src)


# ---------------------------------------------------------------------------
# DataResolver
# ---------------------------------------------------------------------------

class DataResolver:
    DATA_RE = re.compile(r'<htx:data\s+([^>]*)/>', re.IGNORECASE)

    def __init__(self, adapter: SQLiteAdapter):
        self.adapter = adapter

    def resolve(self, html: str, context: dict, params: dict = None) -> str:
        def replacer(m):
            attrs = parse_attrs(m.group(1))
            type_name = attrs.get("type", "")
            as_name = attrs.get("as", type_name)
            where = attrs.get("where", "")
            order = attrs.get("order", "")
            limit = attrs.get("limit", "")
            offset = attrs.get("offset", "")

            # Resolve {htx:} expressions in where clause from full context
            htx_attr_re = re.compile(r'\{htx:([^}]+)\}')
            where = htx_attr_re.sub(
                lambda mm: str(resolve_expression(context, mm.group(1)) or ""),
                where
            )

            results = self.adapter.query({
                "type": type_name,
                "where": where,
                "order": order,
                "limit": limit,
                "offset": offset,
            })
            context[as_name] = results
            return ""

        html = self.DATA_RE.sub(replacer, html)
        return html


# ---------------------------------------------------------------------------
# ControlFlow (htx:each, htx:if, htx:else)
# ---------------------------------------------------------------------------

class ControlFlow:
    EACH_RE = re.compile(
        r'<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)</htx:each>',
        re.IGNORECASE
    )
    EMPTY_RE = re.compile(r'<htx:empty\s*/?>', re.IGNORECASE)
    IF_RE = re.compile(
        r'<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)</htx:if>(?:\s*<htx:else\s*>([\s\S]*?)</htx:else>)?',
        re.IGNORECASE
    )

    def __init__(self, expression_engine: ExpressionEngine):
        self.expression_engine = expression_engine

    def resolve(self, html: str, context: dict) -> str:
        html = self._resolve_each(html, context)
        html = self._resolve_if(html, context)
        return html

    def _resolve_each(self, html: str, context: dict) -> str:
        def replacer(m):
            items_path = m.group(1)
            as_name = m.group(2)
            body = m.group(3)

            items = resolve_path(context, items_path)
            if not isinstance(items, list):
                items = []

            # Split body on htx:empty
            parts = self.EMPTY_RE.split(body, 1)
            item_template = parts[0]
            empty_template = parts[1] if len(parts) > 1 else ""

            if len(items) == 0:
                return empty_template.strip()

            results = []
            for i, item in enumerate(items):
                child_ctx = {
                    **context,
                    as_name: item,
                    "$index": i,
                    "$first": i == 0,
                    "$last": i == len(items) - 1,
                }
                rendered = self.expression_engine.evaluate(item_template, child_ctx)
                rendered = self.resolve(rendered, child_ctx)
                results.append(rendered)

            return "\n".join(r.strip() for r in results if r.strip())

        return self.EACH_RE.sub(replacer, html)

    def _resolve_if(self, html: str, context: dict) -> str:
        def replacer(m):
            test_path = m.group(1)
            if_body = m.group(2)
            else_body = m.group(3) or ""

            value = resolve_path(context, test_path)
            if is_truthy(value):
                result = self.expression_engine.evaluate(if_body, context)
                return self.resolve(result, context)
            else:
                if else_body:
                    result = self.expression_engine.evaluate(else_body, context)
                    return self.resolve(result, context)
                return ""

        return self.IF_RE.sub(replacer, html)


# ---------------------------------------------------------------------------
# LayoutResolver
# ---------------------------------------------------------------------------

class LayoutResolver:
    LAYOUT_RE = re.compile(
        r'<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:/>|></htx:layout>)',
        re.IGNORECASE
    )

    def __init__(self, template_dir: str):
        self.template_dir = template_dir

    def extract_directive(self, html: str) -> tuple:
        """Extract layout directive BEFORE stripping (stage 15b). Returns (directive_info, html_with_directive_removed)."""
        m = self.LAYOUT_RE.search(html)
        if m:
            src = m.group(1)
            none = m.group(2)
            if none:
                return ("none", None), html
            elif src:
                return ("src", src), html
            else:
                return ("default", None), html
        return ("default", None), html

    def wrap(self, html: str, directive: tuple, file_path: str,
             is_hx_request: bool = False) -> str:
        """Stage 18: Layout wrapping."""
        kind, value = directive

        if kind == "none":
            # Strip the layout directive from output
            html = self.LAYOUT_RE.sub("", html).strip()
            return html

        if kind == "src":
            layout_path = os.path.join(self.template_dir, value.lstrip("/"))
            if os.path.isfile(layout_path):
                layout_html = open(layout_path, "r").read()
                html = self.LAYOUT_RE.sub("", html).strip()
                return layout_html.replace("__content__", html)
            html = self.LAYOUT_RE.sub("", html).strip()
            return html

        # Default: walk from file dir to root
        html = self.LAYOUT_RE.sub("", html).strip()
        current_dir = os.path.dirname(file_path)

        # Walk from current dir up to template root
        while True:
            layout_file = os.path.join(current_dir, "_layout.htx")
            if os.path.isfile(layout_file):
                layout_html = open(layout_file, "r").read()
                # If layout has doctype, this is root layout
                has_doctype = "<!DOCTYPE" in layout_html.upper() or "<!doctype" in layout_html.lower()
                html = layout_html.replace("__content__", html)

                if is_hx_request and has_doctype:
                    # Skip root layout for HX-Request
                    break
                if has_doctype:
                    break

            if os.path.normpath(current_dir) == os.path.normpath(self.template_dir):
                break
            parent = os.path.dirname(current_dir)
            if parent == current_dir:
                break
            current_dir = parent

        return html


# ---------------------------------------------------------------------------
# GrantResolver
# ---------------------------------------------------------------------------

class GrantResolver:
    GRANT_RE = re.compile(r'<htx:grant\s+([^>]*)/>', re.IGNORECASE)

    def __init__(self, signer: TokenSigner):
        self.signer = signer

    def resolve(self, html: str, context: dict) -> str:
        grants = {}

        def replacer(m):
            attrs = parse_attrs(m.group(1))
            grant_type = attrs.get("type", "")
            as_name = attrs.get("as", grant_type)
            module = attrs.get("module", "")

            if grant_type == "websocket":
                ttl = int(attrs.get("ttl", 120))
                token = self.signer.sign({
                    "sub": context.get("auth", {}).get("user", {}).get("name", "anon") if isinstance(context.get("auth"), dict) else "anon",
                    "scope": "websocket",
                    "exp": int(time.time()) + ttl,
                    "jti": uuid.uuid4().hex,
                })
                grants[as_name] = token
            elif grant_type == "channel":
                ttl = int(attrs.get("ttl", 120))
                token = self.signer.sign({
                    "sub": context.get("auth", {}).get("user", {}).get("name", "anon") if isinstance(context.get("auth"), dict) else "anon",
                    "scope": f"channel:{module}",
                    "exp": int(time.time()) + ttl,
                    "jti": uuid.uuid4().hex,
                })
                grants[as_name] = token
            elif grant_type == "asset":
                ttl = int(attrs.get("ttl", 3600))
                path = attrs.get("path", "/")
                exp = int(time.time()) + ttl
                sig_data = f"{path}:{exp}".encode("utf-8")
                sig = hmac.new(
                    self.signer.secret, sig_data, hashlib.sha256
                ).digest()
                grants[as_name] = f"{path}?sig={b64url_encode(sig)}&exp={exp}"

            return ""

        html = self.GRANT_RE.sub(replacer, html)
        context.update(grants)
        return html


# ---------------------------------------------------------------------------
# MutationHandler (htx:action)
# ---------------------------------------------------------------------------

class MutationHandler:
    ACTION_RE = re.compile(r'<htx:action\s+([^>]*)/>', re.IGNORECASE)

    def __init__(self, signer: TokenSigner, adapter: SQLiteAdapter):
        self.signer = signer
        self.adapter = adapter

    def prepare(self, html: str, context: dict) -> str:
        """Stage 12: Generate action tokens on GET."""
        actions = {}

        def replacer(m):
            attrs = parse_attrs(m.group(1))
            action_name = attrs.get("name", "")
            type_name = attrs.get("type", "")
            record_id = attrs.get("record", "")

            # Resolve {htx:} in record
            htx_attr_re = re.compile(r'\{htx:([^}]+)\}')
            record_id = htx_attr_re.sub(
                lambda mm: str(resolve_expression(context, mm.group(1)) or ""),
                record_id
            )

            token = self.signer.sign({
                "action": action_name,
                "type": type_name,
                "recordId": record_id,
                "exp": int(time.time()) + 3600,
            })
            actions[action_name] = token
            return ""

        html = self.ACTION_RE.sub(replacer, html)
        context["$actions"] = actions
        return html

    def execute(self, token: str, body: dict = None) -> dict:
        """Execute a verified mutation."""
        payload = self.signer.verify(token)
        if not payload:
            return {"status": 403, "error": "Invalid or expired token"}

        action = payload.get("action", "")
        type_name = payload.get("type", "")
        record_id = payload.get("recordId", "")

        if action == "create":
            record = self.adapter.create(type_name, body or {})
            return {"status": 200, "data": record}
        elif action == "update":
            ok = self.adapter.update(type_name, record_id, body or {})
            return {"status": 200 if ok else 404}
        elif action == "delete":
            ok = self.adapter.delete(type_name, record_id)
            return {"status": 200 if ok else 404}
        else:
            return {"status": 400, "error": f"Unknown action: {action}"}


# ---------------------------------------------------------------------------
# AuthConditionals
# ---------------------------------------------------------------------------

class AuthConditionals:
    AUTH_RE = re.compile(
        r'<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)</htx:auth>',
        re.IGNORECASE
    )
    UNAUTH_RE = re.compile(
        r'<htx:unauth\s*>([\s\S]*?)</htx:unauth>',
        re.IGNORECASE
    )

    def resolve(self, html: str, context: dict) -> str:
        auth = context.get("auth", {})
        user = auth.get("user") if isinstance(auth, dict) else None

        def auth_replacer(m):
            role = m.group(1)
            body = m.group(2)
            if user:
                if role:
                    if isinstance(user, dict) and user.get("role") == role:
                        return body
                    return ""
                return body
            return ""

        def unauth_replacer(m):
            body = m.group(1)
            if not user:
                return body
            return ""

        html = self.AUTH_RE.sub(auth_replacer, html)
        html = self.UNAUTH_RE.sub(unauth_replacer, html)
        return html


# ---------------------------------------------------------------------------
# ChannelMiddleware
# ---------------------------------------------------------------------------

class ChannelMiddleware:
    CHANNEL_PATH_RE = re.compile(r'^/api/channel/([^/]+)(?:/(.*))?$')

    def __init__(self, registry: ModuleRegistry, signer: TokenSigner):
        self.registry = registry
        self.signer = signer

    def handle(self, path: str, method: str = "GET", headers: dict = None,
               query: dict = None, body: dict = None) -> Optional[dict]:
        m = self.CHANNEL_PATH_RE.match(path)
        if not m:
            return None

        module_name = m.group(1)
        sub_path = m.group(2) or ""
        headers = headers or {}
        query = query or {}
        body = body or {}

        # Validate Bearer token
        auth_header = headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return {"status": 401, "data": {"error": "Missing bearer token"}}

        token = auth_header[7:]
        payload = self.signer.verify(token)
        if not payload:
            return {"status": 401, "data": {"error": "Invalid or expired token"}}

        expected_scope = f"channel:{module_name}"
        if payload.get("scope") != expected_scope:
            return {"status": 403, "data": {"error": "Scope mismatch"}}

        handler = self.registry.channel_handlers.get(module_name)
        if not handler:
            return {"status": 404, "data": {"error": f"No handler for module: {module_name}"}}

        user_id = payload.get("sub", "")
        result = handler.handle(sub_path, query, user_id, {"method": method, "body": body})
        return result


# ---------------------------------------------------------------------------
# LET resolver
# ---------------------------------------------------------------------------

class LetResolver:
    LET_RE = re.compile(
        r'<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*/>', re.IGNORECASE
    )

    def resolve(self, html: str, context: dict) -> str:
        def replacer(m):
            name = m.group(1)
            value = m.group(2)
            context[name] = value
            return ""

        return self.LET_RE.sub(replacer, html)


# ---------------------------------------------------------------------------
# htx:script extractor (page-level)
# ---------------------------------------------------------------------------

class ScriptExtractor:
    SCRIPT_RE = re.compile(r'<htx:script>([\s\S]*?)</htx:script>', re.IGNORECASE)

    def extract(self, html: str, collector: list) -> str:
        def replacer(m):
            collector.append(m.group(1))
            return ""
        return self.SCRIPT_RE.sub(replacer, html)


# ---------------------------------------------------------------------------
# Pipeline — 22-stage
# ---------------------------------------------------------------------------

class Pipeline:
    def __init__(self, template_dir: str, adapter: SQLiteAdapter,
                 secret: str = "presto-secret", registry: ModuleRegistry = None):
        self.template_dir = template_dir
        self.adapter = adapter
        self.signer = TokenSigner(secret)
        self.registry = registry or ModuleRegistry()

        self.router = Router(template_dir)
        self.include_resolver = IncludeResolver(template_dir)
        self.component_resolver = ComponentResolver(template_dir)
        self.expression_engine = ExpressionEngine()
        self.data_resolver = DataResolver(adapter)
        self.control_flow = ControlFlow(self.expression_engine)
        self.layout_resolver = LayoutResolver(template_dir)
        self.grant_resolver = GrantResolver(self.signer)
        self.mutation_handler = MutationHandler(self.signer, adapter)
        self.auth_conditionals = AuthConditionals()
        self.channel_middleware = ChannelMiddleware(self.registry, self.signer)
        self.let_resolver = LetResolver()
        self.script_extractor = ScriptExtractor()

    def boot_modules(self, modules: list):
        """Module boot (stage 0)."""
        for mod in modules:
            try:
                manifest = mod.manifest()
                trust = manifest.get("trust", "restricted")
                if trust == "first-party":
                    reg = self.registry
                else:
                    reg = RestrictedRegistry(self.registry, manifest)
                mod.boot(reg)
            except Exception as e:
                logger.error(f"Module {mod.name()} boot failed: {e}")

    def process(self, url_path: str, method: str = "GET",
                headers: dict = None, body: dict = None,
                context: dict = None) -> dict:
        """Run the 22-stage pipeline. Returns {status, headers, body}."""
        headers = headers or {}
        body = body or {}
        context = context or {}
        is_hx = headers.get("HX-Request") == "true"

        # Stage 1: Static files (skipped — handled by Flask)
        # Stage 2: Channel API
        channel_result = self.channel_middleware.handle(
            url_path, method, headers, {}, body
        )
        if channel_result is not None:
            return {
                "status": channel_result["status"],
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(channel_result.get("data", {})),
            }

        # Route resolution
        route = self.router.resolve(url_path)
        if route is None:
            return {"status": 404, "headers": {}, "body": "<h1>404 Not Found</h1>"}
        file_path, params = route
        context["params"] = params

        # Handle POST mutations
        if method == "POST":
            token = body.get("_token", "")
            if token:
                result = self.mutation_handler.execute(token, body)
                return {
                    "status": result.get("status", 200),
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps(result),
                }

        # Read template
        html = open(file_path, "r").read()

        # Stage 3: Middleware chain
        # Build a simple request object
        request = {
            "path": url_path,
            "method": method,
            "headers": headers,
            "body": body,
            "params": params,
        }
        for mw in self.registry.middleware_list:
            # Simple middleware — just call handle and let it modify request
            pass

        # Stage 4: Context providers
        for name, provider in self.registry.context_providers.items():
            provided = provider.resolve(request)
            if isinstance(provided, dict):
                context.update(provided)

        # Stage 5: Pre-layout template processors (extensible, no-op default)

        # Stage 6: Include expansion
        html = self.include_resolver.resolve(html, file_path)

        # Stage 7: Component resolution
        self.component_resolver.script_collector = []
        html = self.component_resolver.resolve(html, file_path)
        script_collector = list(self.component_resolver.script_collector)

        # Stage 8: Page-level htx:script extraction
        html = self.script_extractor.extract(html, script_collector)

        # Stage 9: htx:let binding
        html = self.let_resolver.resolve(html, context)

        # Stage 10: htx:data
        html = self.data_resolver.resolve(html, context, params)

        # Stage 11: htx:grant
        html = self.grant_resolver.resolve(html, context)

        # Stage 12: htx:action
        html = self.mutation_handler.prepare(html, context)

        # Stage 13: htx:auth / htx:unauth
        html = self.auth_conditionals.resolve(html, context)

        # Stage 14: htx:each / htx:if control flow
        html = self.control_flow.resolve(html, context)

        # Stage 15: Expression evaluation
        html = self.expression_engine.evaluate(html, context)

        # Stage 15b: Extract layout directive BEFORE stripping
        layout_directive, html = self.layout_resolver.extract_directive(html)

        # Stage 16: Strip remaining htx: directives (protect htx:raw blocks)
        html = self._strip_directives(html)

        # Stage 17: Post-layout template processors (extensible, no-op)

        # Stage 18: Layout wrapping
        html = self.layout_resolver.wrap(html, layout_directive, file_path, is_hx)

        # Stage 19: Post-layout pass (resolve includes, auth, control flow, expressions in layout)
        html = self.include_resolver.resolve(html, file_path)
        html = self.auth_conditionals.resolve(html, context)
        html = self.control_flow.resolve(html, context)
        html = self.expression_engine.evaluate(html, context)

        # Stage 20: Script injection
        if script_collector:
            script_block = "<!--PRESTO:SCRIPT:BEGIN-->\n"
            for s in script_collector:
                script_block += f"PRESTO_SCRIPT_TAG{s}PRESTO_SCRIPT_END\n"
            script_block += "<!--PRESTO:SCRIPT:END-->"

            if "</body>" in html:
                html = html.replace("</body>", script_block + "\n</body>")
            else:
                html += "\n" + script_block

        # Stage 21: Final expression pass
        html = self.expression_engine.evaluate(html, context)

        # Stage 22: Replace script placeholders + strip htx:raw wrappers
        html = html.replace("PRESTO_SCRIPT_TAG", "<script>")
        html = html.replace("PRESTO_SCRIPT_END", "</script>")
        html = re.sub(
            r'<htx:raw(?:\s[^>]*)?>|</htx:raw>',
            '',
            html,
            flags=re.IGNORECASE
        )

        return {
            "status": 200,
            "headers": {"Content-Type": "text/html"},
            "body": html,
        }

    def _strip_directives(self, html: str) -> str:
        """Stage 16: Strip remaining htx: directives, protecting htx:raw blocks."""
        # Protect htx:raw blocks
        raw_blocks = {}
        counter = [0]

        def protect_raw(m):
            key = f"__RAW_PROTECT_{counter[0]}__"
            counter[0] += 1
            raw_blocks[key] = m.group(0)
            return key

        raw_re = re.compile(r'<htx:raw(?:\s[^>]*)?>[\s\S]*?</htx:raw>', re.IGNORECASE)
        html = raw_re.sub(protect_raw, html)

        # Strip layout directives (already extracted in 15b)
        html = self.layout_resolver.LAYOUT_RE.sub("", html)

        # Strip self-closing htx: tags
        html = re.sub(r'<htx:\w+[^>]*/>', '', html, flags=re.IGNORECASE)
        # Strip opening htx: tags
        html = re.sub(r'<htx:\w+[^>]*>', '', html, flags=re.IGNORECASE)
        # Strip closing htx: tags
        html = re.sub(r'</htx:\w+>', '', html, flags=re.IGNORECASE)

        # Restore htx:raw blocks
        for key, val in raw_blocks.items():
            html = html.replace(key, val)

        return html
