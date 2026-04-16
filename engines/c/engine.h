/*
 * engine.h - htxlang conformant engine (PRESTO)
 * Structs, interfaces, function declarations.
 */
#ifndef ENGINE_H
#define ENGINE_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include <sqlite3.h>

/* ---- Limits ---- */
#define HTX_MAX_INCLUDE_DEPTH  10
#define HTX_MAX_PATH           4096
#define HTX_MAX_PARAMS         32
#define HTX_MAX_MODULES        32
#define HTX_MAX_MIDDLEWARE      32
#define HTX_MAX_CONTEXT_PROVS  32
#define HTX_MAX_CHANNEL_HDLRS  32
#define HTX_MAX_VISITED        64
#define HTX_MAX_ACTIONS        64
#define HTX_MAX_SCRIPTS        128
#define HTX_MAX_MARKERS        256
#define HTX_SECRET_LEN         64
#define HTX_UUID_LEN           37  /* 36 chars + NUL */

/* ---- Error codes ---- */
#define HTX_OK            0
#define HTX_ERR_NOT_FOUND 1
#define HTX_ERR_PATH      2
#define HTX_ERR_CIRCULAR  3
#define HTX_ERR_DEPTH     4
#define HTX_ERR_IO        5
#define HTX_ERR_TOKEN     6
#define HTX_ERR_AUTH      7
#define HTX_ERR_SCOPE     8
#define HTX_ERR_INTERNAL  9
#define HTX_ERR_ALLOC    10

/* ---- Forward declarations ---- */
typedef struct HtxValue       HtxValue;
typedef struct HtxContext      HtxContext;
typedef struct HtxRequest      HtxRequest;
typedef struct HtxResponse     HtxResponse;
typedef struct HtxEngine       HtxEngine;
typedef struct HtxRouter       HtxRouter;
typedef struct HtxRouteResult  HtxRouteResult;

/* ---- Simple JSON-like value ---- */
typedef enum {
    HTX_VAL_NULL,
    HTX_VAL_BOOL,
    HTX_VAL_INT,
    HTX_VAL_STRING,
    HTX_VAL_ARRAY,
    HTX_VAL_OBJECT
} HtxValueType;

typedef struct HtxKV {
    char       *key;
    HtxValue   *val;
} HtxKV;

struct HtxValue {
    HtxValueType type;
    union {
        bool        bval;
        int64_t     ival;
        char       *sval;
        struct { HtxValue **items; int count; }   arr;
        struct { HtxKV    *pairs;  int count; }   obj;
    } d;
};

/* ---- Data context ---- */
struct HtxContext {
    HtxKV      *entries;
    int         count;
    int         cap;
    HtxContext *parent;
};

/* ---- Request / Response ---- */
struct HtxRequest {
    const char *method;       /* "GET" or "POST" */
    const char *path;
    const char *query_string;
    const char *cookie_header;
    const char *auth_header;  /* Authorization header */
    const char *content_type;
    const char *body_raw;
    size_t      body_len;
    bool        hx_request;   /* HX-Request header present */
    /* parsed route params */
    char       *param_keys[HTX_MAX_PARAMS];
    char       *param_vals[HTX_MAX_PARAMS];
    int         param_count;
    /* parsed body (form / json) */
    HtxContext *body_ctx;
    /* auth */
    HtxValue   *auth_user;   /* NULL = unauthenticated */
};

struct HtxResponse {
    int          status;
    char        *content_type;
    char        *body;
    size_t       body_len;
};

/* ---- Script collector ---- */
typedef struct {
    char  *scripts[HTX_MAX_SCRIPTS];
    int    count;
} HtxScriptCollector;

/* ---- Protection marker ---- */
typedef struct {
    char  marker[80];
    char *original;
} HtxMarker;

typedef struct {
    HtxMarker markers[HTX_MAX_MARKERS];
    int       count;
} HtxMarkerSet;

/* ---- Content Adapter interface ---- */
typedef struct HtxContentAdapter {
    void *userdata;
    /* query returns array value; caller owns result */
    HtxValue* (*query)(struct HtxContentAdapter *self,
                       const char *type, const char *where_clause,
                       const char *order, int limit, int offset);
    HtxValue* (*get)(struct HtxContentAdapter *self,
                     const char *type, const char *identifier);
    HtxValue* (*create)(struct HtxContentAdapter *self,
                        const char *type, HtxContext *data);
    bool      (*update)(struct HtxContentAdapter *self,
                        const char *type, const char *id, HtxContext *data);
    bool      (*del)(struct HtxContentAdapter *self,
                     const char *type, const char *id);
} HtxContentAdapter;

