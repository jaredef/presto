/*
 * main.c - PRESTO htxlang server on port 4005
 * Uses libmicrohttpd, seeds demo data via SQLite.
 */

#include "engine.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <sys/stat.h>
#include <unistd.h>

#include <microhttpd.h>
#include <sqlite3.h>

/* ---- Globals ---- */
static HtxEngine       g_engine;
static sqlite3        *g_db        = NULL;
static HtxContentAdapter *g_adapter = NULL;
static volatile int    g_running   = 1;

/* ---- Demo channel handler ---- */
static HtxResponse *echo_handle(HtxChannelHandler *self,
                                const char *sub_path, const char *query,
                                const char *user_id, const char *method,
                                HtxContext *body) {
    (void)self; (void)query; (void)method; (void)body;
    char buf[512];
    snprintf(buf, sizeof(buf),
             "{\"echo\":\"%s\",\"user\":\"%s\"}", sub_path, user_id);
    return htx_response_new(200, "application/json", buf);
}

static HtxChannelHandler g_echo_handler = {
    .module_name = "echo",
    .userdata    = NULL,
    .handle      = echo_handle
};

/* ---- Seed data ---- */
static void seed_database(sqlite3 *db) {
    const char *sqls[] = {
        "CREATE TABLE IF NOT EXISTS [post] ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  slug TEXT, title TEXT, body TEXT, status TEXT,"
        "  created_at TEXT DEFAULT CURRENT_TIMESTAMP"
        ");",
        "DELETE FROM [post];",
        "INSERT INTO [post] (slug, title, body, status) VALUES "
        "  ('first', 'First', 'Content 1', 'published');",
        "INSERT INTO [post] (slug, title, body, status) VALUES "
        "  ('second', 'Second', 'Content 2', 'published');",
        "INSERT INTO [post] (slug, title, body, status) VALUES "
        "  ('third', 'Third', 'Content 3', 'published');",
        "INSERT INTO [post] (slug, title, body, status) VALUES "
        "  ('draft', 'Draft Post', 'Not visible', 'draft');",
        NULL
    };
    for (int i = 0; sqls[i]; i++) {
        char *err = NULL;
        sqlite3_exec(db, sqls[i], NULL, NULL, &err);
        if (err) { fprintf(stderr, "SQL error: %s\n", err); sqlite3_free(err); }
    }
    printf("  Seeded 4 posts (3 published, 1 draft)\n");
}

/* ---- POST body accumulator for MHD ---- */
struct PostData {
    char   *data;
    size_t  len;
    size_t  cap;
};

static void post_data_init(struct PostData *pd) {
    pd->cap = 4096;
    pd->data = malloc(pd->cap);
    pd->data[0] = '\0';
    pd->len = 0;
}

/* ---- MHD request handler ---- */
static enum MHD_Result
handle_request(void *cls,
               struct MHD_Connection *conn,
               const char *url,
               const char *method,
               const char *version,
               const char *upload_data,
               size_t *upload_data_size,
               void **con_cls)
{
    (void)cls; (void)version;

    /* First call: allocate post data */
    if (*con_cls == NULL) {
        struct PostData *pd = malloc(sizeof(struct PostData));
        post_data_init(pd);
        *con_cls = pd;
        return MHD_YES;
    }

    struct PostData *pd = (struct PostData *)*con_cls;

    /* Accumulate upload data */
    if (*upload_data_size > 0) {
        while (pd->len + *upload_data_size + 1 > pd->cap) {
            pd->cap *= 2;
            pd->data = realloc(pd->data, pd->cap);
        }
        memcpy(pd->data + pd->len, upload_data, *upload_data_size);
        pd->len += *upload_data_size;
        pd->data[pd->len] = '\0';
        *upload_data_size = 0;
        return MHD_YES;
    }

    /* Build HtxRequest */
    HtxRequest req;
    memset(&req, 0, sizeof(req));
    req.method = method;
    req.path = url;

    /* Extract headers */
    const char *hx = MHD_lookup_connection_value(conn, MHD_HEADER_KIND, "HX-Request");
    req.hx_request = (hx != NULL);
    req.auth_header = MHD_lookup_connection_value(conn, MHD_HEADER_KIND, "Authorization");
    req.cookie_header = MHD_lookup_connection_value(conn, MHD_HEADER_KIND, "Cookie");
    req.content_type = MHD_lookup_connection_value(conn, MHD_HEADER_KIND, "Content-Type");
    req.body_raw = pd->data;
    req.body_len = pd->len;

    /* Process through pipeline */
    HtxResponse *resp = htx_pipeline(&g_engine, &req);

    struct MHD_Response *mhd_resp = MHD_create_response_from_buffer(
        resp->body_len, resp->body, MHD_RESPMEM_MUST_COPY);
    MHD_add_response_header(mhd_resp, "Content-Type", resp->content_type);
    MHD_add_response_header(mhd_resp, "X-Powered-By", "PRESTO/C");

    enum MHD_Result ret = MHD_queue_response(conn, (unsigned int)resp->status, mhd_resp);
    MHD_destroy_response(mhd_resp);
    htx_response_free(resp);

    /* Free body context if allocated */
    if (req.body_ctx) htx_ctx_free(req.body_ctx);

    /* Free post data */
    free(pd->data);
    free(pd);
    *con_cls = NULL;

    return ret;
}

static void sighandler(int sig) {
    (void)sig;
    g_running = 0;
}

int main(int argc, char **argv) {
    int port = 4005;
    const char *db_path = "presto.db";
    const char *tpl_dir = "templates";
    const char *pub_dir = "public";
    const char *secret  = "presto-c-secret-key-change-in-production";

    if (argc > 1) port = atoi(argv[1]);

    printf("PRESTO/C htxlang engine\n");
    printf("  Port:      %d\n", port);
    printf("  Templates: %s/\n", tpl_dir);

    /* Open SQLite */
    if (sqlite3_open(db_path, &g_db) != SQLITE_OK) {
        fprintf(stderr, "Failed to open database: %s\n", sqlite3_errmsg(g_db));
        return 1;
    }
    seed_database(g_db);

    /* Create adapter */
    g_adapter = htx_sqlite_adapter_new(g_db);

    /* Init engine */
    htx_engine_init(&g_engine, tpl_dir, pub_dir, secret, g_adapter);

    /* Register echo channel handler */
    g_engine.registry.ch_handlers[g_engine.registry.ch_count++] = &g_echo_handler;

    /* Boot engine (modules) */
    htx_engine_boot(&g_engine);

    /* Create public dir if needed */
    mkdir("public", 0755);

    /* Start server */
    struct MHD_Daemon *daemon = MHD_start_daemon(
        MHD_USE_INTERNAL_POLLING_THREAD,
        (uint16_t)port, NULL, NULL,
        &handle_request, NULL,
        MHD_OPTION_END);

    if (!daemon) {
        fprintf(stderr, "Failed to start HTTP server on port %d\n", port);
        sqlite3_close(g_db);
        htx_sqlite_adapter_free(g_adapter);
        return 1;
    }

    printf("  Server running at http://localhost:%d\n", port);
    printf("  Press Ctrl+C to stop.\n\n");

    signal(SIGINT, sighandler);
    signal(SIGTERM, sighandler);

    while (g_running) {
        sleep(1);
    }

    printf("\nShutting down...\n");
    MHD_stop_daemon(daemon);
    sqlite3_close(g_db);
    htx_sqlite_adapter_free(g_adapter);

    return 0;
}
