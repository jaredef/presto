const std = @import("std");
const htx = @import("presto_htx");

pub fn main() !void {
    const a = std.heap.page_allocator;
    const stdout = std.fs.File.stdout();

    var templates = htx.TemplateStore.init(a);
    defer templates.deinit();
    var engine = htx.Engine.init(a, &templates);
    defer engine.deinit();
    engine.withSecret("presto-dev-secret");

    var args = try std.process.argsWithAllocator(a);
    defer args.deinit();

    _ = args.next(); // binary
    const cmd = args.next() orelse return usage();

    if (std.mem.eql(u8, cmd, "channel")) {
        const module = args.next() orelse return usage();
        const sub = args.next() orelse "cli-user";
        const ttl = parseTtl(args.next(), 120);
        const token = try engine.issueChannelToken(module, sub, ttl);
        try stdout.writeAll(token);
        try stdout.writeAll("\n");
        return;
    }

    if (std.mem.eql(u8, cmd, "action")) {
        const action = args.next() orelse return usage();
        const entity_type = args.next() orelse return usage();
        const record_id = args.next() orelse return usage();
        const ttl = parseTtl(args.next(), 3600);
        const token = try engine.issueActionToken(action, entity_type, record_id, ttl);
        try stdout.writeAll(token);
        try stdout.writeAll("\n");
        return;
    }

    if (std.mem.eql(u8, cmd, "asset")) {
        const path = args.next() orelse return usage();
        const ttl = parseTtl(args.next(), 3600);
        const url = try engine.issueSignedUrl(path, ttl);
        try stdout.writeAll(url);
        try stdout.writeAll("\n");
        return;
    }

    return usage();
}

fn parseTtl(maybe: ?[]const u8, fallback: i64) i64 {
    if (maybe) |v| return std.fmt.parseInt(i64, v, 10) catch fallback;
    return fallback;
}

fn usage() !void {
    const stderr = std.fs.File.stderr();
    try stderr.writeAll(
        "usage:\n" ++
            "  presto-token channel <module> [sub] [ttl_seconds]\n" ++
            "  presto-token action <action> <type> <record_id> [ttl_seconds]\n" ++
            "  presto-token asset <path> [ttl_seconds]\n",
    );
    return error.InvalidArguments;
}