/* ---- Middleware interface ---- */
typedef struct HtxMiddleware {
    const char *name;
    void       *userdata;
    HtxResponse* (*handle)(struct HtxMiddleware *self,
                           HtxRequest *req,
                           HtxResponse* (*next)(void *nctx, HtxRequest *req),
                           void *nctx);
} HtxMiddleware;

/* ---- Context Provider interface ---- */
typedef struct HtxContextProvider {
    const char *name;
    void       *userdata;
    void (*resolve)(struct HtxContextProvider *self, HtxRequest *req, HtxContext *ctx);
} HtxContextProvider;

/* ---- Channel Handler interface ---- */
typedef struct HtxChannelHandler {
    const char *module_name;
    void       *userdata;
    HtxResponse* (*handle)(struct HtxChannelHandler *self,
                           const char *sub_path, const char *query,
                           const char *user_id, const char *method,
                           HtxContext *body);
} HtxChannelHandler;

/* ---- Module manifest ---- */
typedef struct {
    const char *trust;   /* "first-party" or "restricted" */
    const char **context_providers;
    int          cp_count;
    const char **channel_handlers;
    int          ch_count;
    const char **middleware;
    int          mw_count;
} HtxManifest;

/* ---- Module interface ---- */
typedef struct HtxModule {
    const char *name;
    void       *userdata;
    HtxManifest (*manifest)(struct HtxModule *self);
    void (*boot)(struct HtxModule *self, HtxEngine *engine);
} HtxModule;

/* ---- Module Registry ---- */
typedef struct {
    HtxMiddleware       *middleware[HTX_MAX_MIDDLEWARE];
    int                  mw_count;
    HtxContextProvider  *ctx_providers[HTX_MAX_CONTEXT_PROVS];
    int                  cp_count;
    HtxChannelHandler   *ch_handlers[HTX_MAX_CHANNEL_HDLRS];
    int                  ch_count;
} HtxModuleRegistry;

/* ---- Router result ---- */
struct HtxRouteResult {
    char  file_path[HTX_MAX_PATH];
    char *param_keys[HTX_MAX_PARAMS];
    char *param_vals[HTX_MAX_PARAMS];
    int   param_count;
    bool  found;
};

/* ---- Engine ---- */
struct HtxEngine {
    char                template_dir[HTX_MAX_PATH];
    char                public_dir[HTX_MAX_PATH];
    char                secret[HTX_SECRET_LEN];
    HtxContentAdapter  *adapter;
    HtxModuleRegistry   registry;
    HtxModule          *modules[HTX_MAX_MODULES];
    int                 module_count;
};

/* ---- Value helpers ---- */
HtxValue *htx_val_null(void);
HtxValue *htx_val_bool(bool b);
HtxValue *htx_val_int(int64_t i);
HtxValue *htx_val_string(const char *s);
HtxValue *htx_val_string_owned(char *s);
HtxValue *htx_val_array(void);
HtxValue *htx_val_object(void);
void      htx_val_array_push(HtxValue *arr, HtxValue *item);
void      htx_val_object_set(HtxValue *obj, const char *key, HtxValue *val);
HtxValue *htx_val_object_get(HtxValue *obj, const char *key);
HtxValue *htx_val_clone(HtxValue *v);
void      htx_val_free(HtxValue *v);
bool      htx_val_truthy(HtxValue *v);
char     *htx_val_to_string(HtxValue *v); /* caller frees */

/* ---- Context helpers ---- */
HtxContext *htx_ctx_new(void);
HtxContext *htx_ctx_child(HtxContext *parent);
void        htx_ctx_set(HtxContext *ctx, const char *key, HtxValue *val);
HtxValue   *htx_ctx_get(HtxContext *ctx, const char *key);
void        htx_ctx_free(HtxContext *ctx);

/* ---- Path resolution in context ---- */
HtxValue *htx_resolve_path(HtxContext *ctx, const char *dotpath);

/* ---- String helpers ---- */
char *htx_html_escape(const char *s);
char *htx_strdup(const char *s);
char *htx_strndup(const char *s, size_t n);
char *htx_str_replace(const char *haystack, const char *needle, const char *replacement);
char *htx_str_replace_all(const char *haystack, const char *needle, const char *replacement);
void  htx_str_append(char **buf, size_t *len, size_t *cap, const char *add);
void  htx_str_appendn(char **buf, size_t *len, size_t *cap, const char *add, size_t n);

