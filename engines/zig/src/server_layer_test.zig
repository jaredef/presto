const std = @import("std");
const srv = @import("server_layer.zig");

fn mkResolver(a: std.mem.Allocator, templates: *std.StringHashMap([]const u8)) srv.BootstrapResolver {
    var r = srv.BootstrapResolver.init(a, templates);
    r.withSecret("server-test-secret");
    return r;
}

test "1 seed parses without error" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var g = try r.resolve("<srv:manifest module=\"m\" trust=\"restricted\" />", "zig");
    defer g.deinit();
    try std.testing.expect(g.source.len > 0);
}

test "2 manifests enforced restricted drops undeclared" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);

    var m = try srv.Manifest.init(a, "m", .restricted);
    defer m.deinit(a);
    try m.context_providers.put("ok_ctx", {});
    try m.middleware.put("ok_mw", {});

    const attempted: srv.AttemptedRegistrations = .{
        .context_providers = &.{ "ok_ctx", "no_ctx" },
        .middleware = &.{ "ok_mw", "no_mw" },
        .channel_handlers = &.{ "no_chan" },
    };
    var enforced = try r.enforceRegistrations(&m, attempted);
    defer enforced.deinit();
    try std.testing.expectEqual(@as(usize, 1), enforced.context_providers.items.len);
    try std.testing.expectEqual(@as(usize, 1), enforced.middleware.items.len);
    try std.testing.expectEqual(@as(usize, 0), enforced.channel_handlers.items.len);
}

test "3 bilateral boundary no srv artifacts in graph" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var g = try r.resolve("<srv:manifest module=\"m\" trust=\"restricted\" /><srv:auth><p>x</p></srv:auth>", "zig");
    defer g.deinit();
    try std.testing.expect(std.mem.indexOf(u8, g.source, "srv:") == null);
}

test "4 pipeline stages ordered" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var g = try r.resolve("<srv:manifest module=\"m\" trust=\"restricted\" />", "zig");
    defer g.deinit();
    const s1 = std.mem.indexOf(u8, g.stage_trace, "1:seed-parse").?;
    const s14 = std.mem.indexOf(u8, g.stage_trace, "14:final-emission").?;
    try std.testing.expect(s1 < s14);
}

test "5 graph signature verifies" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var g = try r.resolve("<srv:manifest module=\"m\" trust=\"restricted\" />", "zig");
    defer g.deinit();
    try std.testing.expect(g.verifySignature("server-test-secret"));
}

test "6 self authorization token roundtrip" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    const t = try r.issueCapabilityToken("graph:emit", 120);
    const c = try r.verifyCapabilityToken(t);
    try std.testing.expectEqualStrings("graph:emit", c.scope);
}

test "7 tampered graph rejected" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var g = try r.resolve("<srv:manifest module=\"m\" trust=\"restricted\" />", "zig");
    defer g.deinit();
    const old_sig = g.signature;
    const bad_sig = try a.dupe(u8, old_sig);
    bad_sig[0] = if (bad_sig[0] == 'a') 'b' else 'a';
    a.free(old_sig);
    g.signature = bad_sig;
    try std.testing.expect(!g.verifySignature("server-test-secret"));
}

test "8 progressive layers respected" {
    const a = std.heap.page_allocator;
    var m = try srv.Manifest.init(a, "m", .restricted);
    defer m.deinit(a);
    m.max_layer = 2;
    try std.testing.expect(srv.layerAllowed(&m, 1));
    try std.testing.expect(!srv.layerAllowed(&m, 3));
}

test "9 include and component recursion works" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    try templates.put("/inc.srv", "<p>inc</p>");
    try templates.put("/card.srv", "<srv:props>\ntitle = \"D\"\n</srv:props><div>{{ title }}<srv:slot /></div>");
    var r = mkResolver(a, &templates);
    const seed =
        "<srv:manifest module=\"m\" trust=\"restricted\" />" ++
        "<srv:include src=\"/inc.srv\" />" ++
        "<srv:component src=\"/card.srv\" title=\"Hi\"><span>slot</span></srv:component>";
    var g = try r.resolve(seed, "zig");
    defer g.deinit();
    try std.testing.expect(std.mem.indexOf(u8, g.source, "inc") != null);
    try std.testing.expect(std.mem.indexOf(u8, g.source, "Hi") != null);
    try std.testing.expect(std.mem.indexOf(u8, g.source, "slot") != null);
}

test "10 context providers injected by manifest rules" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var m = try srv.Manifest.init(a, "m", .first_party);
    defer m.deinit(a);
    const attempted: srv.AttemptedRegistrations = .{
        .context_providers = &.{ "ctxA", "ctxB" },
    };
    var enforced = try r.enforceRegistrations(&m, attempted);
    defer enforced.deinit();
    try std.testing.expectEqual(@as(usize, 2), enforced.context_providers.items.len);
}

test "11 graph emits target language source" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    var g = try r.resolve("<srv:manifest module=\"m\" trust=\"restricted\" />", "rust");
    defer g.deinit();
    try std.testing.expect(std.mem.indexOf(u8, g.emit(), "target=rust") != null);
}

test "12 emitted graph preserves PRESTO seed payload area" {
    const a = std.heap.page_allocator;
    var templates = std.StringHashMap([]const u8).init(a);
    defer templates.deinit();
    var r = mkResolver(a, &templates);
    const seed =
        "<srv:manifest module=\"m\" trust=\"restricted\" />\n" ++
        "<presto-seed><htx:v>name</htx:v></presto-seed>";
    var g = try r.resolve(seed, "zig");
    defer g.deinit();
    try std.testing.expect(std.mem.indexOf(u8, g.source, "<htx:v>name</htx:v>") != null);
}
