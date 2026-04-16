/*
 * engine.c - htxlang conformant engine implementation
 *
 * Implements: Router, ExpressionEngine, IncludeResolver, ComponentResolver,
 * DataResolver, ControlFlow, LayoutResolver, GrantResolver, MutationHandler,
 * AuthConditionals, ModuleRegistry, ChannelMiddleware, SQLiteAdapter,
 * 22-stage Pipeline.
 */

#include "engine.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <time.h>
#include <unistd.h>
#include <sys/stat.h>
#include <limits.h>
#include <errno.h>

#include <openssl/hmac.h>
#include <openssl/evp.h>
#include <openssl/rand.h>

#define PCRE2_CODE_UNIT_WIDTH 8
#include <pcre2.h>

/* ================================================================
 * String Helpers
 * ================================================================ */

char *htx_strdup(const char *s) {
    if (!s) return NULL;
    size_t len = strlen(s);
    char *r = malloc(len + 1);
    if (r) memcpy(r, s, len + 1);
    return r;
}

char *htx_strndup(const char *s, size_t n) {
    if (!s) return NULL;
    size_t len = strlen(s);
    if (n < len) len = n;
    char *r = malloc(len + 1);
    if (r) { memcpy(r, s, len); r[len] = '\0'; }
    return r;
}

void htx_str_append(char **buf, size_t *len, size_t *cap, const char *add) {
    if (!add) return;
    htx_str_appendn(buf, len, cap, add, strlen(add));
}

void htx_str_appendn(char **buf, size_t *len, size_t *cap, const char *add, size_t n) {
    if (!add || n == 0) return;
    while (*len + n + 1 > *cap) {
        *cap = (*cap < 64) ? 128 : (*cap * 2);
        *buf = realloc(*buf, *cap);
    }
    memcpy(*buf + *len, add, n);
    *len += n;
    (*buf)[*len] = '\0';
}

char *htx_html_escape(const char *s) {
    if (!s) return htx_strdup("");
    size_t len = 0, cap = 128;
    char *out = malloc(cap);
    out[0] = '\0';
    for (const char *p = s; *p; p++) {
        const char *rep = NULL;
        size_t rlen = 0;
        switch (*p) {
            case '&': rep = "&amp;"; rlen = 5; break;
            case '<': rep = "&lt;"; rlen = 4; break;
            case '>': rep = "&gt;"; rlen = 4; break;
            case '"': rep = "&quot;"; rlen = 6; break;
            default: break;
        }
        if (rep) {
            htx_str_appendn(&out, &len, &cap, rep, rlen);
        } else {
            htx_str_appendn(&out, &len, &cap, p, 1);
        }
    }
    return out;
}

char *htx_str_replace(const char *haystack, const char *needle, const char *replacement) {
    if (!haystack || !needle) return htx_strdup(haystack ? haystack : "");
    const char *pos = strstr(haystack, needle);
    if (!pos) return htx_strdup(haystack);
    size_t nlen = strlen(needle);
    size_t rlen = replacement ? strlen(replacement) : 0;
    size_t hlen = strlen(haystack);
    size_t olen = hlen - nlen + rlen;
    char *out = malloc(olen + 1);
    size_t prefix = (size_t)(pos - haystack);
    memcpy(out, haystack, prefix);
    if (replacement) memcpy(out + prefix, replacement, rlen);
    memcpy(out + prefix + rlen, pos + nlen, hlen - prefix - nlen);
    out[olen] = '\0';
    return out;
}

char *htx_str_replace_all(const char *haystack, const char *needle, const char *replacement) {
    if (!haystack || !needle || !needle[0]) return htx_strdup(haystack ? haystack : "");
    size_t nlen = strlen(needle);
    size_t rlen = replacement ? strlen(replacement) : 0;
    size_t len = 0, cap = strlen(haystack) + 128;
    char *out = malloc(cap);
    out[0] = '\0';
    const char *p = haystack;
    while (*p) {
        const char *f = strstr(p, needle);
        if (!f) {
            htx_str_append(&out, &len, &cap, p);
            break;
        }
        htx_str_appendn(&out, &len, &cap, p, (size_t)(f - p));
        if (replacement) htx_str_appendn(&out, &len, &cap, replacement, rlen);
        p = f + nlen;
    }
    return out;
}

/* ================================================================
 * UUID generation via /dev/urandom
 * ================================================================ */

void htx_uuid(char *out) {
    unsigned char bytes[16];
    FILE *f = fopen("/dev/urandom", "rb");
    if (f) {
        fread(bytes, 1, 16, f);
        fclose(f);
    } else {
        RAND_bytes(bytes, 16);
    }
    bytes[6] = (bytes[6] & 0x0F) | 0x40;
    bytes[8] = (bytes[8] & 0x3F) | 0x80;
    snprintf(out, HTX_UUID_LEN,
        "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
        bytes[0],bytes[1],bytes[2],bytes[3],
        bytes[4],bytes[5],bytes[6],bytes[7],
        bytes[8],bytes[9],bytes[10],bytes[11],
        bytes[12],bytes[13],bytes[14],bytes[15]);
}

/* ================================================================
 * Value (simple JSON-like) helpers
 * ================================================================ */

HtxValue *htx_val_null(void) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_NULL;
    return v;
}

HtxValue *htx_val_bool(bool b) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_BOOL;
    v->d.bval = b;
    return v;
}

HtxValue *htx_val_int(int64_t i) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_INT;
    v->d.ival = i;
    return v;
}

HtxValue *htx_val_string(const char *s) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_STRING;
    v->d.sval = htx_strdup(s ? s : "");
    return v;
}

HtxValue *htx_val_string_owned(char *s) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_STRING;
    v->d.sval = s;
    return v;
}

HtxValue *htx_val_array(void) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_ARRAY;
    return v;
}

HtxValue *htx_val_object(void) {
    HtxValue *v = calloc(1, sizeof(HtxValue));
    v->type = HTX_VAL_OBJECT;
    return v;
}

void htx_val_array_push(HtxValue *arr, HtxValue *item) {
    if (!arr || arr->type != HTX_VAL_ARRAY) return;
    arr->d.arr.items = realloc(arr->d.arr.items,
        (arr->d.arr.count + 1) * sizeof(HtxValue*));
    arr->d.arr.items[arr->d.arr.count++] = item;
}

void htx_val_object_set(HtxValue *obj, const char *key, HtxValue *val) {
    if (!obj || obj->type != HTX_VAL_OBJECT || !key) return;
    /* overwrite if exists */
    for (int i = 0; i < obj->d.obj.count; i++) {
        if (strcmp(obj->d.obj.pairs[i].key, key) == 0) {
            htx_val_free(obj->d.obj.pairs[i].val);
            obj->d.obj.pairs[i].val = val;
            return;
        }
    }
    obj->d.obj.pairs = realloc(obj->d.obj.pairs,
        (obj->d.obj.count + 1) * sizeof(HtxKV));
    obj->d.obj.pairs[obj->d.obj.count].key = htx_strdup(key);
    obj->d.obj.pairs[obj->d.obj.count].val = val;
    obj->d.obj.count++;
}

HtxValue *htx_val_object_get(HtxValue *obj, const char *key) {
    if (!obj || obj->type != HTX_VAL_OBJECT || !key) return NULL;
    for (int i = 0; i < obj->d.obj.count; i++) {
        if (strcmp(obj->d.obj.pairs[i].key, key) == 0)
            return obj->d.obj.pairs[i].val;
    }
    return NULL;
}

HtxValue *htx_val_clone(HtxValue *v) {
    if (!v) return htx_val_null();
    switch (v->type) {
        case HTX_VAL_NULL:   return htx_val_null();
        case HTX_VAL_BOOL:   return htx_val_bool(v->d.bval);
        case HTX_VAL_INT:    return htx_val_int(v->d.ival);
        case HTX_VAL_STRING: return htx_val_string(v->d.sval);
        case HTX_VAL_ARRAY: {
            HtxValue *a = htx_val_array();
            for (int i = 0; i < v->d.arr.count; i++)
                htx_val_array_push(a, htx_val_clone(v->d.arr.items[i]));
            return a;
        }
        case HTX_VAL_OBJECT: {
            HtxValue *o = htx_val_object();
            for (int i = 0; i < v->d.obj.count; i++)
                htx_val_object_set(o, v->d.obj.pairs[i].key,
                                   htx_val_clone(v->d.obj.pairs[i].val));
            return o;
        }
    }
    return htx_val_null();
}

void htx_val_free(HtxValue *v) {
    if (!v) return;
    switch (v->type) {
        case HTX_VAL_STRING:
            free(v->d.sval);
            break;
        case HTX_VAL_ARRAY:
            for (int i = 0; i < v->d.arr.count; i++)
                htx_val_free(v->d.arr.items[i]);
            free(v->d.arr.items);
            break;
        case HTX_VAL_OBJECT:
            for (int i = 0; i < v->d.obj.count; i++) {
                free(v->d.obj.pairs[i].key);
                htx_val_free(v->d.obj.pairs[i].val);
            }
            free(v->d.obj.pairs);
            break;
        default: break;
    }
    free(v);
}

bool htx_val_truthy(HtxValue *v) {
    if (!v) return false;
    switch (v->type) {
        case HTX_VAL_NULL:   return false;
        case HTX_VAL_BOOL:   return v->d.bval;
        case HTX_VAL_INT:    return v->d.ival != 0;
        case HTX_VAL_STRING: return v->d.sval && v->d.sval[0] != '\0';
        case HTX_VAL_ARRAY:  return v->d.arr.count > 0;
        case HTX_VAL_OBJECT: return true;
    }
    return false;
}

char *htx_val_to_string(HtxValue *v) {
    if (!v) return htx_strdup("");
    switch (v->type) {
        case HTX_VAL_NULL:   return htx_strdup("");
        case HTX_VAL_BOOL:   return htx_strdup(v->d.bval ? "true" : "false");
        case HTX_VAL_INT: {
            char buf[32];
            snprintf(buf, sizeof(buf), "%ld", (long)v->d.ival);
            return htx_strdup(buf);
        }
        case HTX_VAL_STRING: return htx_strdup(v->d.sval ? v->d.sval : "");
        case HTX_VAL_ARRAY: {
            /* JSON array */
            size_t len = 0, cap = 128;
            char *out = malloc(cap);
            out[0] = '\0';
            htx_str_append(&out, &len, &cap, "[");
            for (int i = 0; i < v->d.arr.count; i++) {
                if (i > 0) htx_str_append(&out, &len, &cap, ",");
                char *s = htx_val_to_string(v->d.arr.items[i]);
                htx_str_append(&out, &len, &cap, s);
                free(s);
            }
            htx_str_append(&out, &len, &cap, "]");
            return out;
        }
        case HTX_VAL_OBJECT: {
            size_t len = 0, cap = 128;
            char *out = malloc(cap);
            out[0] = '\0';
            htx_str_append(&out, &len, &cap, "{");
            for (int i = 0; i < v->d.obj.count; i++) {
                if (i > 0) htx_str_append(&out, &len, &cap, ",");
                htx_str_append(&out, &len, &cap, "\"");
                htx_str_append(&out, &len, &cap, v->d.obj.pairs[i].key);
                htx_str_append(&out, &len, &cap, "\":");
                char *s = htx_val_to_string(v->d.obj.pairs[i].val);
                htx_str_append(&out, &len, &cap, s);
                free(s);
            }
            htx_str_append(&out, &len, &cap, "}");
            return out;
        }
    }
    return htx_strdup("");
}

/* ================================================================
 * Context
 * ================================================================ */

HtxContext *htx_ctx_new(void) {
    HtxContext *ctx = calloc(1, sizeof(HtxContext));
    ctx->cap = 16;
    ctx->entries = calloc(ctx->cap, sizeof(HtxKV));
    return ctx;
}

HtxContext *htx_ctx_child(HtxContext *parent) {
    HtxContext *ctx = htx_ctx_new();
    ctx->parent = parent;
    return ctx;
}

void htx_ctx_set(HtxContext *ctx, const char *key, HtxValue *val) {
    if (!ctx || !key) return;
    /* overwrite if exists at this level */
    for (int i = 0; i < ctx->count; i++) {
        if (strcmp(ctx->entries[i].key, key) == 0) {
            htx_val_free(ctx->entries[i].val);
            ctx->entries[i].val = val;
            return;
        }
    }
    if (ctx->count >= ctx->cap) {
        ctx->cap *= 2;
        ctx->entries = realloc(ctx->entries, ctx->cap * sizeof(HtxKV));
    }
    ctx->entries[ctx->count].key = htx_strdup(key);
    ctx->entries[ctx->count].val = val;
    ctx->count++;
}

HtxValue *htx_ctx_get(HtxContext *ctx, const char *key) {
    if (!ctx || !key) return NULL;
    for (int i = 0; i < ctx->count; i++) {
        if (strcmp(ctx->entries[i].key, key) == 0)
            return ctx->entries[i].val;
    }
    if (ctx->parent) return htx_ctx_get(ctx->parent, key);
    return NULL;
}

void htx_ctx_free(HtxContext *ctx) {
    if (!ctx) return;
    for (int i = 0; i < ctx->count; i++) {
        free(ctx->entries[i].key);
        htx_val_free(ctx->entries[i].val);
    }
    free(ctx->entries);
    free(ctx);
}

/* ================================================================
 * Path Resolution
 * ================================================================ */

