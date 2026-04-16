"""
PRESTO engine conformance tests — 22 tests matching the verification list.
"""

import os
import sys
import time
import json
import unittest

# Ensure the project is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import (
    Pipeline, SQLiteAdapter, ModuleRegistry, TokenSigner,
    ExpressionEngine, html_escape, resolve_path, is_truthy,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
SECRET = "test-secret-key"


def make_pipeline():
    adapter = SQLiteAdapter(":memory:")
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

    registry = ModuleRegistry()

    # Register a demo channel handler for tests 18-20
    class DemoHandler:
        def module(self):
            return "demo"
        def handle(self, sub_path, query, user_id, context):
            return {"status": 200, "data": {"message": "ok", "user": user_id}}

    registry.register_channel_handler(DemoHandler())

    pipeline = Pipeline(TEMPLATE_DIR, adapter, secret=SECRET, registry=registry)
    return pipeline, adapter


class TestPRESTOConformance(unittest.TestCase):
    """22 tests matching the PRESTO-SPEC verification list."""

    @classmethod
    def setUpClass(cls):
        cls.pipeline, cls.adapter = make_pipeline()
        cls.signer = TokenSigner(SECRET)

    # ------------------------------------------------------------------
    # 1. Home page renders with layout
    # ------------------------------------------------------------------
    def test_01_home_page_with_layout(self):
        result = self.pipeline.process("/", context={"auth": {"user": None}})
        self.assertEqual(result["status"], 200)
        self.assertIn("<!DOCTYPE html>", result["body"])
        self.assertIn("<h1>Pages</h1>", result["body"])
        self.assertIn("</body>", result["body"])

    # ------------------------------------------------------------------
    # 2. 404 for missing route
    # ------------------------------------------------------------------
    def test_02_missing_route_404(self):
        result = self.pipeline.process("/nonexistent-page")
        self.assertEqual(result["status"], 404)

    # ------------------------------------------------------------------
    # 3. Dynamic [slug] resolves with params
    # ------------------------------------------------------------------
    def test_03_dynamic_slug_route(self):
        result = self.pipeline.process("/blog/first-post",
                                       context={"auth": {"user": None}})
        self.assertEqual(result["status"], 200)
        self.assertIn("First Post", result["body"])

    # ------------------------------------------------------------------
    # 4. Include expands partial
    # ------------------------------------------------------------------
    def test_04_include_expands(self):
        result = self.pipeline.process("/showcase",
                                       context={"auth": {"user": None}})
        self.assertEqual(result["status"], 200)
        self.assertIn("<nav>Home | About</nav>", result["body"])

    # ------------------------------------------------------------------
    # 5. Component renders with props + slot
    # ------------------------------------------------------------------
    def test_05_component_props_slot(self):
        result = self.pipeline.process("/showcase",
                                       context={"auth": {"user": None}})
        self.assertEqual(result["status"], 200)
        self.assertIn("Demo Card", result["body"])
        self.assertIn("Slot content", result["body"])
        self.assertIn("card", result["body"])

    # ------------------------------------------------------------------
    # 6. htx:v resolves, pipes work, HTML escaped
    # ------------------------------------------------------------------
    def test_06_expression_pipes_escaping(self):
        ee = ExpressionEngine()
        ctx = {"name": "<b>Test</b>", "title": "presto"}
        html = '<p><htx:v>name</htx:v></p><span><htx:v>title | uppercase</htx:v></span>'
        out = ee.evaluate(html, ctx)
        self.assertIn("&lt;b&gt;Test&lt;/b&gt;", out)
        self.assertIn("PRESTO", out)

    # ------------------------------------------------------------------
    # 7. htx:v raw outputs unescaped
    # ------------------------------------------------------------------
    def test_07_raw_output(self):
        ee = ExpressionEngine()
        ctx = {"html": "<b>bold</b>"}
        html = '<div><htx:v raw>html</htx:v></div>'
        out = ee.evaluate(html, ctx)
        self.assertIn("<b>bold</b>", out)
        self.assertNotIn("&lt;", out)

    # ------------------------------------------------------------------
    # 8. Script blocks untouched by expression engine
    # ------------------------------------------------------------------
    def test_08_script_protection(self):
        ee = ExpressionEngine()
        ctx = {"name": "Test"}
        html = '<p><htx:v>name</htx:v></p>\n<script>var x = "{htx:name}";</script>'
        out = ee.evaluate(html, ctx)
        self.assertIn("<p>Test</p>", out)
        self.assertIn('{htx:name}', out)
        self.assertIn("<script>", out)

    # ------------------------------------------------------------------
    # 9. htx:raw blocks untouched
    # ------------------------------------------------------------------
    def test_09_raw_blocks_untouched(self):
        result = self.pipeline.process("/showcase",
                                       context={"auth": {"user": None}})
        body = result["body"]
        # The htx:raw wrapper gets stripped (stage 22), but the inner content
        # must NOT have been evaluated
        self.assertIn("<htx:v>not.evaluated</htx:v>", body)

    # ------------------------------------------------------------------
    # 10. htx:data + htx:each renders database records
    # ------------------------------------------------------------------
    def test_10_data_each_renders(self):
        result = self.pipeline.process("/", context={"auth": {"user": None}})
        self.assertEqual(result["status"], 200)
        self.assertIn("Home", result["body"])
        self.assertIn("About", result["body"])
        self.assertIn("Contact", result["body"])
        self.assertIn("Welcome to PRESTO", result["body"])

    # ------------------------------------------------------------------
    # 11. htx:if true shows, false hides
    # ------------------------------------------------------------------
    def test_11_if_true_shows(self):
        result = self.pipeline.process("/showcase",
                                       context={"auth": {"user": None}})
        self.assertIn("Title is set", result["body"])

    # ------------------------------------------------------------------
    # 12. htx:else shows when condition false
    # ------------------------------------------------------------------
    def test_12_else_shows_when_false(self):
        from engine import ControlFlow
        ee = ExpressionEngine()
        cf = ControlFlow(ee)
        html = '<htx:if test="user"><p>Yes</p></htx:if><htx:else><p>No</p></htx:else>'
        out = cf.resolve(html, {"user": None})
        self.assertIn("No", out)
        self.assertNotIn("Yes", out)

    # ------------------------------------------------------------------
    # 13. htx:empty renders for empty collection
    # ------------------------------------------------------------------
    def test_13_empty_collection(self):
        from engine import ControlFlow
        ee = ExpressionEngine()
        cf = ControlFlow(ee)
        html = '<htx:each items="items" as="item"><li><htx:v>item.name</htx:v></li><htx:empty><p>No items.</p></htx:each>'
        out = cf.resolve(html, {"items": []})
        self.assertIn("No items.", out)
        self.assertNotIn("<li>", out)

    # ------------------------------------------------------------------
    # 14. htx:grant materializes signed token
    # ------------------------------------------------------------------
    def test_14_grant_materializes_token(self):
        from engine import GrantResolver
        signer = TokenSigner(SECRET)
        gr = GrantResolver(signer)
        ctx = {"auth": {"user": {"name": "tester"}}}
        html = '<htx:grant type="channel" module="demo" as="demo_token" />'
        gr.resolve(html, ctx)
        self.assertIn("demo_token", ctx)
        token = ctx["demo_token"]
        payload = signer.verify(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["scope"], "channel:demo")

    # ------------------------------------------------------------------
    # 15. htx:auth hides from unauthenticated
    # ------------------------------------------------------------------
    def test_15_auth_hides_unauthed(self):
        from engine import AuthConditionals
        ac = AuthConditionals()
        html = '<htx:auth><p>Logged in</p></htx:auth><htx:unauth><p>Please sign in</p></htx:unauth>'
        out = ac.resolve(html, {"auth": {"user": None}})
        self.assertIn("Please sign in", out)
        self.assertNotIn("Logged in", out)

    # ------------------------------------------------------------------
    # 16. htx:layout none = no wrapping
    # ------------------------------------------------------------------
    def test_16_layout_none(self):
        result = self.pipeline.process("/showcase",
                                       context={"auth": {"user": None}})
        self.assertNotIn("<!DOCTYPE html>", result["body"])
        self.assertIn("Showcase", result["body"])

    # ------------------------------------------------------------------
    # 17. htx:layout src = explicit layout
    # ------------------------------------------------------------------
    def test_17_layout_src(self):
        # Create a temp template with explicit layout
        import tempfile
        alt_layout = os.path.join(TEMPLATE_DIR, "_alt_layout.htx")
        page_file = os.path.join(TEMPLATE_DIR, "layout_test.htx")
        try:
            with open(alt_layout, "w") as f:
                f.write('<div class="alt">__content__</div>')
            with open(page_file, "w") as f:
                f.write('<htx:layout src="_alt_layout.htx" />\n<p>Custom layout</p>')

            result = self.pipeline.process("/layout_test",
                                           context={"auth": {"user": None}})
            self.assertIn("alt", result["body"])
            self.assertIn("Custom layout", result["body"])
        finally:
            for f in [alt_layout, page_file]:
                if os.path.exists(f):
                    os.remove(f)

    # ------------------------------------------------------------------
    # 18. Channel API 200 with valid token
    # ------------------------------------------------------------------
    def test_18_channel_valid_token(self):
        token = self.signer.sign({
            "sub": "tester",
            "scope": "channel:demo",
            "exp": int(time.time()) + 120,
            "jti": "test-jti",
        })
        result = self.pipeline.process(
            "/api/channel/demo/test",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(result["status"], 200)
        data = json.loads(result["body"])
        self.assertEqual(data["message"], "ok")

    # ------------------------------------------------------------------
    # 19. Channel API 401 with invalid token
    # ------------------------------------------------------------------
    def test_19_channel_invalid_token(self):
        result = self.pipeline.process(
            "/api/channel/demo/test",
            headers={"Authorization": "Bearer invalid.token"},
        )
        self.assertEqual(result["status"], 401)

    # ------------------------------------------------------------------
    # 20. Channel API 403 with wrong scope
    # ------------------------------------------------------------------
    def test_20_channel_wrong_scope(self):
        token = self.signer.sign({
            "sub": "tester",
            "scope": "channel:other",
            "exp": int(time.time()) + 120,
            "jti": "test-jti",
        })
        result = self.pipeline.process(
            "/api/channel/demo/test",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(result["status"], 403)

    # ------------------------------------------------------------------
    # 21. Action token roundtrip succeeds
    # ------------------------------------------------------------------
    def test_21_action_token_roundtrip(self):
        from engine import MutationHandler
        mh = MutationHandler(self.signer, self.adapter)

        token = self.signer.sign({
            "action": "create",
            "type": "page",
            "recordId": "",
            "exp": int(time.time()) + 3600,
        })
        result = mh.execute(token, {"title": "New Page", "slug": "new-page",
                                     "body": "New content", "status": "published"})
        self.assertEqual(result["status"], 200)
        self.assertIn("data", result)
        self.assertEqual(result["data"]["title"], "New Page")

    # ------------------------------------------------------------------
    # 22. Tampered action token rejected
    # ------------------------------------------------------------------
    def test_22_tampered_token_rejected(self):
        from engine import MutationHandler
        mh = MutationHandler(self.signer, self.adapter)

        token = self.signer.sign({
            "action": "delete",
            "type": "page",
            "recordId": "1",
            "exp": int(time.time()) + 3600,
        })
        # Tamper with the payload portion
        parts = token.split(".")
        tampered = parts[0] + "x." + parts[1]
        result = mh.execute(tampered)
        self.assertEqual(result["status"], 403)


if __name__ == "__main__":
    unittest.main()