/* ---- UUID ---- */
void htx_uuid(char *out);  /* writes 36-char UUID + NUL */

/* ---- Crypto ---- */
char *htx_hmac_sha256(const char *key, size_t key_len, const char *data, size_t data_len);
char *htx_base64url_encode(const unsigned char *data, size_t len);
unsigned char *htx_base64url_decode(const char *input, size_t *out_len);
bool  htx_constant_time_compare(const char *a, const char *b);
char *htx_sign_token(const char *payload_json, const char *secret);
bool  htx_verify_token(const char *token, const char *secret, char **payload_out);

/* ---- File I/O ---- */
char *htx_read_file(const char *path);  /* caller frees; NULL on error */
bool  htx_file_exists(const char *path);
int   htx_validate_path(const char *template_root, const char *requested, char *resolved, size_t resolved_sz);

/* ---- Router ---- */
int htx_route(HtxEngine *engine, const char *url_path, HtxRouteResult *result);

/* ---- Pipeline stages ---- */
char *htx_resolve_includes(HtxEngine *engine, const char *tmpl,
                           const char *current_dir,
                           const char **visited, int visited_count,
                           int depth);
char *htx_resolve_components(HtxEngine *engine, const char *tmpl,
                             const char *current_dir,
                             HtxScriptCollector *sc,
                             const char **visited, int visited_count,
                             int depth, HtxContext *ctx);
char *htx_extract_scripts(const char *tmpl, HtxScriptCollector *sc);
void  htx_resolve_let(const char *tmpl, HtxContext *ctx, char **out);
void  htx_resolve_data(HtxEngine *engine, const char *tmpl, HtxContext *ctx, char **out);
void  htx_resolve_grants(HtxEngine *engine, const char *tmpl, HtxContext *ctx, char **out);
void  htx_resolve_actions(HtxEngine *engine, const char *tmpl, HtxContext *ctx, char **out);
char *htx_resolve_auth(const char *tmpl, HtxContext *ctx);
char *htx_resolve_control_flow(const char *tmpl, HtxContext *ctx);
char *htx_eval_expressions(const char *tmpl, HtxContext *ctx);
char *htx_extract_layout_directive(const char *tmpl, char **layout_src, bool *layout_none);
char *htx_strip_directives(const char *tmpl);
char *htx_wrap_layout(HtxEngine *engine, const char *content,
                      const char *page_path, const char *layout_src,
                      bool layout_none, bool hx_request, HtxContext *ctx);
char *htx_post_layout_pass(HtxEngine *engine, const char *tmpl, HtxContext *ctx);
char *htx_inject_scripts(const char *tmpl, HtxScriptCollector *sc);
char *htx_final_expression_pass(const char *tmpl, HtxContext *ctx);
char *htx_finalize_scripts(const char *tmpl);

/* ---- Full pipeline ---- */
HtxResponse *htx_pipeline(HtxEngine *engine, HtxRequest *req);

/* ---- Engine init ---- */
void htx_engine_init(HtxEngine *engine, const char *template_dir,
                     const char *public_dir, const char *secret,
                     HtxContentAdapter *adapter);
void htx_engine_register_module(HtxEngine *engine, HtxModule *mod);
void htx_engine_boot(HtxEngine *engine);

/* ---- Mutation execution ---- */
HtxResponse *htx_execute_mutation(HtxEngine *engine, HtxRequest *req);

/* ---- Channel API ---- */
HtxResponse *htx_handle_channel(HtxEngine *engine, HtxRequest *req);

/* ---- SQLite adapter ---- */
HtxContentAdapter *htx_sqlite_adapter_new(sqlite3 *db);
void               htx_sqlite_adapter_free(HtxContentAdapter *adapter);

/* ---- Response helpers ---- */
HtxResponse *htx_response_new(int status, const char *ct, const char *body);
void         htx_response_free(HtxResponse *resp);

/* ---- Pipe functions ---- */
char *htx_pipe_apply(const char *value, const char *pipe_name);

/* ---- Parse helpers ---- */
void htx_parse_attrs(const char *attr_str, char **keys, char **vals, int *count, int max);
HtxContext *htx_parse_body(const char *body, size_t len, const char *content_type);
char *htx_parse_cookie(const char *cookie_header, const char *name);

#endif /* ENGINE_H */