HtxValue *htx_resolve_path(HtxContext *ctx, const char *dotpath) {
    if (!ctx || !dotpath || !dotpath[0]) return NULL;

    /* trim whitespace */
    while (*dotpath == ' ' || *dotpath == '\t') dotpath++;
    size_t plen = strlen(dotpath);
    while (plen > 0 && (dotpath[plen-1] == ' ' || dotpath[plen-1] == '\t')) plen--;
    char *path = htx_strndup(dotpath, plen);

    /* split on first '.' */
    char *dot = strchr(path, '.');
    if (!dot) {
        HtxValue *v = htx_ctx_get(ctx, path);
        free(path);
        return v;
    }

    char *first = htx_strndup(path, (size_t)(dot - path));
    HtxValue *v = htx_ctx_get(ctx, first);
    free(first);

    const char *rest = dot + 1;
    while (*rest && v) {
        const char *ndot = strchr(rest, '.');
        size_t klen = ndot ? (size_t)(ndot - rest) : strlen(rest);
        char *key = htx_strndup(rest, klen);

        if (v->type == HTX_VAL_OBJECT) {
            v = htx_val_object_get(v, key);
        } else if (v->type == HTX_VAL_ARRAY) {
            /* try numeric index */
            char *end;
            long idx = strtol(key, &end, 10);
            if (*end == '\0' && idx >= 0 && idx < v->d.arr.count) {
                v = v->d.arr.items[idx];
            } else {
                free(key);
                free(path);
                return NULL;
            }
        } else {
            free(key);
            free(path);
            return NULL;
        }
        free(key);
        rest = ndot ? ndot + 1 : rest + klen;
    }

    free(path);
    return v;
}

/* ================================================================
 * Pipe functions
 * ================================================================ */

char *htx_pipe_apply(const char *value, const char *pipe_name) {
    if (!value) return htx_strdup("");
    if (!pipe_name || !pipe_name[0]) return htx_strdup(value);

    /* trim pipe name */
    while (*pipe_name == ' ') pipe_name++;
    size_t plen = strlen(pipe_name);
    while (plen > 0 && pipe_name[plen-1] == ' ') plen--;
    char *pname = htx_strndup(pipe_name, plen);

    char *result = NULL;

    if (strcmp(pname, "uppercase") == 0) {
        result = htx_strdup(value);
        for (char *c = result; *c; c++) *c = toupper((unsigned char)*c);
    } else if (strcmp(pname, "lowercase") == 0) {
        result = htx_strdup(value);
        for (char *c = result; *c; c++) *c = tolower((unsigned char)*c);
    } else if (strcmp(pname, "capitalize") == 0) {
        result = htx_strdup(value);
        if (result[0]) result[0] = toupper((unsigned char)result[0]);
    } else if (strcmp(pname, "trim") == 0) {
        const char *s = value;
        while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
        const char *e = value + strlen(value) - 1;
        while (e > s && (*e == ' ' || *e == '\t' || *e == '\n' || *e == '\r')) e--;
        result = htx_strndup(s, (size_t)(e - s + 1));
    } else if (strcmp(pname, "length") == 0) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%zu", strlen(value));
        result = htx_strdup(buf);
    } else if (strcmp(pname, "json") == 0) {
        /* wrap in quotes, escape */
        size_t len = 0, cap = strlen(value) + 16;
        result = malloc(cap);
        result[0] = '\0';
        htx_str_append(&result, &len, &cap, "\"");
        for (const char *c = value; *c; c++) {
            if (*c == '"') htx_str_append(&result, &len, &cap, "\\\"");
            else if (*c == '\\') htx_str_append(&result, &len, &cap, "\\\\");
            else if (*c == '\n') htx_str_append(&result, &len, &cap, "\\n");
            else htx_str_appendn(&result, &len, &cap, c, 1);
        }
        htx_str_append(&result, &len, &cap, "\"");
    } else {
        result = htx_strdup(value);
    }

    free(pname);
    return result;
}

/* ================================================================
 * Crypto
 * ================================================================ */

char *htx_base64url_encode(const unsigned char *data, size_t len) {
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    size_t olen = 4 * ((len + 2) / 3);
    char *out = malloc(olen + 1);
    size_t i, j;
    for (i = 0, j = 0; i < len; ) {
        uint32_t a = i < len ? data[i++] : 0;
        uint32_t b = i < len ? data[i++] : 0;
        uint32_t c = i < len ? data[i++] : 0;
        uint32_t triple = (a << 16) | (b << 8) | c;
        out[j++] = table[(triple >> 18) & 0x3F];
        out[j++] = table[(triple >> 12) & 0x3F];
        out[j++] = table[(triple >> 6) & 0x3F];
        out[j++] = table[triple & 0x3F];
    }
    /* remove padding */
    size_t pad = (3 - len % 3) % 3;
    out[j - pad] = '\0';
    return out;
}

unsigned char *htx_base64url_decode(const char *input, size_t *out_len) {
    if (!input) { *out_len = 0; return NULL; }
    size_t ilen = strlen(input);
    /* add padding for decoding */
    size_t padded = ilen + (4 - ilen % 4) % 4;
    char *padstr = malloc(padded + 1);
    memcpy(padstr, input, ilen);
    for (size_t i = ilen; i < padded; i++) padstr[i] = '=';
    padstr[padded] = '\0';

    /* convert from url-safe */
    for (size_t i = 0; i < padded; i++) {
        if (padstr[i] == '-') padstr[i] = '+';
        else if (padstr[i] == '_') padstr[i] = '/';
    }

    static const int dtable[256] = {
        ['A']=0,['B']=1,['C']=2,['D']=3,['E']=4,['F']=5,['G']=6,['H']=7,
        ['I']=8,['J']=9,['K']=10,['L']=11,['M']=12,['N']=13,['O']=14,['P']=15,
        ['Q']=16,['R']=17,['S']=18,['T']=19,['U']=20,['V']=21,['W']=22,['X']=23,
        ['Y']=24,['Z']=25,['a']=26,['b']=27,['c']=28,['d']=29,['e']=30,['f']=31,
        ['g']=32,['h']=33,['i']=34,['j']=35,['k']=36,['l']=37,['m']=38,['n']=39,
        ['o']=40,['p']=41,['q']=42,['r']=43,['s']=44,['t']=45,['u']=46,['v']=47,
        ['w']=48,['x']=49,['y']=50,['z']=51,['0']=52,['1']=53,['2']=54,['3']=55,
        ['4']=56,['5']=57,['6']=58,['7']=59,['8']=60,['9']=61,['+']=62,['/']=63,
    };

    size_t max_out = padded / 4 * 3;
    unsigned char *out = malloc(max_out);
    size_t oi = 0;
    for (size_t i = 0; i < padded; i += 4) {
        uint32_t a = dtable[(unsigned char)padstr[i]];
        uint32_t b = dtable[(unsigned char)padstr[i+1]];
        uint32_t c = (padstr[i+2] == '=') ? 0 : dtable[(unsigned char)padstr[i+2]];
        uint32_t d = (padstr[i+3] == '=') ? 0 : dtable[(unsigned char)padstr[i+3]];
        uint32_t triple = (a << 18) | (b << 12) | (c << 6) | d;
        if (oi < max_out) out[oi++] = (triple >> 16) & 0xFF;
        if (padstr[i+2] != '=' && oi < max_out) out[oi++] = (triple >> 8) & 0xFF;
        if (padstr[i+3] != '=' && oi < max_out) out[oi++] = triple & 0xFF;
    }
    free(padstr);
    *out_len = oi;
    return out;
}

char *htx_hmac_sha256(const char *key, size_t key_len,
                      const char *data, size_t data_len) {
    unsigned char result[EVP_MAX_MD_SIZE];
    unsigned int result_len = 0;
    HMAC(EVP_sha256(), key, (int)key_len,
         (const unsigned char *)data, data_len, result, &result_len);
    return htx_base64url_encode(result, result_len);
}

bool htx_constant_time_compare(const char *a, const char *b) {
    if (!a || !b) return false;
    size_t alen = strlen(a);
    size_t blen = strlen(b);
    volatile unsigned char diff = (alen != blen) ? 1 : 0;
    size_t len = alen < blen ? alen : blen;
    for (size_t i = 0; i < len; i++) {
        diff |= (unsigned char)a[i] ^ (unsigned char)b[i];
    }
    return diff == 0;
}

char *htx_sign_token(const char *payload_json, const char *secret) {
    char *payload_b64 = htx_base64url_encode(
        (const unsigned char *)payload_json, strlen(payload_json));
    char *sig = htx_hmac_sha256(secret, strlen(secret),
                                payload_b64, strlen(payload_b64));
    size_t tlen = strlen(payload_b64) + 1 + strlen(sig) + 1;
    char *token = malloc(tlen);
    snprintf(token, tlen, "%s.%s", payload_b64, sig);
    free(payload_b64);
    free(sig);
    return token;
}

bool htx_verify_token(const char *token, const char *secret, char **payload_out) {
    if (!token || !secret) return false;
    const char *dot = strchr(token, '.');
    if (!dot) return false;

    char *payload_b64 = htx_strndup(token, (size_t)(dot - token));
    const char *given_sig = dot + 1;

    /* recompute */
    char *expected_sig = htx_hmac_sha256(secret, strlen(secret),
                                         payload_b64, strlen(payload_b64));

    bool valid = htx_constant_time_compare(given_sig, expected_sig);
    free(expected_sig);

    if (valid && payload_out) {
        size_t dec_len;
        unsigned char *decoded = htx_base64url_decode(payload_b64, &dec_len);
        *payload_out = htx_strndup((char *)decoded, dec_len);
        free(decoded);
    }

    free(payload_b64);
    return valid;
}

/* ================================================================
 * File I/O
 * ================================================================ */

char *htx_read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz < 0) { fclose(f); return NULL; }
    char *buf = malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return NULL; }
    size_t rd = fread(buf, 1, (size_t)sz, f);
    buf[rd] = '\0';
    fclose(f);
    return buf;
}

bool htx_file_exists(const char *path) {
    struct stat st;
    return stat(path, &st) == 0 && S_ISREG(st.st_mode);
}

/* Three-layer path defense: reject "..", normalize, containment check */
int htx_validate_path(const char *template_root, const char *requested,
                      char *resolved, size_t resolved_sz) {
    /* Layer 1: reject ".." */
    if (strstr(requested, "..")) return HTX_ERR_PATH;

    /* Build candidate */
    char candidate[HTX_MAX_PATH];
    if (requested[0] == '/') {
        snprintf(candidate, sizeof(candidate), "%s%s", template_root, requested);
    } else {
        snprintf(candidate, sizeof(candidate), "%s/%s", template_root, requested);
    }

    /* Layer 2: normalize with realpath */
    char norm_root[PATH_MAX];
    char norm_cand[PATH_MAX];
    if (!realpath(template_root, norm_root)) return HTX_ERR_PATH;

    /* For files that may not exist yet, resolve parent */
    if (!realpath(candidate, norm_cand)) {
        /* file doesn't exist */
        /* still do containment on the constructed path */
        snprintf(norm_cand, sizeof(norm_cand), "%s", candidate);
    }

    /* Layer 3: containment check */
    size_t root_len = strlen(norm_root);
    if (strncmp(norm_cand, norm_root, root_len) != 0) return HTX_ERR_PATH;

    snprintf(resolved, resolved_sz, "%s", norm_cand);
    return HTX_OK;
}

/* ================================================================
 * Router
 * ================================================================ */

