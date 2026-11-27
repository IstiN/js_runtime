// qjs_harness.c — bare QuickJS command line; the host backend of the engine
// adapter interface in docs/ENGINE_ADAPTER.md.
//
// Usage:
//   qjs_harness [--iid <id>] [--preload <file>]... [--script <file>]...
//               [--call "<js>"]... [--out <file>]
//
// Items (--preload/--script/--call) run in the order given on the command
// line. The harness installs the JS global sendMessage(channel, payload) and
// writes one line "channel<TAB>payload" per call to stdout (or to --out).
// After each item it drains pending jobs with JS_ExecutePendingJob(rt, &pctx)
// — never a NULL pointer (a NULL pctx segfaults, android POC trap).
// It exits 1 when an item throws and prints the exception on stderr.
//
// Engine parameters mirror the reference adapter (android quickjs_jni.c):
// memory limit 64 MiB, max stack 512 KiB.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "quickjs.h"

typedef enum { ITEM_SCRIPT, ITEM_CALL } ItemType;

typedef struct {
    ItemType type;
    const char *arg;
} Item;

typedef struct {
    FILE *out;
} Harness;

static JSValue js_send_message(JSContext *ctx, JSValueConst this_val,
                               int argc, JSValueConst *argv) {
    (void)this_val;
    Harness *h = (Harness *)JS_GetContextOpaque(ctx);
    if (!h || argc < 2) return JS_UNDEFINED;
    const char *channel = JS_ToCString(ctx, argv[0]);
    const char *payload = JS_ToCString(ctx, argv[1]);
    if (channel && payload) {
        fprintf(h->out, "%s\t%s\n", channel, payload);
    }
    if (channel) JS_FreeCString(ctx, channel);
    if (payload) JS_FreeCString(ctx, payload);
    return JS_UNDEFINED;
}

static char *read_file(const char *path, size_t *len_out) {
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return NULL; }
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); perror(path); return NULL; }
    long size = ftell(f);
    if (size < 0) { fclose(f); perror(path); return NULL; }
    rewind(f);
    char *buf = malloc((size_t)size + 1);
    if (!buf) { fclose(f); return NULL; }
    if (fread(buf, 1, (size_t)size, f) != (size_t)size) {
        fclose(f); free(buf); fprintf(stderr, "qjs_harness: short read: %s\n", path);
        return NULL;
    }
    fclose(f);
    buf[size] = '\0';
    if (len_out) *len_out = (size_t)size;
    return buf;
}

static void usage(void) {
    fprintf(stderr,
            "usage: qjs_harness [--iid <id>] [--preload <file>]... "
            "[--script <file>]... [--call \"<js>\"]... [--out <file>]\n");
}

int main(int argc, char **argv) {
    Item items[256];
    int nitems = 0;
    const char *iid = NULL;
    const char *out_path = NULL;

    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--iid") && i + 1 < argc) {
            iid = argv[++i];
        } else if ((!strcmp(argv[i], "--preload") || !strcmp(argv[i], "--script")) &&
                   i + 1 < argc) {
            items[nitems].type = ITEM_SCRIPT;
            items[nitems].arg = argv[++i];
            nitems++;
        } else if (!strcmp(argv[i], "--call") && i + 1 < argc) {
            items[nitems].type = ITEM_CALL;
            items[nitems].arg = argv[++i];
            nitems++;
        } else if (!strcmp(argv[i], "--out") && i + 1 < argc) {
            out_path = argv[++i];
        } else {
            usage();
            return 1;
        }
    }
    if (nitems > 256) { fprintf(stderr, "qjs_harness: too many items\n"); return 1; }

    Harness h;
    h.out = out_path ? fopen(out_path, "w") : stdout;
    if (!h.out) { perror(out_path); return 1; }

    JSRuntime *rt = JS_NewRuntime();
    if (!rt) { fprintf(stderr, "qjs_harness: JS_NewRuntime failed\n"); return 1; }
    JS_SetMemoryLimit(rt, 64 * 1024 * 1024);
    JS_SetMaxStackSize(rt, 512 * 1024);
    JSContext *ctx = JS_NewContext(rt);
    if (!ctx) { fprintf(stderr, "qjs_harness: JS_NewContext failed\n"); return 1; }

    JS_SetContextOpaque(ctx, &h);
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "sendMessage",
                      JS_NewCFunction(ctx, js_send_message, "sendMessage", 2));
    if (iid) JS_SetPropertyStr(ctx, global, "__IID", JS_NewString(ctx, iid));
    JS_FreeValue(ctx, global);

    int rc = 0;
    for (int i = 0; i < nitems; i++) {
        const char *src = items[i].arg;
        const char *name = "<call>";
        size_t len = 0;
        char *buf = NULL;
        if (items[i].type == ITEM_SCRIPT) {
            name = src;
            buf = read_file(src, &len);
            if (!buf) { rc = 1; goto done; }
            src = buf;
        } else {
            len = strlen(src);
        }
        JSValue result = JS_Eval(ctx, src, len, name, JS_EVAL_TYPE_GLOBAL);
        if (JS_IsException(result)) {
            JSValue exc = JS_GetException(ctx);
            const char *msg = JS_ToCString(ctx, exc);
            fprintf(stderr, "qjs_harness: exception in %s: %s\n", name,
                    msg ? msg : "unknown exception");
            if (msg) JS_FreeCString(ctx, msg);
            JS_FreeValue(ctx, exc);
            JS_FreeValue(ctx, result);
            rc = 1;
            goto done;
        }
        JS_FreeValue(ctx, result);
        free(buf);
        buf = NULL;
        // Drain pending jobs (promises). Never pass a NULL pctx pointer.
        JSContext *pctx = NULL;
        while (JS_ExecutePendingJob(rt, &pctx) > 0) { /* job executed */ }
        fflush(h.out);
    }

done:
    if (h.out != stdout) fclose(h.out);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return rc;
}
