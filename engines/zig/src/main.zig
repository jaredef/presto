const std = @import("std");
const htx = @import("presto_htx");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var templates = htx.TemplateStore.init(allocator);
    defer templates.deinit();

    // Minimal demo layout and page.
    try templates.put("_layout.htx", "<!DOCTYPE html><html><body>__content__</body></html>");
    const source = "<h1><htx:v>title | uppercase</htx:v></h1>";
    const json_src = "{\"title\":\"presto\"}";

    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, json_src, .{});
    defer parsed.deinit();

    var engine = htx.Engine.init(allocator, &templates);
    defer engine.deinit();
    const out = try engine.render(source, parsed.value, .{ .template_path = "index.htx" });
    defer allocator.free(out);

    std.debug.print("{s}\n", .{out});
}