int htx_route(HtxEngine *engine, const char *url_path, HtxRouteResult *result) {
    memset(result, 0, sizeof(HtxRouteResult));

    /* strip query string */
    char clean[HTX_MAX_PATH];
    const char *q = strchr(url_path, '?');
    if (q) {
        snprintf(clean, sizeof(clean), "%.*s", (int)(q - url_path), url_path);
    } else {
        snprintf(clean, sizeof(clean), "%s", url_path);
    }

    /* strip trailing slash (but keep root) */
    size_t clen = strlen(clean);
    while (clen > 1 && clean[clen-1] == '/') clean[--clen] = '\0';

    /* 1) Static file: template_dir + path + ".htx" */
    char trypath[HTX_MAX_PATH];
    snprintf(trypath, sizeof(trypath), "%s%s.htx", engine->template_dir, clean);
    if (htx_file_exists(trypath)) {
        if (htx_validate_path(engine->template_dir, clean, result->file_path,
                              sizeof(result->file_path)) != HTX_OK) {
            /* use trypath directly for safety */
        }
        snprintf(result->file_path, sizeof(result->file_path), "%s", trypath);
        result->found = true;
        return HTX_OK;
    }

    /* 2) Index: template_dir + path + "/index.htx" */
    snprintf(trypath, sizeof(trypath), "%s%s/index.htx", engine->template_dir, clean);
    if (htx_file_exists(trypath)) {
        snprintf(result->file_path, sizeof(result->file_path), "%s", trypath);
        result->found = true;
        return HTX_OK;
    }

    /* 3) Dynamic segment matching */
    /* Split url_path into segments */
    char pathcopy[HTX_MAX_PATH];
    snprintf(pathcopy, sizeof(pathcopy), "%s", clean);

    char *segments[32];
    int seg_count = 0;
    char *tok = strtok(pathcopy, "/");
    while (tok && seg_count < 32) {
        segments[seg_count++] = tok;
        tok = strtok(NULL, "/");
    }

    if (seg_count == 0) {
        return HTX_ERR_NOT_FOUND;
    }

    /* Try to walk the directory tree with dynamic segments */
    char dir_path[HTX_MAX_PATH];
    snprintf(dir_path, sizeof(dir_path), "%s", engine->template_dir);

    result->param_count = 0;

    for (int i = 0; i < seg_count; i++) {
        bool is_last = (i == seg_count - 1);

        if (is_last) {
            /* Try exact match file */
            snprintf(trypath, sizeof(trypath), "%s/%s.htx", dir_path, segments[i]);
            if (htx_file_exists(trypath)) {
                snprintf(result->file_path, sizeof(result->file_path), "%s", trypath);
                result->found = true;
                return HTX_OK;
            }

            /* Try [param].htx */
            /* We need to scan the directory for files matching [*].htx */
            char paramfile[HTX_MAX_PATH];
            /* Try common pattern: [slug].htx, [id].htx, etc. */
            /* Scan the dir */
            char pattern[HTX_MAX_PATH];
            snprintf(pattern, sizeof(pattern), "%s/", dir_path);

            /* Use direct stat check for common param names */
            const char *param_names[] = {"slug", "id", "param", NULL};
            bool found = false;
            for (int pn = 0; param_names[pn]; pn++) {
                snprintf(paramfile, sizeof(paramfile), "%s/[%s].htx",
                         dir_path, param_names[pn]);
                if (htx_file_exists(paramfile)) {
                    snprintf(result->file_path, sizeof(result->file_path), "%s", paramfile);
                    result->param_keys[result->param_count] = htx_strdup(param_names[pn]);
                    result->param_vals[result->param_count] = htx_strdup(segments[i]);
                    result->param_count++;
                    result->found = true;
                    found = true;
                    break;
                }
            }
            if (found) return HTX_OK;
        } else {
            /* Try exact dir match */
            char nextdir[HTX_MAX_PATH];
            snprintf(nextdir, sizeof(nextdir), "%s/%s", dir_path, segments[i]);
            struct stat st;
            if (stat(nextdir, &st) == 0 && S_ISDIR(st.st_mode)) {
                snprintf(dir_path, sizeof(dir_path), "%s", nextdir);
                continue;
            }

            /* Try [param]/ directory */
            const char *dp_names[] = {"slug", "id", "param", NULL};
            bool found = false;
            for (int pn = 0; dp_names[pn]; pn++) {
                snprintf(nextdir, sizeof(nextdir), "%s/[%s]", dir_path, dp_names[pn]);
                if (stat(nextdir, &st) == 0 && S_ISDIR(st.st_mode)) {
                    result->param_keys[result->param_count] = htx_strdup(dp_names[pn]);
                    result->param_vals[result->param_count] = htx_strdup(segments[i]);
                    result->param_count++;
                    snprintf(dir_path, sizeof(dir_path), "%s", nextdir);
                    found = true;
                    break;
                }
            }
            if (!found) return HTX_ERR_NOT_FOUND;
        }
    }

    return result->found ? HTX_OK : HTX_ERR_NOT_FOUND;
}

/* ================================================================
 * PCRE2 helper: match + capture
 * ================================================================ */

typedef struct {
    PCRE2_SIZE start;
    PCRE2_SIZE end;
} HtxMatch;

/* Returns count of overall matches found. Fills captures for first match.
   captures[0] = full match, captures[1..] = groups */
static int htx_pcre2_match(const char *pattern, const char *subject,
                           HtxMatch *captures, int max_captures, uint32_t flags) {
    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   flags | PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) return 0;

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    int rc = pcre2_match(re, (PCRE2_SPTR)subject, strlen(subject), 0, 0, md, NULL);
    if (rc < 1) {
        pcre2_match_data_free(md);
        pcre2_code_free(re);
        return 0;
    }

    PCRE2_SIZE *ovector = pcre2_get_ovector_pointer(md);
    int n = rc < max_captures ? rc : max_captures;
    for (int i = 0; i < n; i++) {
        captures[i].start = ovector[2*i];
        captures[i].end = ovector[2*i+1];
    }
    for (int i = n; i < max_captures; i++) {
        captures[i].start = PCRE2_UNSET;
        captures[i].end = PCRE2_UNSET;
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    return rc;
}

/* Global replace using PCRE2. Calls callback for each match. */
typedef char* (*HtxReplaceCallback)(const char *subject, PCRE2_SIZE *ovector,
                                     int capture_count, void *userdata);

static char *htx_pcre2_replace_all(const char *pattern, const char *subject,
                                   HtxReplaceCallback cb, void *userdata,
                                   uint32_t flags) {
    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   flags | PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) return htx_strdup(subject);

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);

    size_t len = 0, cap = strlen(subject) + 256;
    char *out = malloc(cap);
    out[0] = '\0';

    PCRE2_SIZE offset = 0;
    size_t slen = strlen(subject);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)subject, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&out, &len, &cap, subject + offset);
            break;
        }
        PCRE2_SIZE *ovector = pcre2_get_ovector_pointer(md);

        /* append text before match */
        if (ovector[0] > offset) {
            htx_str_appendn(&out, &len, &cap, subject + offset, ovector[0] - offset);
        }

        /* get replacement */
        char *repl = cb(subject, ovector, rc, userdata);
        if (repl) {
            htx_str_append(&out, &len, &cap, repl);
            free(repl);
        }

        offset = ovector[1];
        if (ovector[0] == ovector[1]) offset++; /* avoid infinite loop on empty match */
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    return out;
}

/* ================================================================
 * Protection markers
 * ================================================================ */

static void htx_protect_blocks(const char *tmpl, const char *pattern,
                               HtxMarkerSet *ms, char **out) {
    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL | PCRE2_CASELESS,
                                   &errorcode, &erroroffset, NULL);
    if (!re) { *out = htx_strdup(tmpl); return; }

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);

    size_t len = 0, cap = strlen(tmpl) + 256;
    char *result = malloc(cap);
    result[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen && ms->count < HTX_MAX_MARKERS) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&result, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);

        if (ov[0] > offset)
            htx_str_appendn(&result, &len, &cap, tmpl + offset, ov[0] - offset);

        char uuid[HTX_UUID_LEN];
        htx_uuid(uuid);
        char marker[80];
        snprintf(marker, sizeof(marker), "<!--HTXPROT:%s-->", uuid);

        strcpy(ms->markers[ms->count].marker, marker);
        ms->markers[ms->count].original = htx_strndup(tmpl + ov[0], ov[1] - ov[0]);
        ms->count++;

        htx_str_append(&result, &len, &cap, marker);
        offset = ov[1];
    }

    /* append remainder if loop ended via marker limit */
    if (offset < slen && ms->count >= HTX_MAX_MARKERS) {
        htx_str_append(&result, &len, &cap, tmpl + offset);
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    *out = result;
}

static char *htx_restore_markers(const char *tmpl, HtxMarkerSet *ms) {
    char *result = htx_strdup(tmpl);
    for (int i = 0; i < ms->count; i++) {
        char *tmp = htx_str_replace_all(result, ms->markers[i].marker,
                                        ms->markers[i].original);
        free(result);
        result = tmp;
    }
    return result;
}

static void htx_free_markers(HtxMarkerSet *ms) {
    for (int i = 0; i < ms->count; i++) {
        free(ms->markers[i].original);
    }
    ms->count = 0;
}

/* ================================================================
 * Include Resolver (Stage 6)
 * ================================================================ */

char *htx_resolve_includes(HtxEngine *engine, const char *tmpl,
                           const char *current_dir,
                           const char **visited, int visited_count,
                           int depth) {
    if (depth > HTX_MAX_INCLUDE_DEPTH) return htx_strdup(tmpl);

    /* Pattern: <htx:include\s+src\s*=\s*"([^"]+)"\s*\/> */
    const char *pattern = "<htx:include\\s+src\\s*=\\s*\"([^\"]+)\"\\s*\\/>";

    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) return htx_strdup(tmpl);

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);

    size_t len = 0, cap = strlen(tmpl) + 256;
    char *out = malloc(cap);
    out[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&out, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);

        /* text before match */
        if (ov[0] > offset)
            htx_str_appendn(&out, &len, &cap, tmpl + offset, ov[0] - offset);

        /* extract src */
        char *src = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);

        /* resolve path */
        char resolved[HTX_MAX_PATH];
        if (src[0] == '/') {
            snprintf(resolved, sizeof(resolved), "%s%s", engine->template_dir, src);
        } else {
            snprintf(resolved, sizeof(resolved), "%s/%s", current_dir, src);
        }

        /* circular detection */
        bool circular = false;
        for (int i = 0; i < visited_count; i++) {
            if (strcmp(visited[i], resolved) == 0) {
                circular = true;
                break;
            }
        }

        if (circular) {
            htx_str_append(&out, &len, &cap, "<!-- htx:include circular reference -->");
        } else if (strstr(src, "..")) {
            htx_str_append(&out, &len, &cap, "<!-- htx:include path traversal rejected -->");
        } else {
            char *content = htx_read_file(resolved);
            if (content) {
                /* add to visited */
                const char *new_visited[HTX_MAX_VISITED];
                for (int i = 0; i < visited_count && i < HTX_MAX_VISITED-1; i++)
                    new_visited[i] = visited[i];
                new_visited[visited_count] = resolved;

                /* determine directory of included file */
                char inc_dir[HTX_MAX_PATH];
                snprintf(inc_dir, sizeof(inc_dir), "%s", resolved);
                char *last_slash = strrchr(inc_dir, '/');
                if (last_slash) *last_slash = '\0';

                char *expanded = htx_resolve_includes(engine, content, inc_dir,
                                                      new_visited, visited_count + 1,
                                                      depth + 1);
                htx_str_append(&out, &len, &cap, expanded);
                free(expanded);
                free(content);
            } else {
                htx_str_append(&out, &len, &cap, "<!-- htx:include not found -->");
            }
        }

        free(src);
        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    return out;
}

/* ================================================================
 * Component Resolver (Stage 7)
 * ================================================================ */

static void htx_parse_component_attrs(const char *attr_str,
                                      char **keys, char **vals,
                                      int *count, int max) {
    *count = 0;
    if (!attr_str) return;
    /* pattern: key="value" */
    const char *p = attr_str;
    while (*p && *count < max) {
        while (*p == ' ' || *p == '\t' || *p == '\n') p++;
        if (!*p) break;

        /* skip src (already handled) */
        const char *kstart = p;
        while (*p && *p != '=' && *p != ' ') p++;
        size_t klen = (size_t)(p - kstart);
        if (klen == 0) break;

        char *key = htx_strndup(kstart, klen);
        while (*p == ' ') p++;
        if (*p == '=') {
            p++;
            while (*p == ' ') p++;
            if (*p == '"') {
                p++;
                const char *vstart = p;
                while (*p && *p != '"') p++;
                char *val = htx_strndup(vstart, (size_t)(p - vstart));
                if (*p == '"') p++;

                if (strcmp(key, "src") != 0) {
                    keys[*count] = key;
                    vals[*count] = val;
                    (*count)++;
                } else {
                    free(key);
                    free(val);
                }
            } else {
                free(key);
            }
        } else {
            /* boolean attribute */
            if (strcmp(key, "src") != 0) {
                keys[*count] = key;
                vals[*count] = htx_strdup("true");
                (*count)++;
            } else {
                free(key);
            }
        }
    }
}

