const std = @import("std");
const htx = @import("presto_htx");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const a = gpa.allocator();

    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    try loadTemplatesFromDisk(a, &templates, "templates");

    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    engine.withSecret("presto-dev-secret");
    try engine.registerChannelModule("chat");

    const addr = try std.net.Address.parseIp4("127.0.0.1", 8787);
    var server = try addr.listen(.{ .reuse_address = true });
    defer server.deinit();

    std.debug.print("presto server listening on http://127.0.0.1:8787\n", .{});

    while (true) {
        const conn = try server.accept();
        handleConnection(a, &engine, &templates, conn) catch |err| {
            std.debug.print("connection error: {s}\n", .{@errorName(err)});
        };
    }
}

fn handleConnection(a: std.mem.Allocator, engine: *htx.Engine, templates: *htx.TemplateStore, conn: std.net.Server.Connection) !void {
    defer conn.stream.close();

    var send_buffer: [4096]u8 = undefined;
    var recv_buffer: [4096]u8 = undefined;
    var connection_reader = conn.stream.reader(&recv_buffer);
    var connection_writer = conn.stream.writer(&send_buffer);
    var http_server: std.http.Server = .init(connection_reader.interface(), &connection_writer.interface);

    while (true) {
        var req = http_server.receiveHead() catch |err| switch (err) {
            error.HttpConnectionClosing => return,
            else => return err,
        };
        try serveRequest(a, engine, templates, &req);
    }
}

fn serveRequest(a: std.mem.Allocator, engine: *htx.Engine, templates: *htx.TemplateStore, req: *std.http.Server.Request) !void {
    const target = req.head.target;
    const q = std.mem.indexOfScalar(u8, target, '?');
    const path = if (q) |i| target[0..i] else target;
    const query = if (q) |i| target[i + 1 ..] else "";

    if (std.mem.eql(u8, path, "/health")) {
        try req.respond("ok", .{
            .status = .ok,
            .keep_alive = false,
            .extra_headers = &.{.{ .name = "Content-Type", .value = "text/plain" }},
        });
        return;
    }

    if (std.mem.startsWith(u8, path, "/api/channel/")) {
        const auth = headerFromHead(req.head_buffer, "authorization") orelse "";
        const bearer = if (std.mem.startsWith(u8, auth, "Bearer ")) auth["Bearer ".len..] else "";
        const code: u16 = if (bearer.len == 0) 401 else (engine.handleChannelApi(path, bearer) catch 401);
        try req.respond(if (code == 200) "ok" else "denied", .{
            .status = @enumFromInt(code),
            .keep_alive = false,
            .extra_headers = &.{.{ .name = "Content-Type", .value = "text/plain" }},
        });
        return;
    }

    if (req.head.method == .POST and std.mem.eql(u8, path, "/api/action/execute")) {
        const token = queryParam(query, "token") orelse "";
        if (token.len == 0) {
            try req.respond("missing token", .{ .status = .bad_request, .keep_alive = false });
            return;
        }
        const claims = engine.verifyActionToken(token) catch {
            try req.respond("invalid token", .{ .status = .unauthorized, .keep_alive = false });
            return;
        };
        const body = try std.fmt.allocPrint(a, "{{\"ok\":true,\"action\":\"{s}\",\"type\":\"{s}\",\"recordId\":\"{s}\"}}", .{
            claims.action,
            claims.entity_type,
            claims.record_id,
        });
        defer a.free(body);
        try req.respond(body, .{
            .status = .ok,
            .keep_alive = false,
            .extra_headers = &.{.{ .name = "Content-Type", .value = "application/json" }},
        });
        return;
    }

    if (req.head.method == .GET) {
        var match = (try engine.resolveRoute(path)) orelse {
            try req.respond("not found", .{ .status = .not_found, .keep_alive = false });
            return;
        };
        defer freeRouteMatch(a, &match);

        const tpl = templates.get(match.template_path) orelse {
            try req.respond("not found", .{ .status = .not_found, .keep_alive = false });
            return;
        };

        const data_json =
            "{\"auth\":{\"user\":{\"name\":\"Jared\",\"role\":\"admin\"}}," ++
            "\"$data\":{\"post\":[" ++
            "{\"id\":3,\"title\":\"Third\",\"body\":\"Content 3\",\"status\":\"published\"}," ++
            "{\"id\":2,\"title\":\"Second\",\"body\":\"Content 2\",\"status\":\"published\"}," ++
            "{\"id\":1,\"title\":\"First\",\"body\":\"Content 1\",\"status\":\"published\"}]}}";

        var parsed = try std.json.parseFromSlice(std.json.Value, a, data_json, .{});
        defer parsed.deinit();

        const html = try engine.render(tpl, parsed.value, .{ .template_path = match.template_path });
        defer a.free(html);

        try req.respond(html, .{
            .status = .ok,
            .keep_alive = false,
            .extra_headers = &.{.{ .name = "Content-Type", .value = "text/html; charset=utf-8" }},
        });
        return;
    }

    try req.respond("method not allowed", .{ .status = .method_not_allowed, .keep_alive = false });
}

