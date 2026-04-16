const std = @import("std");
const htx = @import("presto_htx");

fn renderWith(a: std.mem.Allocator, engine: *htx.Engine, source: []const u8, data_json: []const u8) ![]u8 {
    var parsed = try std.json.parseFromSlice(std.json.Value, a, data_json, .{});
    defer parsed.deinit();
    return engine.render(source, parsed.value, .{ .template_path = "/index.htx" });
}

test "1. Home page renders with layout" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try templates.put("_layout.htx", "<!DOCTYPE html><html><body>__content__</body></html>");
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<h1>Hello</h1>", "{}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<!DOCTYPE html><html><body><h1>Hello</h1></body></html>", out);
}

test "2. 404 for missing route" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const m = try engine.resolveRoute("/missing");
    try std.testing.expect(m == null);
}

test "3. Dynamic [slug] resolves with params" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try templates.put("/blog/[slug].htx", "<p>x</p>");
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    var m = (try engine.resolveRoute("/blog/hello")) orelse return error.TestUnexpectedResult;
    defer m.params.deinit();
    try std.testing.expectEqualStrings("/blog/[slug].htx", m.template_path);
    try std.testing.expectEqualStrings("hello", m.params.get("slug").?);
}

test "4. Include expands partial" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try templates.put("/partials/nav.htx", "<nav>Home | About</nav>");
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<htx:include src=\"/partials/nav.htx\" />\n<p>Content</p>", "{}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<nav>Home | About</nav>\n<p>Content</p>", out);
}

test "5. Component renders with props + slot" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try templates.put("components/card.htx", "<htx:props>\ntitle = \"Default\"\n</htx:props>\n<div class=\"card\"><h3>{{ title }}</h3><htx:slot /></div>");
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<htx:component src=\"components/card.htx\" title=\"Hello\"><p>Slot</p></htx:component>";
    const out = try renderWith(a, &engine, src, "{}");
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "<h3>Hello</h3>") != null);
    try std.testing.expect(std.mem.indexOf(u8, out, "<p>Slot</p>") != null);
}

test "6. htx:v resolves pipes and escapes" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<p><htx:v>content | uppercase</htx:v></p>";
    const out = try renderWith(a, &engine, src, "{\"content\":\"<x>\"}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<p>&lt;X&gt;</p>", out);
}

test "7. htx:v raw outputs unescaped" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<div><htx:v raw>html</htx:v></div>", "{\"html\":\"<b>bold</b>\"}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<div><b>bold</b></div>", out);
}

test "8. Script blocks untouched by expression engine" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<p><htx:v>name</htx:v></p><script>var x = \"{{ safe }}\";</script>";
    const out = try renderWith(a, &engine, src, "{\"name\":\"Test\"}");
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "{{ safe }}") != null);
}

test "9. htx:raw blocks untouched" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<htx:raw><htx:v>not.evaluated</htx:v></htx:raw>", "{}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<htx:v>not.evaluated</htx:v>", out);
}

test "10. htx:data + htx:each renders records" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<htx:data type=\"post\" where=\"status = 'published'\" order=\"id desc\" limit=\"2\" as=\"posts\" />" ++
        "<htx:each items=\"posts\" as=\"post\"><li><htx:v>post.title</htx:v></li></htx:each>";
    const data =
        "{\"$data\":{\"post\":[{\"id\":1,\"title\":\"A\",\"status\":\"published\"},{\"id\":2,\"title\":\"B\",\"status\":\"draft\"},{\"id\":3,\"title\":\"C\",\"status\":\"published\"}]}}";
    const out = try renderWith(a, &engine, src, data);
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "<li>C</li>") != null);
    try std.testing.expect(std.mem.indexOf(u8, out, "<li>A</li>") != null);
}

test "11. htx:if true and false" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<htx:if test=\"user\"><p>Hello</p></htx:if><htx:else><p>Sign in</p></htx:else>";
    const t = try renderWith(a, &engine, src, "{\"user\":{\"name\":\"J\"}}");
    defer a.free(t);
    const f = try renderWith(a, &engine, src, "{\"user\":null}");
    defer a.free(f);
    try std.testing.expect(std.mem.indexOf(u8, t, "Hello") != null);
    try std.testing.expect(std.mem.indexOf(u8, f, "Sign in") != null);
}

test "12. htx:empty renders for empty collection" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<htx:each items=\"items\" as=\"item\"><li>x</li><htx:empty><p>No items.</p></htx:each>";
    const out = try renderWith(a, &engine, src, "{\"items\":[]}");
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "No items.") != null);
}

test "13. htx:grant materializes signed token" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<htx:grant type=\"channel\" module=\"chat\" as=\"tok\" /><p><htx:v>tok</htx:v></p>";
    const out = try renderWith(a, &engine, src, "{}");
    defer a.free(out);
    try std.testing.expect(std.mem.indexOfScalar(u8, out, '.') != null);
}

test "14. htx:auth hides unauthenticated" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const src = "<htx:auth><p>Logged in</p></htx:auth><htx:unauth><p>Please sign in</p></htx:unauth>";
    const out = try renderWith(a, &engine, src, "{\"auth\":{\"user\":null}}");
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "Please sign in") != null);
}

test "15. htx:layout none = no wrapping" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try templates.put("_layout.htx", "<html><body>__content__</body></html>");
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<htx:layout none /><h1>Raw</h1>", "{}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<h1>Raw</h1>", out);
}

test "16. htx:layout src = explicit layout" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try templates.put("/layouts/alt.htx", "<section>__content__</section>");
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<htx:layout src=\"/layouts/alt.htx\" /><h1>X</h1>", "{}");
    defer a.free(out);
    try std.testing.expectEqualStrings("<section><h1>X</h1></section>", out);
}

test "17. auth role allows authenticated admin" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const out = try renderWith(a, &engine, "<htx:auth role=\"admin\"><p>Admin panel</p></htx:auth>", "{\"auth\":{\"user\":{\"role\":\"admin\"}}}");
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "Admin panel") != null);
}

test "18. Channel API 200 with valid token" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    try engine.registerChannelModule("chat");
    const token = try engine.issueChannelToken("chat", "u1", 120);
    const status = try engine.handleChannelApi("/api/channel/chat/room", token);
    try std.testing.expectEqual(@as(u16, 200), status);
}

test "19. Channel API 401 with invalid token" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    try engine.registerChannelModule("chat");
    const status = try engine.handleChannelApi("/api/channel/chat/room", "bad.token");
    try std.testing.expectEqual(@as(u16, 401), status);
}

test "20. Channel API 403 with wrong scope" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    try engine.registerChannelModule("chat");
    const wrong = try engine.issueChannelToken("other", "u1", 120);
    const status = try engine.handleChannelApi("/api/channel/chat/room", wrong);
    try std.testing.expectEqual(@as(u16, 403), status);
}

test "21. Action token roundtrip succeeds" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const token = try engine.issueActionToken("delete", "post", "42", 3600);
    const claims = try engine.verifyActionToken(token);
    try std.testing.expectEqualStrings("delete", claims.action);
    try std.testing.expectEqualStrings("post", claims.entity_type);
    try std.testing.expectEqualStrings("42", claims.record_id);
}

test "22. Tampered action token rejected" {
    const a = std.heap.page_allocator;
    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    const token = try engine.issueActionToken("delete", "post", "42", 3600);
    var bad = try a.dupe(u8, token);
    defer a.free(bad);
    bad[0] = if (bad[0] == 'a') 'b' else 'a';
    try std.testing.expectError(error.InvalidSignature, engine.verifyActionToken(bad));
}