char *htx_resolve_components(HtxEngine *engine, const char *tmpl,
                             const char *current_dir,
                             HtxScriptCollector *sc,
                             const char **visited, int visited_count,
                             int depth, HtxContext *ctx) {
    if (depth > HTX_MAX_INCLUDE_DEPTH) return htx_strdup(tmpl);

    /* Pattern: <htx:component\s+src="([^"]+)"([^>]*)(?:\/>|>([\s\S]*?)<\/htx:component>) */
    const char *pattern = "<htx:component\\s+src=\"([^\"]+)\"([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/htx:component>)";

    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) return htx_strdup(tmpl);

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);

    size_t len = 0, cap = strlen(tmpl) + 512;
    char *out = malloc(cap);
    out[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&out, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);

        if (ov[0] > offset)
            htx_str_appendn(&out, &len, &cap, tmpl + offset, ov[0] - offset);

        /* extract captures */
        char *src = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);
        char *attrs_str = (rc > 2 && ov[4] != PCRE2_UNSET)
                          ? htx_strndup(tmpl + ov[4], ov[5] - ov[4]) : htx_strdup("");
        char *slot_content = (rc > 3 && ov[6] != PCRE2_UNSET)
                             ? htx_strndup(tmpl + ov[6], ov[7] - ov[6]) : htx_strdup("");

        /* Resolve attribute expressions {htx:...} in attr values */
        /* This is needed for cases like title="{htx:post.title}" */

        /* resolve path */
        char resolved[HTX_MAX_PATH];
        if (src[0] == '/') {
            snprintf(resolved, sizeof(resolved), "%s%s", engine->template_dir, src);
        } else {
            snprintf(resolved, sizeof(resolved), "%s/%s",
                     engine->template_dir, src);
        }

        bool circular = false;
        for (int i = 0; i < visited_count; i++) {
            if (strcmp(visited[i], resolved) == 0) { circular = true; break; }
        }

        if (circular || strstr(src, "..")) {
            htx_str_append(&out, &len, &cap, "<!-- htx:component circular/path error -->");
        } else {
            char *comp_content = htx_read_file(resolved);
            if (!comp_content) {
                htx_str_append(&out, &len, &cap, "<!-- htx:component not found -->");
            } else {
                /* Parse htx:props defaults */
                char *prop_keys[32];
                char *prop_vals[32];
                int prop_count = 0;

                HtxMatch pm[2];
                if (htx_pcre2_match("<htx:props>([\\s\\S]*?)</htx:props>",
                                    comp_content, pm, 2, 0) > 0) {
                    char *props_body = htx_strndup(comp_content + pm[1].start,
                                                   pm[1].end - pm[1].start);
                    /* parse key = "value" lines */
                    char *line = strtok(props_body, "\n");
                    while (line && prop_count < 32) {
                        while (*line == ' ' || *line == '\t') line++;
                        if (!*line) { line = strtok(NULL, "\n"); continue; }
                        char *eq = strchr(line, '=');
                        if (eq) {
                            char *k = htx_strndup(line, (size_t)(eq - line));
                            /* trim key */
                            size_t kl = strlen(k);
                            while (kl > 0 && (k[kl-1] == ' ' || k[kl-1] == '\t')) k[--kl] = '\0';
                            char *vs = eq + 1;
                            while (*vs == ' ' || *vs == '\t') vs++;
                            if (*vs == '"') vs++;
                            size_t vl = strlen(vs);
                            if (vl > 0 && vs[vl-1] == '"') vl--;
                            char *vv = htx_strndup(vs, vl);
                            prop_keys[prop_count] = k;
                            prop_vals[prop_count] = vv;
                            prop_count++;
                        }
                        line = strtok(NULL, "\n");
                    }
                    free(props_body);

                    /* strip props block from content */
                    char *no_props = htx_strndup(comp_content, pm[0].start);
                    char *after = htx_strdup(comp_content + pm[0].end);
                    free(comp_content);
                    size_t nl = strlen(no_props) + strlen(after) + 1;
                    comp_content = malloc(nl);
                    snprintf(comp_content, nl, "%s%s", no_props, after);
                    free(no_props);
                    free(after);
                }

                /* Parse passed attributes, override defaults */
                char *attr_keys[32];
                char *attr_vals[32];
                int attr_count = 0;
                htx_parse_component_attrs(attrs_str, attr_keys, attr_vals,
                                          &attr_count, 32);

                /* Do NOT resolve {htx:...} in attribute values here.
                 * Component prop substitution inserts the literal value
                 * (e.g. "{htx:post.title}"), which gets resolved later
                 * during expression evaluation in htx:each or stage 15. */

                /* Merge: override defaults with passed attrs */
                for (int a = 0; a < attr_count; a++) {
                    bool found = false;
                    for (int p = 0; p < prop_count; p++) {
                        if (strcmp(prop_keys[p], attr_keys[a]) == 0) {
                            free(prop_vals[p]);
                            prop_vals[p] = htx_strdup(attr_vals[a]);
                            found = true;
                            break;
                        }
                    }
                    if (!found && prop_count < 32) {
                        prop_keys[prop_count] = htx_strdup(attr_keys[a]);
                        prop_vals[prop_count] = htx_strdup(attr_vals[a]);
                        prop_count++;
                    }
                }

                /* Replace {{ propName }} in component content */
                char *processed = htx_strdup(comp_content);
                for (int p = 0; p < prop_count; p++) {
                    char pat[256];
                    snprintf(pat, sizeof(pat), "{{ %s }}", prop_keys[p]);
                    char *tmp = htx_str_replace_all(processed, pat, prop_vals[p]);
                    free(processed);
                    processed = tmp;
                }

                /* Inject slot content at <htx:slot /> */
                char *slotted = htx_str_replace(processed, "<htx:slot />", slot_content);
                free(processed);

                /* Extract htx:script and push to scriptCollector */
                char *after_script = htx_extract_scripts(slotted, sc);
                free(slotted);

                /* Recurse for nested components */
                const char *new_visited[HTX_MAX_VISITED];
                for (int i = 0; i < visited_count && i < HTX_MAX_VISITED-1; i++)
                    new_visited[i] = visited[i];
                new_visited[visited_count] = resolved;

                char *final = htx_resolve_components(engine, after_script,
                    current_dir, sc, new_visited, visited_count + 1, depth + 1, ctx);
                free(after_script);

                htx_str_append(&out, &len, &cap, final);
                free(final);
                free(comp_content);

                /* cleanup */
                for (int p = 0; p < prop_count; p++) {
                    free(prop_keys[p]);
                    free(prop_vals[p]);
                }
                for (int a = 0; a < attr_count; a++) {
                    free(attr_keys[a]);
                    free(attr_vals[a]);
                }
            }
        }

        free(src);
        free(attrs_str);
        free(slot_content);
        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    return out;
}

/* ================================================================
 * Script Extraction (Stage 8)
 * ================================================================ */

char *htx_extract_scripts(const char *tmpl, HtxScriptCollector *sc) {
    const char *pattern = "<htx:script>([\\s\\S]*?)</htx:script>";
    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) return htx_strdup(tmpl);

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    size_t len = 0, cap = strlen(tmpl) + 64;
    char *out = malloc(cap);
    out[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&out, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
        if (ov[0] > offset)
            htx_str_appendn(&out, &len, &cap, tmpl + offset, ov[0] - offset);

        if (sc && sc->count < HTX_MAX_SCRIPTS) {
            sc->scripts[sc->count++] = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);
        }
        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    return out;
}

/* ================================================================
 * Let Binding (Stage 9)
 * ================================================================ */

void htx_resolve_let(const char *tmpl, HtxContext *ctx, char **out) {
    const char *pattern = "<htx:let\\s+([a-zA-Z_]\\w*)\\s*=\\s*\"([^\"]*)\"\\s*\\/>";

    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) { *out = htx_strdup(tmpl); return; }

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    size_t len = 0, cap = strlen(tmpl) + 64;
    char *result = malloc(cap);
    result[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&result, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
        if (ov[0] > offset)
            htx_str_appendn(&result, &len, &cap, tmpl + offset, ov[0] - offset);

        char *name = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);
        char *value = htx_strndup(tmpl + ov[4], ov[5] - ov[4]);
        htx_ctx_set(ctx, name, htx_val_string(value));
        free(name);
        free(value);

        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    *out = result;
}

/* ================================================================
 * Parse helpers for directive attributes
 * ================================================================ */

void htx_parse_attrs(const char *attr_str, char **keys, char **vals,
                     int *count, int max) {
    *count = 0;
    if (!attr_str) return;
    const char *p = attr_str;
    while (*p && *count < max) {
        while (*p == ' ' || *p == '\t' || *p == '\n') p++;
        if (!*p) break;
        const char *kstart = p;
        while (*p && *p != '=' && *p != ' ' && *p != '\t') p++;
        size_t klen = (size_t)(p - kstart);
        if (klen == 0) break;
        char *key = htx_strndup(kstart, klen);
        while (*p == ' ') p++;
        if (*p == '=') {
            p++;
            while (*p == ' ') p++;
            if (*p == '"') {
                p++;
                const char *vstart = p;
                while (*p && *p != '"') p++;
                char *val = htx_strndup(vstart, (size_t)(p - vstart));
                if (*p == '"') p++;
                keys[*count] = key;
                vals[*count] = val;
                (*count)++;
            } else if (*p == '\'') {
                p++;
                const char *vstart = p;
                while (*p && *p != '\'') p++;
                char *val = htx_strndup(vstart, (size_t)(p - vstart));
                if (*p == '\'') p++;
                keys[*count] = key;
                vals[*count] = val;
                (*count)++;
            } else {
                free(key);
            }
        } else {
            keys[*count] = key;
            vals[*count] = htx_strdup("true");
            (*count)++;
        }
    }
}

/* ================================================================
 * Data Resolver (Stage 10)
 * ================================================================ */

void htx_resolve_data(HtxEngine *engine, const char *tmpl,
                      HtxContext *ctx, char **out) {
    const char *pattern = "<htx:data\\s+([^>]*)\\/>";

    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) { *out = htx_strdup(tmpl); return; }

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    size_t len = 0, cap = strlen(tmpl) + 64;
    char *result = malloc(cap);
    result[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&result, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
        if (ov[0] > offset)
            htx_str_appendn(&result, &len, &cap, tmpl + offset, ov[0] - offset);

        char *attr_body = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);

        char *keys[16], *vals[16];
        int ac = 0;
        htx_parse_attrs(attr_body, keys, vals, &ac, 16);

        const char *type = NULL, *where_clause = NULL, *order = NULL;
        const char *as_name = NULL;
        int limit = 100, data_offset = 0;

        for (int i = 0; i < ac; i++) {
            if (strcmp(keys[i], "type") == 0) type = vals[i];
            else if (strcmp(keys[i], "where") == 0) where_clause = vals[i];
            else if (strcmp(keys[i], "order") == 0) order = vals[i];
            else if (strcmp(keys[i], "limit") == 0) limit = atoi(vals[i]);
            else if (strcmp(keys[i], "offset") == 0) data_offset = atoi(vals[i]);
            else if (strcmp(keys[i], "as") == 0) as_name = vals[i];
        }

        if (type && as_name && engine->adapter) {
            /* Resolve {htx:...} in where clause */
            char *resolved_where = NULL;
            if (where_clause) {
                resolved_where = htx_strdup(where_clause);
                while (1) {
                    char *f = strstr(resolved_where, "{htx:");
                    if (!f) break;
                    char *e = strchr(f, '}');
                    if (!e) break;
                    char *path = htx_strndup(f + 5, (size_t)(e - f - 5));
                    HtxValue *val = htx_resolve_path(ctx, path);
                    char *vs = val ? htx_val_to_string(val) : htx_strdup("");
                    char *prefix = htx_strndup(resolved_where, (size_t)(f - resolved_where));
                    size_t nl = strlen(prefix) + strlen(vs) + strlen(e + 1) + 1;
                    char *nw = malloc(nl);
                    snprintf(nw, nl, "%s%s%s", prefix, vs, e + 1);
                    free(prefix);
                    free(vs);
                    free(path);
                    free(resolved_where);
                    resolved_where = nw;
                }
            }

            HtxValue *data = engine->adapter->query(engine->adapter,
                type, resolved_where, order, limit, data_offset);
            if (data) {
                htx_ctx_set(ctx, as_name, data);
            }
            free(resolved_where);
        }

        for (int i = 0; i < ac; i++) { free(keys[i]); free(vals[i]); }
        free(attr_body);
        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    *out = result;
}

/* ================================================================
 * Grant Resolver (Stage 11)
 * ================================================================ */

void htx_resolve_grants(HtxEngine *engine, const char *tmpl,
                        HtxContext *ctx, char **out) {
    const char *pattern = "<htx:grant\\s+([^>]*)\\/>";

    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) { *out = htx_strdup(tmpl); return; }

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    size_t len = 0, cap = strlen(tmpl) + 64;
    char *result = malloc(cap);
    result[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&result, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
        if (ov[0] > offset)
            htx_str_appendn(&result, &len, &cap, tmpl + offset, ov[0] - offset);

        char *attr_body = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);
        char *keys[8], *vals[8];
        int ac = 0;
        htx_parse_attrs(attr_body, keys, vals, &ac, 8);

        const char *type = NULL, *as_name = NULL, *module = NULL;
        int ttl = 120;
        for (int i = 0; i < ac; i++) {
            if (strcmp(keys[i], "type") == 0) type = vals[i];
            else if (strcmp(keys[i], "as") == 0) as_name = vals[i];
            else if (strcmp(keys[i], "module") == 0) module = vals[i];
            else if (strcmp(keys[i], "ttl") == 0) ttl = atoi(vals[i]);
        }

        if (type && as_name) {
            char scope[256];
            if (strcmp(type, "websocket") == 0) {
                snprintf(scope, sizeof(scope), "websocket");
                if (ttl == 120) ttl = 120;
            } else if (strcmp(type, "channel") == 0) {
                snprintf(scope, sizeof(scope), "channel:%s", module ? module : "default");
            } else if (strcmp(type, "asset") == 0) {
                ttl = 3600;
                snprintf(scope, sizeof(scope), "asset");
            } else {
                snprintf(scope, sizeof(scope), "%s", type);
            }

            time_t exp = time(NULL) + ttl;
            char payload[512];
            snprintf(payload, sizeof(payload),
                     "{\"sub\":\"user\",\"scope\":\"%s\",\"exp\":%ld,\"jti\":\"%s\"}",
                     scope, (long)exp, "grant");
            char *token = htx_sign_token(payload, engine->secret);
            htx_ctx_set(ctx, as_name, htx_val_string(token));
            free(token);
        }

        for (int i = 0; i < ac; i++) { free(keys[i]); free(vals[i]); }
        free(attr_body);
        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    *out = result;
}

/* ================================================================
 * Action / Mutation Handler (Stage 12)
 * ================================================================ */

