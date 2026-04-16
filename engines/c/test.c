/*
 * test.c - 22 verification tests for htxlang conformance
 * Simple assert-based, no framework needed.
 */

#include "engine.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <time.h>
#include <sys/stat.h>
#include <sqlite3.h>

static int tests_passed = 0;
static int tests_failed = 0;

#define TEST_START(n, name) \
    printf("Test %2d: %-45s ", n, name); fflush(stdout);

#define TEST_PASS() do { \
    printf("[PASS]\n"); tests_passed++; \
} while(0)

#define TEST_FAIL(msg) do { \
    printf("[FAIL] %s\n", msg); tests_failed++; \
} while(0)

#define EXPECT_CONTAINS(haystack, needle) do { \
    if (!strstr(haystack, needle)) { \
        fprintf(stderr, "    Expected to contain: \"%s\"\n    Got: \"%s\"\n", needle, haystack); \
        TEST_FAIL("missing expected content"); goto cleanup; \
    } \
} while(0)

#define EXPECT_NOT_CONTAINS(haystack, needle) do { \
    if (strstr(haystack, needle)) { \
        fprintf(stderr, "    Expected NOT to contain: \"%s\"\n", needle); \
        TEST_FAIL("unexpected content present"); goto cleanup; \
    } \
} while(0)

/* ---- Helpers ---- */
static HtxEngine       g_engine;
static sqlite3        *g_db = NULL;
static HtxContentAdapter *g_adapter = NULL;

static HtxChannelHandler g_test_handler;

static HtxResponse *test_channel_handle(HtxChannelHandler *self,
    const char *sub_path, const char *query,
    const char *user_id, const char *method, HtxContext *body) {
    (void)self; (void)query; (void)method; (void)body;
    char buf[256];
    snprintf(buf, sizeof(buf), "{\"path\":\"%s\",\"user\":\"%s\"}", sub_path, user_id);
    return htx_response_new(200, "application/json", buf);
}

static void setup(void) {
    /* Create test database */
    sqlite3_open(":memory:", &g_db);

    const char *sqls[] = {
        "CREATE TABLE [post] (id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " slug TEXT, title TEXT, body TEXT, status TEXT);",
        "INSERT INTO [post] (slug, title, body, status) VALUES ('first', 'First', 'Content 1', 'published');",
        "INSERT INTO [post] (slug, title, body, status) VALUES ('second', 'Second', 'Content 2', 'published');",
        "INSERT INTO [post] (slug, title, body, status) VALUES ('third', 'Third', 'Content 3', 'published');",
        NULL
    };
    for (int i = 0; sqls[i]; i++) {
        sqlite3_exec(g_db, sqls[i], NULL, NULL, NULL);
    }

    g_adapter = htx_sqlite_adapter_new(g_db);

    htx_engine_init(&g_engine, "templates", "public",
                    "test-secret-key-for-verification", g_adapter);

    /* Register test channel handler */
    g_test_handler.module_name = "echo";
    g_test_handler.handle = test_channel_handle;
    g_engine.registry.ch_handlers[g_engine.registry.ch_count++] = &g_test_handler;

    mkdir("public", 0755);
}

static void teardown(void) {
    htx_sqlite_adapter_free(g_adapter);
    sqlite3_close(g_db);
}

static HtxResponse *run_get(const char *path, HtxValue *auth_user) {
    HtxRequest req;
    memset(&req, 0, sizeof(req));
    req.method = "GET";
    req.path = path;
    req.auth_user = auth_user;
    return htx_pipeline(&g_engine, &req);
}

static HtxResponse *run_get_hx(const char *path) {
    HtxRequest req;
    memset(&req, 0, sizeof(req));
    req.method = "GET";
    req.path = path;
    req.hx_request = true;
    return htx_pipeline(&g_engine, &req);
}

static HtxResponse *run_channel(const char *path, const char *auth_header) {
    HtxRequest req;
    memset(&req, 0, sizeof(req));
    req.method = "GET";
    req.path = path;
    req.auth_header = auth_header;
    return htx_pipeline(&g_engine, &req);
}

/* ====== TESTS ====== */