fn freeRouteMatch(a: std.mem.Allocator, m: *htx.RouteMatch) void {
    var it = m.params.iterator();
    while (it.next()) |e| {
        a.free(e.key_ptr.*);
        a.free(e.value_ptr.*);
    }
    m.params.deinit();
    a.free(m.template_path);
}

fn headerFromHead(head_buffer: []const u8, name: []const u8) ?[]const u8 {
    var lines = std.mem.splitSequence(u8, head_buffer, "\r\n");
    _ = lines.next(); // request line
    while (lines.next()) |line| {
        if (line.len == 0) break;
        const colon = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const k = line[0..colon];
        if (!std.ascii.eqlIgnoreCase(k, name)) continue;
        return std.mem.trim(u8, line[colon + 1 ..], " \t");
    }
    return null;
}

fn queryParam(query: []const u8, name: []const u8) ?[]const u8 {
    var parts = std.mem.splitScalar(u8, query, '&');
    while (parts.next()) |part| {
        const eq = std.mem.indexOfScalar(u8, part, '=') orelse continue;
        if (std.mem.eql(u8, part[0..eq], name)) return part[eq + 1 ..];
    }
    return null;
}

fn loadTemplatesFromDisk(a: std.mem.Allocator, templates: *htx.TemplateStore, root: []const u8) !void {
    var root_dir = try std.fs.cwd().openDir(root, .{ .iterate = true });
    defer root_dir.close();
    try walkTemplateDir(a, templates, root, "", &root_dir);
}

fn walkTemplateDir(
    a: std.mem.Allocator,
    templates: *htx.TemplateStore,
    root: []const u8,
    rel_prefix: []const u8,
    dir: *std.fs.Dir,
) !void {
    var it = dir.iterate();
    while (try it.next()) |entry| {
        if (entry.kind == .directory) {
            const next_prefix = if (rel_prefix.len == 0)
                try std.fmt.allocPrint(a, "{s}", .{entry.name})
            else
                try std.fmt.allocPrint(a, "{s}/{s}", .{ rel_prefix, entry.name });
            defer a.free(next_prefix);

            var sub = try dir.openDir(entry.name, .{ .iterate = true });
            defer sub.close();
            try walkTemplateDir(a, templates, root, next_prefix, &sub);
            continue;
        }
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.name, ".htx")) continue;

        const rel = if (rel_prefix.len == 0)
            try std.fmt.allocPrint(a, "{s}", .{entry.name})
        else
            try std.fmt.allocPrint(a, "{s}/{s}", .{ rel_prefix, entry.name });
        defer a.free(rel);

        const full = try std.fmt.allocPrint(a, "{s}/{s}", .{ root, rel });
        defer a.free(full);
        const contents = try std.fs.cwd().readFileAlloc(a, full, 1024 * 1024);

        const abs_key = try std.fmt.allocPrint(a, "/{s}", .{rel});
        const rel_key = try a.dupe(u8, rel);
        try templates.put(abs_key, contents);
        try templates.put(rel_key, contents);

        if (std.mem.eql(u8, rel, "_layout.htx")) {
            try templates.put(try a.dupe(u8, "_layout.htx"), contents);
        }
    }
}