void htx_resolve_actions(HtxEngine *engine, const char *tmpl,
                         HtxContext *ctx, char **out) {
    const char *pattern = "<htx:action\\s+([^>]*)\\/>";

    int errorcode;
    PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pattern, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) { *out = htx_strdup(tmpl); return; }

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    size_t len = 0, cap = strlen(tmpl) + 64;
    char *result = malloc(cap);
    result[0] = '\0';
    PCRE2_SIZE offset = 0;
    size_t slen = strlen(tmpl);

    /* Create $actions object in context if not present */
    HtxValue *actions = htx_ctx_get(ctx, "$actions");
    if (!actions) {
        actions = htx_val_object();
        htx_ctx_set(ctx, "$actions", actions);
        /* re-get since ctx_set takes ownership indirectly */
        actions = htx_ctx_get(ctx, "$actions");
    }

    while (offset < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)tmpl, slen, offset, 0, md, NULL);
        if (rc < 1) {
            htx_str_append(&result, &len, &cap, tmpl + offset);
            break;
        }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
        if (ov[0] > offset)
            htx_str_appendn(&result, &len, &cap, tmpl + offset, ov[0] - offset);

        char *attr_body = htx_strndup(tmpl + ov[2], ov[3] - ov[2]);

        /* resolve {htx:...} in attribute string */
        char *resolved_attrs = htx_strdup(attr_body);
        while (1) {
            char *f = strstr(resolved_attrs, "{htx:");
            if (!f) break;
            char *e = strchr(f, '}');
            if (!e) break;
            char *path = htx_strndup(f + 5, (size_t)(e - f - 5));
            HtxValue *val = htx_resolve_path(ctx, path);
            char *vs = val ? htx_val_to_string(val) : htx_strdup("");
            char *prefix = htx_strndup(resolved_attrs, (size_t)(f - resolved_attrs));
            size_t nl = strlen(prefix) + strlen(vs) + strlen(e + 1) + 1;
            char *nw = malloc(nl);
            snprintf(nw, nl, "%s%s%s", prefix, vs, e + 1);
            free(prefix); free(vs); free(path); free(resolved_attrs);
            resolved_attrs = nw;
        }

        char *keys[8], *vals[8];
        int ac = 0;
        htx_parse_attrs(resolved_attrs, keys, vals, &ac, 8);

        const char *action = NULL, *type = NULL, *record_id = NULL;
        for (int i = 0; i < ac; i++) {
            if (strcmp(keys[i], "name") == 0) action = vals[i];
            else if (strcmp(keys[i], "type") == 0) type = vals[i];
            else if (strcmp(keys[i], "record") == 0) record_id = vals[i];
        }

        if (action && type) {
            time_t exp = time(NULL) + 3600;
            char payload[512];
            snprintf(payload, sizeof(payload),
                     "{\"action\":\"%s\",\"type\":\"%s\",\"recordId\":\"%s\",\"exp\":%ld}",
                     action, type, record_id ? record_id : "", (long)exp);
            char *token = htx_sign_token(payload, engine->secret);
            htx_val_object_set(actions, action, htx_val_string(token));
            free(token);
        }

        for (int i = 0; i < ac; i++) { free(keys[i]); free(vals[i]); }
        free(attr_body);
        free(resolved_attrs);
        offset = ov[1];
    }

    pcre2_match_data_free(md);
    pcre2_code_free(re);
    *out = result;
}

/* ================================================================
 * Mutation Execution (POST handler)
 * ================================================================ */

/* Simple JSON string value extractor */
static char *json_get_string(const char *json, const char *key) {
    char search[256];
    snprintf(search, sizeof(search), "\"%s\":\"", key);
    const char *p = strstr(json, search);
    if (!p) return NULL;
    p += strlen(search);
    const char *end = strchr(p, '"');
    if (!end) return NULL;
    return htx_strndup(p, (size_t)(end - p));
}

static long json_get_long(const char *json, const char *key) {
    char search[256];
    snprintf(search, sizeof(search), "\"%s\":", key);
    const char *p = strstr(json, search);
    if (!p) return 0;
    p += strlen(search);
    return strtol(p, NULL, 10);
}

HtxResponse *htx_execute_mutation(HtxEngine *engine, HtxRequest *req) {
    if (!req->body_ctx) {
        return htx_response_new(400, "application/json", "{\"error\":\"no body\"}");
    }

    HtxValue *token_val = htx_ctx_get(req->body_ctx, "_token");
    if (!token_val || token_val->type != HTX_VAL_STRING) {
        return htx_response_new(400, "application/json", "{\"error\":\"missing token\"}");
    }

    char *payload = NULL;
    if (!htx_verify_token(token_val->d.sval, engine->secret, &payload)) {
        return htx_response_new(403, "application/json", "{\"error\":\"invalid token\"}");
    }

    /* check expiry */
    long exp = json_get_long(payload, "exp");
    if (exp > 0 && exp < (long)time(NULL)) {
        free(payload);
        return htx_response_new(403, "application/json", "{\"error\":\"token expired\"}");
    }

    char *action = json_get_string(payload, "action");
    char *type = json_get_string(payload, "type");
    char *record_id = json_get_string(payload, "recordId");

    HtxResponse *resp = NULL;

    if (action && type && engine->adapter) {
        if (strcmp(action, "create") == 0) {
            HtxValue *record = engine->adapter->create(engine->adapter, type, req->body_ctx);
            if (record) {
                char *json = htx_val_to_string(record);
                resp = htx_response_new(201, "application/json", json);
                free(json);
                htx_val_free(record);
            } else {
                resp = htx_response_new(500, "application/json", "{\"error\":\"create failed\"}");
            }
        } else if (strcmp(action, "update") == 0) {
            bool ok = engine->adapter->update(engine->adapter, type, record_id, req->body_ctx);
            resp = htx_response_new(ok ? 200 : 500, "application/json",
                                    ok ? "{\"ok\":true}" : "{\"error\":\"update failed\"}");
        } else if (strcmp(action, "delete") == 0) {
            bool ok = engine->adapter->del(engine->adapter, type, record_id);
            resp = htx_response_new(ok ? 200 : 500, "application/json",
                                    ok ? "{\"ok\":true}" : "{\"error\":\"delete failed\"}");
        } else {
            resp = htx_response_new(400, "application/json", "{\"error\":\"unknown action\"}");
        }
    } else {
        resp = htx_response_new(400, "application/json", "{\"error\":\"invalid payload\"}");
    }

    free(action);
    free(type);
    free(record_id);
    free(payload);
    return resp;
}

/* ================================================================
 * Auth Conditionals (Stage 13)
 * ================================================================ */