/* Test 1: Home page renders with layout */
static void test_01(void) {
    TEST_START(1, "Home page renders with layout");
    HtxResponse *r = run_get("/", NULL);
    EXPECT_CONTAINS(r->body, "<!DOCTYPE html>");
    EXPECT_CONTAINS(r->body, "<h1>Recent Posts</h1>");
    EXPECT_CONTAINS(r->body, "</body>");
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 2: 404 for missing route */
static void test_02(void) {
    TEST_START(2, "404 for missing route");
    HtxResponse *r = run_get("/nonexistent/page", NULL);
    if (r->status != 404) { TEST_FAIL("expected 404"); goto cleanup; }
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 3: Dynamic [slug] resolves with params */
static void test_03(void) {
    TEST_START(3, "Dynamic [slug] resolves with params");
    HtxResponse *r = run_get("/blog/first", NULL);
    EXPECT_CONTAINS(r->body, "First");
    if (r->status != 200) { TEST_FAIL("expected 200"); goto cleanup; }
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 4: Include expands partial */
static void test_04(void) {
    TEST_START(4, "Include expands partial");
    HtxResponse *r = run_get("/", NULL);
    EXPECT_CONTAINS(r->body, "<nav>Home | About</nav>");
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 5: Component renders with props + slot */
static void test_05(void) {
    TEST_START(5, "Component renders with props + slot");
    HtxResponse *r = run_get("/", NULL);
    /* Components should render <article><h2>Title</h2>... */
    EXPECT_CONTAINS(r->body, "<article>");
    EXPECT_CONTAINS(r->body, "</article>");
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 6: htx:v resolves, pipes work, HTML escaped */
static void test_06(void) {
    TEST_START(6, "htx:v resolves, pipes, HTML escaped");
    /* Use expression evaluation directly */
    HtxContext *ctx = htx_ctx_new();
    htx_ctx_set(ctx, "name", htx_val_string("<b>Jared</b>"));
    htx_ctx_set(ctx, "title", htx_val_string("presto"));

    char *r = htx_eval_expressions(
        "<p><htx:v>name</htx:v></p><span><htx:v>title | uppercase</htx:v></span>", ctx);
    EXPECT_CONTAINS(r, "&lt;b&gt;Jared&lt;/b&gt;");
    EXPECT_CONTAINS(r, "PRESTO");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 7: htx:v raw outputs unescaped */
static void test_07(void) {
    TEST_START(7, "htx:v raw outputs unescaped");
    HtxContext *ctx = htx_ctx_new();
    htx_ctx_set(ctx, "html", htx_val_string("<b>bold</b>"));
    char *r = htx_eval_expressions("<div><htx:v raw>html</htx:v></div>", ctx);
    EXPECT_CONTAINS(r, "<b>bold</b>");
    EXPECT_NOT_CONTAINS(r, "&lt;");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 8: Script blocks untouched by expression engine */
static void test_08(void) {
    TEST_START(8, "Script blocks untouched");
    HtxContext *ctx = htx_ctx_new();
    htx_ctx_set(ctx, "name", htx_val_string("Test"));
    char *r = htx_eval_expressions(
        "<p><htx:v>name</htx:v></p><script>var x = \"{htx:name}\";</script>", ctx);
    EXPECT_CONTAINS(r, "<p>Test</p>");
    EXPECT_CONTAINS(r, "var x = \"{htx:name}\";");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 9: htx:raw blocks untouched */
static void test_09(void) {
    TEST_START(9, "htx:raw blocks untouched");
    HtxContext *ctx = htx_ctx_new();
    /* The raw block should be protected during eval, then unwrapped in finalize */
    char *r = htx_eval_expressions(
        "<htx:raw><htx:v>not.evaluated</htx:v></htx:raw>", ctx);
    /* After eval, raw wrapper still intact */
    char *final = htx_finalize_scripts(r);
    EXPECT_CONTAINS(final, "<htx:v>not.evaluated</htx:v>");
    EXPECT_NOT_CONTAINS(final, "<htx:raw>");
    TEST_PASS();
cleanup:
    free(r);
    free(final);
    htx_ctx_free(ctx);
}

/* Test 10: htx:data + htx:each renders database records */
static void test_10(void) {
    TEST_START(10, "htx:data + htx:each renders records");
    HtxResponse *r = run_get("/", NULL);
    EXPECT_CONTAINS(r->body, "Third");
    EXPECT_CONTAINS(r->body, "Second");
    EXPECT_CONTAINS(r->body, "First");
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 11: htx:if true shows, false hides */
static void test_11(void) {
    TEST_START(11, "htx:if true shows, false hides");
    HtxContext *ctx = htx_ctx_new();
    htx_ctx_set(ctx, "show", htx_val_bool(true));
    htx_ctx_set(ctx, "hide", htx_val_bool(false));

    char *r = htx_resolve_control_flow(
        "<htx:if test=\"show\"><p>Visible</p></htx:if>"
        "<htx:if test=\"hide\"><p>Hidden</p></htx:if>", ctx);
    EXPECT_CONTAINS(r, "Visible");
    EXPECT_NOT_CONTAINS(r, "Hidden");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 12: htx:else shows when condition false */
static void test_12(void) {
    TEST_START(12, "htx:else shows when condition false");
    HtxContext *ctx = htx_ctx_new();
    htx_ctx_set(ctx, "logged_in", htx_val_bool(false));

    char *r = htx_resolve_control_flow(
        "<htx:if test=\"logged_in\"><p>Welcome</p></htx:if>"
        "<htx:else><p>Sign in</p></htx:else>", ctx);
    EXPECT_CONTAINS(r, "Sign in");
    EXPECT_NOT_CONTAINS(r, "Welcome");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 13: htx:empty renders for empty collection */
static void test_13(void) {
    TEST_START(13, "htx:empty renders for empty collection");
    HtxContext *ctx = htx_ctx_new();
    htx_ctx_set(ctx, "items", htx_val_array());

    char *r = htx_resolve_control_flow(
        "<htx:each items=\"items\" as=\"item\">"
        "<li><htx:v>item.name</htx:v></li>"
        "<htx:empty>"
        "<p>No items.</p>"
        "</htx:each>", ctx);
    EXPECT_CONTAINS(r, "No items.");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 14: htx:grant materializes signed token */
static void test_14(void) {
    TEST_START(14, "htx:grant materializes signed token");
    HtxContext *ctx = htx_ctx_new();
    char *tmpl = htx_strdup("<htx:grant type=\"websocket\" as=\"ws_token\" />");
    char *result;
    htx_resolve_grants(&g_engine, tmpl, ctx, &result);

    HtxValue *tok = htx_ctx_get(ctx, "ws_token");
    if (!tok || tok->type != HTX_VAL_STRING || !tok->d.sval[0]) {
        TEST_FAIL("no token materialized"); goto cleanup;
    }
    /* verify token is valid */
    char *payload;
    if (!htx_verify_token(tok->d.sval, g_engine.secret, &payload)) {
        TEST_FAIL("token verification failed"); goto cleanup;
    }
    EXPECT_CONTAINS(payload, "websocket");
    free(payload);
    TEST_PASS();
cleanup:
    free(tmpl);
    free(result);
    htx_ctx_free(ctx);
}

/* Test 15: htx:auth hides from unauthenticated */
static void test_15(void) {
    TEST_START(15, "htx:auth hides from unauthenticated");
    HtxContext *ctx = htx_ctx_new();
    HtxValue *auth = htx_val_object();
    htx_val_object_set(auth, "user", htx_val_null());
    htx_ctx_set(ctx, "auth", auth);

    char *r = htx_resolve_auth(
        "<htx:auth><p>Logged in</p></htx:auth>"
        "<htx:unauth><p>Please sign in</p></htx:unauth>", ctx);
    EXPECT_CONTAINS(r, "Please sign in");
    EXPECT_NOT_CONTAINS(r, "Logged in");
    TEST_PASS();
cleanup:
    free(r);
    htx_ctx_free(ctx);
}

/* Test 16: htx:layout none = no wrapping */
static void test_16(void) {
    TEST_START(16, "htx:layout none = no wrapping");
    HtxResponse *r = run_get("/expressions", NULL);
    EXPECT_NOT_CONTAINS(r->body, "<!DOCTYPE html>");
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 17: htx:layout src = explicit layout */
static void test_17(void) {
    TEST_START(17, "htx:layout src = explicit layout");
    /* Test layout directive extraction */
    char *layout_src = NULL;
    bool layout_none = false;
    char *r = htx_extract_layout_directive(
        "<htx:layout src=\"/_layout.htx\" />\n<h1>Test</h1>",
        &layout_src, &layout_none);
    if (!layout_src) { TEST_FAIL("no layout src extracted"); goto cleanup; }
    if (strcmp(layout_src, "/_layout.htx") != 0) {
        TEST_FAIL("wrong layout src"); goto cleanup;
    }
    if (layout_none) { TEST_FAIL("layout_none should be false"); goto cleanup; }
    TEST_PASS();
cleanup:
    free(r);
    free(layout_src);
}

/* Test 18: Channel API 200 with valid token */
static void test_18(void) {
    TEST_START(18, "Channel API 200 with valid token");
    /* Create a valid channel token for module "echo" */
    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"sub\":\"user1\",\"scope\":\"channel:echo\",\"exp\":%ld}",
             (long)(time(NULL) + 120));
    char *token = htx_sign_token(payload, g_engine.secret);
    char auth[512];
    snprintf(auth, sizeof(auth), "Bearer %s", token);

    HtxResponse *r = run_channel("/api/channel/echo/test", auth);
    if (r->status != 200) {
        fprintf(stderr, "    Status: %d, Body: %s\n", r->status, r->body);
        TEST_FAIL("expected 200"); goto cleanup;
    }
    EXPECT_CONTAINS(r->body, "test");
    TEST_PASS();
cleanup:
    free(token);
    htx_response_free(r);
}

/* Test 19: Channel API 401 with invalid token */
static void test_19(void) {
    TEST_START(19, "Channel API 401 with invalid token");
    HtxResponse *r = run_channel("/api/channel/echo/test", "Bearer invalid.token.here");
    if (r->status != 401) { TEST_FAIL("expected 401"); goto cleanup; }
    TEST_PASS();
cleanup:
    htx_response_free(r);
}

/* Test 20: Channel API 403 with wrong scope */
static void test_20(void) {
    TEST_START(20, "Channel API 403 with wrong scope");
    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"sub\":\"user1\",\"scope\":\"channel:other\",\"exp\":%ld}",
             (long)(time(NULL) + 120));
    char *token = htx_sign_token(payload, g_engine.secret);
    char auth[512];
    snprintf(auth, sizeof(auth), "Bearer %s", token);

    HtxResponse *r = run_channel("/api/channel/echo/test", auth);
    if (r->status != 403) {
        fprintf(stderr, "    Status: %d\n", r->status);
        TEST_FAIL("expected 403"); goto cleanup;
    }
    TEST_PASS();
cleanup:
    free(token);
    htx_response_free(r);
}

/* Test 21: Action token roundtrip succeeds */
static void test_21(void) {
    TEST_START(21, "Action token roundtrip succeeds");
    /* Sign an action token */
    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"action\":\"update\",\"type\":\"post\",\"recordId\":\"1\",\"exp\":%ld}",
             (long)(time(NULL) + 3600));
    char *token = htx_sign_token(payload, g_engine.secret);

    /* Verify it */
    char *decoded = NULL;
    bool valid = htx_verify_token(token, g_engine.secret, &decoded);
    if (!valid) { TEST_FAIL("token verification failed"); goto cleanup; }
    EXPECT_CONTAINS(decoded, "update");
    EXPECT_CONTAINS(decoded, "post");
    TEST_PASS();
cleanup:
    free(token);
    free(decoded);
}

/* Test 22: Tampered action token rejected */
static void test_22(void) {
    TEST_START(22, "Tampered action token rejected");
    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"action\":\"delete\",\"type\":\"post\",\"recordId\":\"1\",\"exp\":%ld}",
             (long)(time(NULL) + 3600));
    char *token = htx_sign_token(payload, g_engine.secret);

    /* Tamper: modify a character in the signature */
    size_t tlen = strlen(token);
    if (tlen > 2) {
        token[tlen - 2] = (token[tlen - 2] == 'A') ? 'B' : 'A';
    }

    char *decoded = NULL;
    bool valid = htx_verify_token(token, g_engine.secret, &decoded);
    if (valid) { TEST_FAIL("tampered token should be rejected"); goto cleanup; }
    TEST_PASS();
cleanup:
    free(token);
    free(decoded);
}

/* ====== MAIN ====== */
int main(void) {
    printf("PRESTO/C Verification Tests\n");
    printf("=========================================\n\n");

    setup();

    test_01();
    test_02();
    test_03();
    test_04();
    test_05();
    test_06();
    test_07();
    test_08();
    test_09();
    test_10();
    test_11();
    test_12();
    test_13();
    test_14();
    test_15();
    test_16();
    test_17();
    test_18();
    test_19();
    test_20();
    test_21();
    test_22();

    printf("\n=========================================\n");
    printf("Results: %d passed, %d failed, %d total\n",
           tests_passed, tests_failed, tests_passed + tests_failed);
    printf("=========================================\n");

    teardown();

    return tests_failed > 0 ? 1 : 0;
}