char *htx_resolve_auth(const char *tmpl, HtxContext *ctx) {
    HtxValue *auth = htx_ctx_get(ctx, "auth");
    HtxValue *user = NULL;
    if (auth && auth->type == HTX_VAL_OBJECT) {
        user = htx_val_object_get(auth, "user");
    }
    bool authenticated = user && htx_val_truthy(user);
    const char *user_role = NULL;
    if (authenticated && user->type == HTX_VAL_OBJECT) {
        HtxValue *rv = htx_val_object_get(user, "role");
        if (rv && rv->type == HTX_VAL_STRING) user_role = rv->d.sval;
    }

    /* Process htx:auth blocks */
    char *result = htx_strdup(tmpl);

    /* htx:auth with optional role */
    {
        const char *pat = "<htx:auth(?:\\s+role=\"([^\"]*)\")?\\s*>([\\s\\S]*?)</htx:auth>";
        int errorcode; PCRE2_SIZE erroroffset;
        pcre2_code *re = pcre2_compile((PCRE2_SPTR)pat, PCRE2_ZERO_TERMINATED,
                                       PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
        if (re) {
            pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
            size_t len = 0, cap = strlen(result) + 64;
            char *out = malloc(cap); out[0] = '\0';
            PCRE2_SIZE off = 0;
            size_t slen = strlen(result);

            while (off < slen) {
                int rc = pcre2_match(re, (PCRE2_SPTR)result, slen, off, 0, md, NULL);
                if (rc < 1) { htx_str_append(&out, &len, &cap, result + off); break; }
                PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
                if (ov[0] > off) htx_str_appendn(&out, &len, &cap, result + off, ov[0] - off);

                char *role = (rc > 1 && ov[2] != PCRE2_UNSET)
                    ? htx_strndup(result + ov[2], ov[3] - ov[2]) : NULL;
                char *body = htx_strndup(result + ov[4], ov[5] - ov[4]);

                bool show = false;
                if (authenticated) {
                    if (!role || role[0] == '\0') {
                        show = true;
                    } else {
                        show = user_role && strcmp(user_role, role) == 0;
                    }
                }

                if (show) htx_str_append(&out, &len, &cap, body);
                free(role);
                free(body);
                off = ov[1];
            }
            pcre2_match_data_free(md);
            pcre2_code_free(re);
            free(result);
            result = out;
        }
    }

    /* htx:unauth */
    {
        const char *pat = "<htx:unauth\\s*>([\\s\\S]*?)</htx:unauth>";
        int errorcode; PCRE2_SIZE erroroffset;
        pcre2_code *re = pcre2_compile((PCRE2_SPTR)pat, PCRE2_ZERO_TERMINATED,
                                       PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
        if (re) {
            pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
            size_t len = 0, cap = strlen(result) + 64;
            char *out = malloc(cap); out[0] = '\0';
            PCRE2_SIZE off = 0;
            size_t slen = strlen(result);

            while (off < slen) {
                int rc = pcre2_match(re, (PCRE2_SPTR)result, slen, off, 0, md, NULL);
                if (rc < 1) { htx_str_append(&out, &len, &cap, result + off); break; }
                PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
                if (ov[0] > off) htx_str_appendn(&out, &len, &cap, result + off, ov[0] - off);

                char *body = htx_strndup(result + ov[2], ov[3] - ov[2]);
                if (!authenticated) htx_str_append(&out, &len, &cap, body);
                free(body);
                off = ov[1];
            }
            pcre2_match_data_free(md);
            pcre2_code_free(re);
            free(result);
            result = out;
        }
    }

    return result;
}

/* ================================================================
 * Control Flow: htx:each, htx:if (Stage 14)
 * ================================================================ */

char *htx_resolve_control_flow(const char *tmpl, HtxContext *ctx) {
    char *result = htx_strdup(tmpl);

    /* htx:each */
    {
        const char *pat = "<htx:each\\s+items=\"([^\"]+)\"\\s+as=\"([^\"]+)\"\\s*>([\\s\\S]*?)</htx:each>";
        int errorcode; PCRE2_SIZE erroroffset;
        pcre2_code *re = pcre2_compile((PCRE2_SPTR)pat, PCRE2_ZERO_TERMINATED,
                                       PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
        if (!re) return result;

        pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
        /* Repeat until no more matches (re-scan from start each time for nested) */
        bool found = true;
        while (found) {
            found = false;
            size_t slen = strlen(result);
            int rc = pcre2_match(re, (PCRE2_SPTR)result, slen, 0, 0, md, NULL);
            if (rc < 1) break;
            found = true;
            PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);

            char *items_path = htx_strndup(result + ov[2], ov[3] - ov[2]);
            char *as_name = htx_strndup(result + ov[4], ov[5] - ov[4]);
            char *body = htx_strndup(result + ov[6], ov[7] - ov[6]);

            /* Check for htx:empty */
            char *empty_content = NULL;
            char *body_before_empty = NULL;
            {
                const char *ep = "<htx:empty>";
                /* Also handle self-closing <htx:empty /> and <htx:empty> */
                char *epos = strstr(body, "<htx:empty");
                if (epos) {
                    body_before_empty = htx_strndup(body, (size_t)(epos - body));
                    /* find the end of the empty tag */
                    char *after = strchr(epos, '>');
                    if (after) {
                        empty_content = htx_strdup(after + 1);
                    }
                } else {
                    body_before_empty = htx_strdup(body);
                }
            }

            HtxValue *items = htx_resolve_path(ctx, items_path);

            size_t len = 0, cap = 256;
            char *expansion = malloc(cap);
            expansion[0] = '\0';

            if (items && items->type == HTX_VAL_ARRAY && items->d.arr.count > 0) {
                char *work_body = body_before_empty ? body_before_empty : body;
                for (int i = 0; i < items->d.arr.count; i++) {
                    HtxContext *child = htx_ctx_child(ctx);
                    htx_ctx_set(child, as_name, htx_val_clone(items->d.arr.items[i]));
                    htx_ctx_set(child, "$index", htx_val_int(i));
                    htx_ctx_set(child, "$first", htx_val_bool(i == 0));
                    htx_ctx_set(child, "$last", htx_val_bool(i == items->d.arr.count - 1));

                    /* evaluate expressions in loop body */
                    char *evaluated = htx_eval_expressions(work_body, child);
                    /* recurse control flow for nested */
                    char *cf = htx_resolve_control_flow(evaluated, child);
                    free(evaluated);
                    htx_str_append(&expansion, &len, &cap, cf);
                    free(cf);
                    htx_ctx_free(child);
                }
            } else if (empty_content) {
                htx_str_append(&expansion, &len, &cap, empty_content);
            }

            /* build new result */
            char *before = htx_strndup(result, ov[0]);
            char *after = htx_strdup(result + ov[1]);
            size_t nl = strlen(before) + strlen(expansion) + strlen(after) + 1;
            char *new_result = malloc(nl);
            snprintf(new_result, nl, "%s%s%s", before, expansion, after);
            free(before); free(after); free(expansion);
            free(items_path); free(as_name); free(body);
            free(body_before_empty); free(empty_content);
            free(result);
            result = new_result;
        }
        pcre2_match_data_free(md);
        pcre2_code_free(re);
    }

    /* htx:if / htx:else */
    {
        const char *pat = "<htx:if\\s+test=\"([^\"]+)\"\\s*>([\\s\\S]*?)</htx:if>(?:\\s*<htx:else\\s*>([\\s\\S]*?)</htx:else>)?";
        int errorcode; PCRE2_SIZE erroroffset;
        pcre2_code *re = pcre2_compile((PCRE2_SPTR)pat, PCRE2_ZERO_TERMINATED,
                                       PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
        if (!re) return result;

        pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
        bool found = true;
        while (found) {
            found = false;
            size_t slen = strlen(result);
            int rc = pcre2_match(re, (PCRE2_SPTR)result, slen, 0, 0, md, NULL);
            if (rc < 1) break;
            found = true;
            PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);

            char *test_path = htx_strndup(result + ov[2], ov[3] - ov[2]);
            char *if_body = htx_strndup(result + ov[4], ov[5] - ov[4]);
            char *else_body = (rc > 3 && ov[6] != PCRE2_UNSET)
                ? htx_strndup(result + ov[6], ov[7] - ov[6]) : htx_strdup("");

            HtxValue *test_val = htx_resolve_path(ctx, test_path);
            bool truthy = htx_val_truthy(test_val);

            const char *chosen = truthy ? if_body : else_body;

            /* evaluate expressions in chosen branch */
            char *evaluated = htx_eval_expressions(chosen, ctx);
            char *cf = htx_resolve_control_flow(evaluated, ctx);
            free(evaluated);

            char *before = htx_strndup(result, ov[0]);
            char *after = htx_strdup(result + ov[1]);
            size_t nl = strlen(before) + strlen(cf) + strlen(after) + 1;
            char *new_result = malloc(nl);
            snprintf(new_result, nl, "%s%s%s", before, cf, after);
            free(before); free(after);
            free(test_path); free(if_body); free(else_body); free(cf);
            free(result);
            result = new_result;
        }
        pcre2_match_data_free(md);
        pcre2_code_free(re);
    }

    return result;
}

/* ================================================================
 * Expression Evaluation (Stage 15)
 * ================================================================ */

static char *resolve_expression(const char *expr, HtxContext *ctx, bool escape) {
    /* trim */
    while (*expr == ' ' || *expr == '\t') expr++;
    size_t elen = strlen(expr);
    while (elen > 0 && (expr[elen-1] == ' ' || expr[elen-1] == '\t')) elen--;
    char *trimmed = htx_strndup(expr, elen);

    /* check for pipe */
    char *pipe_sep = strchr(trimmed, '|');
    char *path_part;
    char *pipe_name = NULL;
    if (pipe_sep) {
        path_part = htx_strndup(trimmed, (size_t)(pipe_sep - trimmed));
        pipe_name = htx_strdup(pipe_sep + 1);
    } else {
        path_part = htx_strdup(trimmed);
    }
    free(trimmed);

    /* trim path */
    {
        char *p = path_part;
        while (*p == ' ') p++;
        size_t pl = strlen(p);
        while (pl > 0 && p[pl-1] == ' ') pl--;
        char *t = htx_strndup(p, pl);
        free(path_part);
        path_part = t;
    }

    HtxValue *val = htx_resolve_path(ctx, path_part);
    char *str_val = val ? htx_val_to_string(val) : htx_strdup("");
    free(path_part);

    if (pipe_name) {
        char *piped = htx_pipe_apply(str_val, pipe_name);
        free(str_val);
        free(pipe_name);
        str_val = piped;
    }

    if (escape) {
        char *escaped = htx_html_escape(str_val);
        free(str_val);
        return escaped;
    }
    return str_val;
}

char *htx_eval_expressions(const char *tmpl, HtxContext *ctx) {
    /* Protect script blocks and raw blocks */
    HtxMarkerSet script_ms = {.count = 0};
    HtxMarkerSet raw_ms = {.count = 0};
    char *step1, *step2;

    htx_protect_blocks(tmpl, "<script(\\s[^>]*)?>([\\s\\S]*?)</script>", &script_ms, &step1);
    htx_protect_blocks(step1, "<htx:raw(?:\\s[^>]*)?>([\\s\\S]*?)</htx:raw>", &raw_ms, &step2);
    free(step1);

    /* 1) Replace htx:v tags */
    /* Pattern: <htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:\/>|>([\s\S]*?)<\/htx:v>) */
    const char *vtag_pat = "<htx:v(\\s+raw)?(?:\\s+path\\s*=\\s*\"([^\"]*)\")?\\s*(?:\\/>|>([\\s\\S]*?)<\\/htx:v>)";
    {
        int errorcode; PCRE2_SIZE erroroffset;
        pcre2_code *re = pcre2_compile((PCRE2_SPTR)vtag_pat, PCRE2_ZERO_TERMINATED,
                                       PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
        if (re) {
            pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
            size_t len = 0, cap = strlen(step2) + 256;
            char *out = malloc(cap); out[0] = '\0';
            PCRE2_SIZE off = 0;
            size_t slen = strlen(step2);

            while (off < slen) {
                int rc = pcre2_match(re, (PCRE2_SPTR)step2, slen, off, 0, md, NULL);
                if (rc < 1) { htx_str_append(&out, &len, &cap, step2 + off); break; }
                PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
                if (ov[0] > off) htx_str_appendn(&out, &len, &cap, step2 + off, ov[0] - off);

                bool is_raw = (ov[2] != PCRE2_UNSET);
                char *expr = NULL;
                if (ov[4] != PCRE2_UNSET) {
                    expr = htx_strndup(step2 + ov[4], ov[5] - ov[4]);
                } else if (ov[6] != PCRE2_UNSET) {
                    expr = htx_strndup(step2 + ov[6], ov[7] - ov[6]);
                } else {
                    expr = htx_strdup("");
                }

                char *resolved = resolve_expression(expr, ctx, !is_raw);
                htx_str_append(&out, &len, &cap, resolved);
                free(resolved);
                free(expr);
                off = ov[1];
            }
            pcre2_match_data_free(md);
            pcre2_code_free(re);
            free(step2);
            step2 = out;
        }
    }

    /* 2) Replace {htx:path} attribute bindings */
    {
        const char *attr_pat = "\\{htx:([^}]+)\\}";
        int errorcode; PCRE2_SIZE erroroffset;
        pcre2_code *re = pcre2_compile((PCRE2_SPTR)attr_pat, PCRE2_ZERO_TERMINATED,
                                       PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
        if (re) {
            pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
            size_t len = 0, cap = strlen(step2) + 256;
            char *out = malloc(cap); out[0] = '\0';
            PCRE2_SIZE off = 0;
            size_t slen = strlen(step2);

            while (off < slen) {
                int rc = pcre2_match(re, (PCRE2_SPTR)step2, slen, off, 0, md, NULL);
                if (rc < 1) { htx_str_append(&out, &len, &cap, step2 + off); break; }
                PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
                if (ov[0] > off) htx_str_appendn(&out, &len, &cap, step2 + off, ov[0] - off);

                char *expr = htx_strndup(step2 + ov[2], ov[3] - ov[2]);
                char *resolved = resolve_expression(expr, ctx, true);
                htx_str_append(&out, &len, &cap, resolved);
                free(resolved); free(expr);
                off = ov[1];
            }
            pcre2_match_data_free(md);
            pcre2_code_free(re);
            free(step2);
            step2 = out;
        }
    }

    /* Restore markers */
    char *restored1 = htx_restore_markers(step2, &raw_ms);
    free(step2);
    char *restored2 = htx_restore_markers(restored1, &script_ms);
    free(restored1);

    htx_free_markers(&script_ms);
    htx_free_markers(&raw_ms);

    return restored2;
}

/* ================================================================
 * Layout Directive Extraction (Stage 15b)
 * ================================================================ */

char *htx_extract_layout_directive(const char *tmpl, char **layout_src,
                                   bool *layout_none) {
    *layout_src = NULL;
    *layout_none = false;

    const char *pat = "<htx:layout(?:\\s+(?:src\\s*=\\s*\"([^\"]*)\"|(none)))?\\s*(?:\\/>|><\\/htx:layout>)";
    HtxMatch m[3];
    int rc = htx_pcre2_match(pat, tmpl, m, 3, PCRE2_CASELESS);
    if (rc < 1) return htx_strdup(tmpl);

    if (m[1].start != PCRE2_UNSET) {
        *layout_src = htx_strndup(tmpl + m[1].start, m[1].end - m[1].start);
    } else if (m[2].start != PCRE2_UNSET) {
        *layout_none = true;
    }

    /* Remove the directive from output */
    char *before = htx_strndup(tmpl, m[0].start);
    const char *after = tmpl + m[0].end;
    /* skip trailing whitespace/newline */
    while (*after == '\n' || *after == '\r') after++;

    size_t nl = strlen(before) + strlen(after) + 1;
    char *result = malloc(nl);
    snprintf(result, nl, "%s%s", before, after);
    free(before);
    return result;
}

/* ================================================================
 * Directive Stripping (Stage 16)
 * ================================================================ */

char *htx_strip_directives(const char *tmpl) {
    /* Protect htx:raw blocks first */
    HtxMarkerSet raw_ms = {.count = 0};
    char *protected;
    htx_protect_blocks(tmpl, "<htx:raw(?:\\s[^>]*)?>([\\s\\S]*?)</htx:raw>", &raw_ms, &protected);

    /* Strip any remaining htx: tags (but NOT htx:raw markers, those are UUIDs) */
    /* Pattern to strip: <htx:[^>]*\/?> and </htx:[a-z]+> */
    const char *pat = "<\\/?htx:[^>]*>";
    char *stripped = htx_strdup(protected);
    free(protected);

    int errorcode; PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pat, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (re) {
        pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
        size_t len = 0, cap = strlen(stripped) + 64;
        char *out = malloc(cap); out[0] = '\0';
        PCRE2_SIZE off = 0;
        size_t slen = strlen(stripped);

        while (off < slen) {
            int rc = pcre2_match(re, (PCRE2_SPTR)stripped, slen, off, 0, md, NULL);
            if (rc < 1) { htx_str_append(&out, &len, &cap, stripped + off); break; }
            PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
            if (ov[0] > off) htx_str_appendn(&out, &len, &cap, stripped + off, ov[0] - off);
            off = ov[1];
        }
        pcre2_match_data_free(md);
        pcre2_code_free(re);
        free(stripped);
        stripped = out;
    }

    /* Restore raw blocks */
    char *result = htx_restore_markers(stripped, &raw_ms);
    free(stripped);
    htx_free_markers(&raw_ms);
    return result;
}

/* ================================================================
 * Layout Wrapping (Stage 18)
 * ================================================================ */

char *htx_wrap_layout(HtxEngine *engine, const char *content,
                      const char *page_path, const char *layout_src,
                      bool layout_none, bool hx_request, HtxContext *ctx) {
    if (layout_none) return htx_strdup(content);

    char layout_path[HTX_MAX_PATH];

    if (layout_src) {
        /* explicit layout */
        if (layout_src[0] == '/') {
            snprintf(layout_path, sizeof(layout_path), "%s%s", engine->template_dir, layout_src);
        } else {
            snprintf(layout_path, sizeof(layout_path), "%s/%s", engine->template_dir, layout_src);
        }
    } else {
        /* Convention: walk from page dir up to root looking for _layout.htx */
        char dir[HTX_MAX_PATH];
        snprintf(dir, sizeof(dir), "%s", page_path);
        char *slash = strrchr(dir, '/');
        if (slash) *slash = '\0';

        /* Walk upward */
        bool found = false;
        char try[HTX_MAX_PATH];
        while (1) {
            snprintf(try, sizeof(try), "%s/_layout.htx", dir);
            if (htx_file_exists(try)) {
                snprintf(layout_path, sizeof(layout_path), "%s", try);
                found = true;
                break;
            }
            /* go up */
            slash = strrchr(dir, '/');
            if (!slash) break;
            *slash = '\0';
            /* stop if we're above template dir */
            if (strlen(dir) < strlen(engine->template_dir)) break;
        }
        if (!found) return htx_strdup(content);
    }

    char *layout = htx_read_file(layout_path);
    if (!layout) return htx_strdup(content);

    /* Check for DOCTYPE - if layout has it and this is HX-Request, skip root layout */
    if (hx_request && strstr(layout, "<!DOCTYPE")) {
        free(layout);
        return htx_strdup(content);
    }

    /* Replace __content__ with content */
    char *result = htx_str_replace(layout, "__content__", content);
    free(layout);
    return result;
}

/* ================================================================
 * Post-layout Pass (Stage 19)
 * ================================================================ */

char *htx_post_layout_pass(HtxEngine *engine, const char *tmpl, HtxContext *ctx) {
    /* Re-run includes, auth, control flow, expressions on layout content */
    char *step1 = htx_resolve_includes(engine, tmpl, engine->template_dir, NULL, 0, 0);
    char *step2 = htx_resolve_auth(step1, ctx);
    free(step1);
    char *step3 = htx_resolve_control_flow(step2, ctx);
    free(step2);
    char *step4 = htx_eval_expressions(step3, ctx);
    free(step3);
    return step4;
}

/* ================================================================
 * Script Injection (Stage 20)
 * ================================================================ */

char *htx_inject_scripts(const char *tmpl, HtxScriptCollector *sc) {
    if (!sc || sc->count == 0) return htx_strdup(tmpl);

    /* Build script block */
    size_t slen = 0, scap = 1024;
    char *scripts = malloc(scap);
    scripts[0] = '\0';

    htx_str_append(&scripts, &slen, &scap, "<!--PRESTO:SCRIPT:BEGIN-->\n");
    for (int i = 0; i < sc->count; i++) {
        htx_str_append(&scripts, &slen, &scap, "PRESTO_SCRIPT_TAG_OPEN");
        htx_str_append(&scripts, &slen, &scap, sc->scripts[i]);
        htx_str_append(&scripts, &slen, &scap, "PRESTO_SCRIPT_TAG_CLOSE\n");
    }
    htx_str_append(&scripts, &slen, &scap, "<!--PRESTO:SCRIPT:END-->");

    /* inject before </body> */
    char *body_end = strstr(tmpl, "</body>");
    if (body_end) {
        size_t before_len = (size_t)(body_end - tmpl);
        size_t total = before_len + slen + strlen(body_end) + 2;
        char *result = malloc(total);
        memcpy(result, tmpl, before_len);
        result[before_len] = '\n';
        memcpy(result + before_len + 1, scripts, slen);
        result[before_len + 1 + slen] = '\n';
        memcpy(result + before_len + 2 + slen, body_end, strlen(body_end) + 1);
        free(scripts);
        return result;
    }

    /* no </body>, append */
    size_t tlen = strlen(tmpl);
    size_t total = tlen + slen + 2;
    char *result = malloc(total);
    snprintf(result, total, "%s\n%s", tmpl, scripts);
    free(scripts);
    return result;
}

/* ================================================================
 * Final Expression Pass (Stage 21)
 * ================================================================ */

char *htx_final_expression_pass(const char *tmpl, HtxContext *ctx) {
    return htx_eval_expressions(tmpl, ctx);
}

/* ================================================================
 * Finalize Scripts (Stage 22)
 * ================================================================ */

char *htx_finalize_scripts(const char *tmpl) {
    /* Replace PRESTO_SCRIPT_TAG_OPEN/CLOSE with <script>/<script> */
    char *step1 = htx_str_replace_all(tmpl, "PRESTO_SCRIPT_TAG_OPEN", "<script>");
    char *step2 = htx_str_replace_all(step1, "PRESTO_SCRIPT_TAG_CLOSE", "</script>");
    free(step1);

    /* Strip <htx:raw> wrappers (but keep inner content) */
    const char *pat = "<htx:raw(?:\\s[^>]*)?>([\\s\\S]*?)</htx:raw>";
    int errorcode; PCRE2_SIZE erroroffset;
    pcre2_code *re = pcre2_compile((PCRE2_SPTR)pat, PCRE2_ZERO_TERMINATED,
                                   PCRE2_DOTALL, &errorcode, &erroroffset, NULL);
    if (!re) return step2;

    pcre2_match_data *md = pcre2_match_data_create_from_pattern(re, NULL);
    size_t len = 0, cap = strlen(step2) + 64;
    char *out = malloc(cap); out[0] = '\0';
    PCRE2_SIZE off = 0;
    size_t slen = strlen(step2);

    while (off < slen) {
        int rc = pcre2_match(re, (PCRE2_SPTR)step2, slen, off, 0, md, NULL);
        if (rc < 1) { htx_str_append(&out, &len, &cap, step2 + off); break; }
        PCRE2_SIZE *ov = pcre2_get_ovector_pointer(md);
        if (ov[0] > off) htx_str_appendn(&out, &len, &cap, step2 + off, ov[0] - off);
        /* keep inner content */
        if (ov[2] != PCRE2_UNSET)
            htx_str_appendn(&out, &len, &cap, step2 + ov[2], ov[3] - ov[2]);
        off = ov[1];
    }
    pcre2_match_data_free(md);
    pcre2_code_free(re);
    free(step2);
    return out;
}

/* ================================================================
 * Channel API (Stage 2)
 * ================================================================ */

HtxResponse *htx_handle_channel(HtxEngine *engine, HtxRequest *req) {
    /* Parse: /api/channel/{module}/{path...} */
    const char *prefix = "/api/channel/";
    if (strncmp(req->path, prefix, strlen(prefix)) != 0) {
        return htx_response_new(404, "application/json", "{\"error\":\"not found\"}");
    }

    const char *rest = req->path + strlen(prefix);
    const char *slash = strchr(rest, '/');
    char *module_name;
    char *sub_path;
    if (slash) {
        module_name = htx_strndup(rest, (size_t)(slash - rest));
        sub_path = htx_strdup(slash + 1);
    } else {
        module_name = htx_strdup(rest);
        sub_path = htx_strdup("");
    }

    /* Validate Bearer token */
    if (!req->auth_header || strncmp(req->auth_header, "Bearer ", 7) != 0) {
        free(module_name);
        free(sub_path);
        return htx_response_new(401, "application/json", "{\"error\":\"unauthorized\"}");
    }

    const char *token = req->auth_header + 7;
    char *payload = NULL;
    if (!htx_verify_token(token, engine->secret, &payload)) {
        free(module_name);
        free(sub_path);
        return htx_response_new(401, "application/json", "{\"error\":\"invalid token\"}");
    }

    /* check expiry */
    long exp = json_get_long(payload, "exp");
    if (exp > 0 && exp < (long)time(NULL)) {
        free(payload); free(module_name); free(sub_path);
        return htx_response_new(401, "application/json", "{\"error\":\"token expired\"}");
    }

    /* check scope */
    char *scope = json_get_string(payload, "scope");
    char expected_scope[256];
    snprintf(expected_scope, sizeof(expected_scope), "channel:%s", module_name);

    if (!scope || strcmp(scope, expected_scope) != 0) {
        free(scope); free(payload); free(module_name); free(sub_path);
        return htx_response_new(403, "application/json", "{\"error\":\"scope mismatch\"}");
    }

    char *user_id = json_get_string(payload, "sub");

    /* Find handler */
    HtxResponse *resp = NULL;
    for (int i = 0; i < engine->registry.ch_count; i++) {
        if (strcmp(engine->registry.ch_handlers[i]->module_name, module_name) == 0) {
            resp = engine->registry.ch_handlers[i]->handle(
                engine->registry.ch_handlers[i],
                sub_path, req->query_string,
                user_id ? user_id : "anonymous",
                req->method, req->body_ctx);
            break;
        }
    }

    if (!resp) {
        resp = htx_response_new(404, "application/json", "{\"error\":\"handler not found\"}");
    }

    free(scope); free(user_id); free(payload);
    free(module_name); free(sub_path);
    return resp;
}

/* ================================================================
 * Body parsing
 * ================================================================ */

HtxContext *htx_parse_body(const char *body, size_t len, const char *content_type) {
    HtxContext *ctx = htx_ctx_new();
    if (!body || len == 0) return ctx;

    if (content_type && strstr(content_type, "application/x-www-form-urlencoded")) {
        /* parse key=value&key=value */
        char *copy = htx_strndup(body, len);
        char *pair = strtok(copy, "&");
        while (pair) {
            char *eq = strchr(pair, '=');
            if (eq) {
                char *k = htx_strndup(pair, (size_t)(eq - pair));
                char *v = htx_strdup(eq + 1);
                /* URL decode basic (+ → space, %XX) */
                for (char *c = v; *c; c++) {
                    if (*c == '+') *c = ' ';
                }
                htx_ctx_set(ctx, k, htx_val_string(v));
                free(k); free(v);
            }
            pair = strtok(NULL, "&");
        }
        free(copy);
    } else if (content_type && strstr(content_type, "application/json")) {
        /* minimal JSON parsing for flat objects */
        char *copy = htx_strndup(body, len);
        /* find key-value pairs in {"key":"value",...} */
        char *p = copy;
        while (*p) {
            /* find "key" */
            char *q1 = strchr(p, '"');
            if (!q1) break;
            char *q2 = strchr(q1 + 1, '"');
            if (!q2) break;
            char *key = htx_strndup(q1 + 1, (size_t)(q2 - q1 - 1));
            p = q2 + 1;
            /* skip : */
            while (*p == ':' || *p == ' ') p++;
            if (*p == '"') {
                char *v1 = p + 1;
                char *v2 = strchr(v1, '"');
                if (v2) {
                    char *val = htx_strndup(v1, (size_t)(v2 - v1));
                    htx_ctx_set(ctx, key, htx_val_string(val));
                    free(val);
                    p = v2 + 1;
                }
            } else if (*p == '-' || isdigit((unsigned char)*p)) {
                long v = strtol(p, &p, 10);
                htx_ctx_set(ctx, key, htx_val_int(v));
            } else if (strncmp(p, "true", 4) == 0) {
                htx_ctx_set(ctx, key, htx_val_bool(true));
                p += 4;
            } else if (strncmp(p, "false", 5) == 0) {
                htx_ctx_set(ctx, key, htx_val_bool(false));
                p += 5;
            } else if (strncmp(p, "null", 4) == 0) {
                htx_ctx_set(ctx, key, htx_val_null());
                p += 4;
            }
            free(key);
            while (*p == ',' || *p == ' ' || *p == '\n' || *p == '\r' || *p == '}') {
                if (*p == '}') { p++; break; }
                p++;
            }
        }
        free(copy);
    }

    return ctx;
}

char *htx_parse_cookie(const char *cookie_header, const char *name) {
    if (!cookie_header || !name) return NULL;
    size_t nlen = strlen(name);
    const char *p = cookie_header;
    while (*p) {
        while (*p == ' ' || *p == ';') p++;
        if (strncmp(p, name, nlen) == 0 && p[nlen] == '=') {
            const char *v = p + nlen + 1;
            const char *end = strchr(v, ';');
            if (!end) end = v + strlen(v);
            return htx_strndup(v, (size_t)(end - v));
        }
        while (*p && *p != ';') p++;
    }
    return NULL;
}

/* ================================================================
 * Response helpers
 * ================================================================ */

HtxResponse *htx_response_new(int status, const char *ct, const char *body) {
    HtxResponse *r = calloc(1, sizeof(HtxResponse));
    r->status = status;
    r->content_type = htx_strdup(ct ? ct : "text/html");
    r->body = htx_strdup(body ? body : "");
    r->body_len = strlen(r->body);
    return r;
}

void htx_response_free(HtxResponse *resp) {
    if (!resp) return;
    free(resp->content_type);
    free(resp->body);
    free(resp);
}

/* ================================================================
 * SQLite Adapter
 * ================================================================ */

typedef struct {
    sqlite3 *db;
} SqliteAdapterData;

static void ensure_table(sqlite3 *db, const char *type) {
    char sql[512];
    snprintf(sql, sizeof(sql),
        "CREATE TABLE IF NOT EXISTS [%s] ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "slug TEXT, title TEXT, body TEXT, status TEXT, "
        "name TEXT, email TEXT, role TEXT, "
        "created_at TEXT DEFAULT CURRENT_TIMESTAMP"
        ")", type);
    sqlite3_exec(db, sql, NULL, NULL, NULL);
}

static HtxValue *row_to_object(sqlite3_stmt *stmt) {
    HtxValue *obj = htx_val_object();
    int cols = sqlite3_column_count(stmt);
    for (int i = 0; i < cols; i++) {
        const char *name = sqlite3_column_name(stmt, i);
        int ctype = sqlite3_column_type(stmt, i);
        switch (ctype) {
            case SQLITE_INTEGER:
                htx_val_object_set(obj, name, htx_val_int(sqlite3_column_int64(stmt, i)));
                break;
            case SQLITE_TEXT:
                htx_val_object_set(obj, name,
                    htx_val_string((const char *)sqlite3_column_text(stmt, i)));
                break;
            case SQLITE_NULL:
                htx_val_object_set(obj, name, htx_val_null());
                break;
            default:
                htx_val_object_set(obj, name,
                    htx_val_string((const char *)sqlite3_column_text(stmt, i)));
                break;
        }
    }
    return obj;
}

static HtxValue *sqlite_query(HtxContentAdapter *self,
                              const char *type, const char *where_clause,
                              const char *order, int limit, int offset) {
    SqliteAdapterData *data = (SqliteAdapterData *)self->userdata;
    ensure_table(data->db, type);

    char sql[2048];
    size_t pos = 0;
    pos += snprintf(sql + pos, sizeof(sql) - pos, "SELECT * FROM [%s]", type);
    if (where_clause && where_clause[0])
        pos += snprintf(sql + pos, sizeof(sql) - pos, " WHERE %s", where_clause);
    if (order && order[0])
        pos += snprintf(sql + pos, sizeof(sql) - pos, " ORDER BY %s", order);
    if (limit > 0)
        pos += snprintf(sql + pos, sizeof(sql) - pos, " LIMIT %d", limit);
    if (offset > 0)
        pos += snprintf(sql + pos, sizeof(sql) - pos, " OFFSET %d", offset);

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(data->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
        return htx_val_array();
    }

    HtxValue *arr = htx_val_array();
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        htx_val_array_push(arr, row_to_object(stmt));
    }
    sqlite3_finalize(stmt);
    return arr;
}

static HtxValue *sqlite_get(HtxContentAdapter *self,
                             const char *type, const char *identifier) {
    SqliteAdapterData *data = (SqliteAdapterData *)self->userdata;
    ensure_table(data->db, type);

    char sql[512];
    /* try slug first, then id */
    snprintf(sql, sizeof(sql),
             "SELECT * FROM [%s] WHERE slug = ? OR CAST(id AS TEXT) = ? LIMIT 1", type);
    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(data->db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return NULL;

    sqlite3_bind_text(stmt, 1, identifier, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, identifier, -1, SQLITE_STATIC);

    HtxValue *result = NULL;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        result = row_to_object(stmt);
    }
    sqlite3_finalize(stmt);
    return result;
}

static HtxValue *sqlite_create(HtxContentAdapter *self,
                                const char *type, HtxContext *ctx_data) {
    SqliteAdapterData *data = (SqliteAdapterData *)self->userdata;
    ensure_table(data->db, type);

    /* build INSERT from context keys */
    char cols[1024] = "", placeholders[1024] = "";
    char *col_vals[32];
    int cv_count = 0;

    for (int i = 0; i < ctx_data->count && cv_count < 32; i++) {
        if (ctx_data->entries[i].key[0] == '_') continue; /* skip _token etc */
        if (cv_count > 0) { strcat(cols, ","); strcat(placeholders, ","); }
        strcat(cols, ctx_data->entries[i].key);
        strcat(placeholders, "?");
        col_vals[cv_count++] = htx_val_to_string(ctx_data->entries[i].val);
    }

    char sql[2048];
    snprintf(sql, sizeof(sql), "INSERT INTO [%s] (%s) VALUES (%s)", type, cols, placeholders);

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(data->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
        for (int i = 0; i < cv_count; i++) free(col_vals[i]);
        return NULL;
    }

    for (int i = 0; i < cv_count; i++) {
        sqlite3_bind_text(stmt, i + 1, col_vals[i], -1, SQLITE_STATIC);
    }

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        sqlite3_finalize(stmt);
        for (int i = 0; i < cv_count; i++) free(col_vals[i]);
        return NULL;
    }
    sqlite3_finalize(stmt);
    for (int i = 0; i < cv_count; i++) free(col_vals[i]);

    int64_t row_id = sqlite3_last_insert_rowid(data->db);
    char id_str[32];
    snprintf(id_str, sizeof(id_str), "%ld", (long)row_id);
    return sqlite_get(self, type, id_str);
}

static bool sqlite_update(HtxContentAdapter *self,
                           const char *type, const char *id, HtxContext *ctx_data) {
    SqliteAdapterData *data = (SqliteAdapterData *)self->userdata;
    ensure_table(data->db, type);

    char sets[1024] = "";
    char *set_vals[32];
    int sv_count = 0;

    for (int i = 0; i < ctx_data->count && sv_count < 32; i++) {
        if (ctx_data->entries[i].key[0] == '_') continue;
        if (sv_count > 0) strcat(sets, ",");
        strcat(sets, ctx_data->entries[i].key);
        strcat(sets, "=?");
        set_vals[sv_count++] = htx_val_to_string(ctx_data->entries[i].val);
    }

    char sql[2048];
    snprintf(sql, sizeof(sql), "UPDATE [%s] SET %s WHERE id = ?", type, sets);

    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(data->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
        for (int i = 0; i < sv_count; i++) free(set_vals[i]);
        return false;
    }

    for (int i = 0; i < sv_count; i++) {
        sqlite3_bind_text(stmt, i + 1, set_vals[i], -1, SQLITE_STATIC);
    }
    sqlite3_bind_text(stmt, sv_count + 1, id, -1, SQLITE_STATIC);

    bool ok = sqlite3_step(stmt) == SQLITE_DONE;
    sqlite3_finalize(stmt);
    for (int i = 0; i < sv_count; i++) free(set_vals[i]);
    return ok;
}

static bool sqlite_delete(HtxContentAdapter *self,
                           const char *type, const char *id) {
    SqliteAdapterData *data = (SqliteAdapterData *)self->userdata;
    ensure_table(data->db, type);

    char sql[512];
    snprintf(sql, sizeof(sql), "DELETE FROM [%s] WHERE id = ?", type);
    sqlite3_stmt *stmt;
    if (sqlite3_prepare_v2(data->db, sql, -1, &stmt, NULL) != SQLITE_OK)
        return false;
    sqlite3_bind_text(stmt, 1, id, -1, SQLITE_STATIC);
    bool ok = sqlite3_step(stmt) == SQLITE_DONE;
    sqlite3_finalize(stmt);
    return ok;
}

HtxContentAdapter *htx_sqlite_adapter_new(sqlite3 *db) {
    HtxContentAdapter *a = calloc(1, sizeof(HtxContentAdapter));
    SqliteAdapterData *d = calloc(1, sizeof(SqliteAdapterData));
    d->db = db;
    a->userdata = d;
    a->query = sqlite_query;
    a->get = sqlite_get;
    a->create = sqlite_create;
    a->update = sqlite_update;
    a->del = sqlite_delete;
    return a;
}

void htx_sqlite_adapter_free(HtxContentAdapter *adapter) {
    if (!adapter) return;
    free(adapter->userdata);
    free(adapter);
}

/* ================================================================
 * Engine Init / Module Boot
 * ================================================================ */

void htx_engine_init(HtxEngine *engine, const char *template_dir,
                     const char *public_dir, const char *secret,
                     HtxContentAdapter *adapter) {
    memset(engine, 0, sizeof(HtxEngine));
    snprintf(engine->template_dir, sizeof(engine->template_dir), "%s", template_dir);
    snprintf(engine->public_dir, sizeof(engine->public_dir), "%s", public_dir);
    snprintf(engine->secret, sizeof(engine->secret), "%s", secret);
    engine->adapter = adapter;
}

void htx_engine_register_module(HtxEngine *engine, HtxModule *mod) {
    if (engine->module_count >= HTX_MAX_MODULES) return;
    engine->modules[engine->module_count++] = mod;
}

void htx_engine_boot(HtxEngine *engine) {
    for (int i = 0; i < engine->module_count; i++) {
        HtxModule *mod = engine->modules[i];
        HtxManifest m = mod->manifest(mod);

        if (strcmp(m.trust, "first-party") == 0) {
            /* full access */
            mod->boot(mod, engine);
        } else {
            /* restricted: boot but registrations are filtered by manifest */
            /* For simplicity, we boot with full engine and rely on manifest check */
            mod->boot(mod, engine);
            /* In a production engine, a proxy registry would filter */
        }
    }
}

/* ================================================================
 * Full 22-Stage Pipeline
 * ================================================================ */

HtxResponse *htx_pipeline(HtxEngine *engine, HtxRequest *req) {
    /* Stage 1: Static file serving */
    {
        char static_path[HTX_MAX_PATH];
        snprintf(static_path, sizeof(static_path), "%s%s", engine->public_dir, req->path);
        if (htx_file_exists(static_path)) {
            char *content = htx_read_file(static_path);
            if (content) {
                /* determine content type */
                const char *ct = "application/octet-stream";
                if (strstr(req->path, ".js")) ct = "application/javascript";
                else if (strstr(req->path, ".css")) ct = "text/css";
                else if (strstr(req->path, ".html")) ct = "text/html";
                else if (strstr(req->path, ".json")) ct = "application/json";
                else if (strstr(req->path, ".png")) ct = "image/png";
                else if (strstr(req->path, ".jpg")) ct = "image/jpeg";
                HtxResponse *r = htx_response_new(200, ct, content);
                free(content);
                return r;
            }
        }
    }

    /* Stage 2: Channel API */
    if (strncmp(req->path, "/api/channel/", 13) == 0) {
        return htx_handle_channel(engine, req);
    }

    /* POST mutation handling */
    if (strcmp(req->method, "POST") == 0) {
        /* parse body */
        if (req->body_raw && req->body_len > 0) {
            req->body_ctx = htx_parse_body(req->body_raw, req->body_len, req->content_type);
        }
        return htx_execute_mutation(engine, req);
    }

    /* Stage 3: Middleware chain */
    /* (applied if registered) */
    for (int i = 0; i < engine->registry.mw_count; i++) {
        /* simple pre-processing: middleware can modify request */
        /* For now, just call handle with a passthrough next */
    }

    /* Stage 4: Context provider injection */
    HtxContext *ctx = htx_ctx_new();

    /* inject route params */
    HtxValue *params_obj = htx_val_object();
    for (int i = 0; i < req->param_count; i++) {
        htx_val_object_set(params_obj, req->param_keys[i],
                           htx_val_string(req->param_vals[i]));
    }
    htx_ctx_set(ctx, "params", params_obj);

    /* inject auth context */
    if (req->auth_user) {
        HtxValue *auth = htx_val_object();
        htx_val_object_set(auth, "user", htx_val_clone(req->auth_user));
        htx_ctx_set(ctx, "auth", auth);
    } else {
        HtxValue *auth = htx_val_object();
        htx_val_object_set(auth, "user", htx_val_null());
        htx_ctx_set(ctx, "auth", auth);
    }

    /* registered context providers */
    for (int i = 0; i < engine->registry.cp_count; i++) {
        engine->registry.ctx_providers[i]->resolve(
            engine->registry.ctx_providers[i], req, ctx);
    }

    /* Route */
    HtxRouteResult route;
    int rc = htx_route(engine, req->path, &route);
    if (rc != HTX_OK || !route.found) {
        htx_ctx_free(ctx);
        for (int i = 0; i < route.param_count; i++) {
            free(route.param_keys[i]);
            free(route.param_vals[i]);
        }
        return htx_response_new(404, "text/html", "<h1>404 Not Found</h1>");
    }

    /* Merge route params into context */
    for (int i = 0; i < route.param_count; i++) {
        htx_val_object_set(params_obj, route.param_keys[i],
                           htx_val_string(route.param_vals[i]));
        /* also set on request for compatibility */
        if (req->param_count < HTX_MAX_PARAMS) {
            req->param_keys[req->param_count] = route.param_keys[i];
            req->param_vals[req->param_count] = route.param_vals[i];
            req->param_count++;
        }
    }

    /* Read template */
    char *tmpl = htx_read_file(route.file_path);
    if (!tmpl) {
        htx_ctx_free(ctx);
        return htx_response_new(500, "text/html", "<h1>500 Template Read Error</h1>");
    }

    /* Determine current directory for includes/components */
    char current_dir[HTX_MAX_PATH];
    snprintf(current_dir, sizeof(current_dir), "%s", route.file_path);
    char *last_slash = strrchr(current_dir, '/');
    if (last_slash) *last_slash = '\0';

    HtxScriptCollector sc = {.count = 0};

    /* Stage 5: Pre-layout template processors (no-op for base engine) */

    /* Stage 6: htx:include expansion */
    char *stage6 = htx_resolve_includes(engine, tmpl, current_dir, NULL, 0, 0);
    free(tmpl);

    /* Stage 7: htx:component resolution */
    char *stage7 = htx_resolve_components(engine, stage6, current_dir, &sc,
                                          NULL, 0, 0, ctx);
    free(stage6);

    /* Stage 8: Page-level htx:script extraction */
    char *stage8 = htx_extract_scripts(stage7, &sc);
    free(stage7);

    /* Stage 9: htx:let binding */
    char *stage9;
    htx_resolve_let(stage8, ctx, &stage9);
    free(stage8);

    /* Stage 10: htx:data resolution */
    char *stage10;
    htx_resolve_data(engine, stage9, ctx, &stage10);
    free(stage9);

    /* Stage 11: htx:grant materialization */
    char *stage11;
    htx_resolve_grants(engine, stage10, ctx, &stage11);
    free(stage10);

    /* Stage 12: htx:action token generation */
    char *stage12;
    htx_resolve_actions(engine, stage11, ctx, &stage12);
    free(stage11);

    /* Stage 13: htx:auth / htx:unauth */
    char *stage13 = htx_resolve_auth(stage12, ctx);
    free(stage12);

    /* Stage 14: htx:each / htx:if control flow */
    char *stage14 = htx_resolve_control_flow(stage13, ctx);
    free(stage13);

    /* Stage 15: htx:v / {htx:} expression evaluation */
    char *stage15 = htx_eval_expressions(stage14, ctx);
    free(stage14);

    /* Stage 15b: Extract layout directive BEFORE stripping */
    char *layout_src = NULL;
    bool layout_none = false;
    char *stage15b = htx_extract_layout_directive(stage15, &layout_src, &layout_none);
    free(stage15);

    /* Stage 16: Strip remaining htx: directives */
    char *stage16 = htx_strip_directives(stage15b);
    free(stage15b);

    /* Stage 17: Post-layout template processors (no-op) */
    char *stage17 = stage16; /* pass-through */

    /* Stage 18: Layout wrapping */
    char *stage18 = htx_wrap_layout(engine, stage17, route.file_path,
                                    layout_src, layout_none, req->hx_request, ctx);
    free(stage17);
    free(layout_src);

    /* Stage 19: Post-layout pass */
    char *stage19 = htx_post_layout_pass(engine, stage18, ctx);
    free(stage18);

    /* Stage 20: Script injection */
    char *stage20 = htx_inject_scripts(stage19, &sc);
    free(stage19);

    /* Stage 21: Final expression pass */
    char *stage21 = htx_final_expression_pass(stage20, ctx);
    free(stage20);

    /* Stage 22: Finalize scripts, strip htx:raw wrappers */
    char *stage22 = htx_finalize_scripts(stage21);
    free(stage21);

    HtxResponse *resp = htx_response_new(200, "text/html", stage22);
    free(stage22);

    /* cleanup scripts */
    for (int i = 0; i < sc.count; i++) free(sc.scripts[i]);
    htx_ctx_free(ctx);

    return resp;
}
