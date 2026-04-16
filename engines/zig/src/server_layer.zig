const std = @import("std");

pub const Trust = enum {
    first_party,
    restricted,
};

pub const Manifest = struct {
    module_name: []const u8,
    trust: Trust,
    max_layer: u8 = 0,
    context_providers: std.StringHashMap(void),
    channel_handlers: std.StringHashMap(void),
    middleware: std.StringHashMap(void),

    pub fn init(allocator: std.mem.Allocator, module_name: []const u8, trust: Trust) !Manifest {
        return .{
            .module_name = try allocator.dupe(u8, module_name),
            .trust = trust,
            .context_providers = std.StringHashMap(void).init(allocator),
            .channel_handlers = std.StringHashMap(void).init(allocator),
            .middleware = std.StringHashMap(void).init(allocator),
        };
    }

    pub fn deinit(self: *Manifest, allocator: std.mem.Allocator) void {
        allocator.free(self.module_name);
        self.context_providers.deinit();
        self.channel_handlers.deinit();
        self.middleware.deinit();
    }
};

pub const AttemptedRegistrations = struct {
    context_providers: []const []const u8 = &.{},
    channel_handlers: []const []const u8 = &.{},
    middleware: []const []const u8 = &.{},
};

pub const EnforcedRegistrations = struct {
    context_providers: std.array_list.Managed([]const u8),
    channel_handlers: std.array_list.Managed([]const u8),
    middleware: std.array_list.Managed([]const u8),

    pub fn init(allocator: std.mem.Allocator) EnforcedRegistrations {
        return .{
            .context_providers = std.array_list.Managed([]const u8).init(allocator),
            .channel_handlers = std.array_list.Managed([]const u8).init(allocator),
            .middleware = std.array_list.Managed([]const u8).init(allocator),
        };
    }

    pub fn deinit(self: *EnforcedRegistrations) void {
        self.context_providers.deinit();
        self.channel_handlers.deinit();
        self.middleware.deinit();
    }
};

pub const RuntimeGraph = struct {
    allocator: std.mem.Allocator,
    target_language: []const u8,
    source: []const u8,
    manifest_hash: []const u8,
    signature: []const u8,
    stage_trace: []const u8,

    pub fn deinit(self: *RuntimeGraph) void {
        self.allocator.free(self.target_language);
        self.allocator.free(self.source);
        self.allocator.free(self.manifest_hash);
        self.allocator.free(self.signature);
        self.allocator.free(self.stage_trace);
    }

    pub fn verifySignature(self: *const RuntimeGraph, secret: []const u8) bool {
        const expect_mac = hmacSha256(secret, self.source);
        return verifyBase64Mac(self.signature, expect_mac);
    }

    pub fn emit(self: *const RuntimeGraph) []const u8 {
        return self.source;
    }
};

pub const CapabilityClaims = struct {
    scope: []const u8,
    exp: i64,
    jti: []const u8,
};

pub const BootstrapResolver = struct {
    allocator: std.mem.Allocator,
    secret: []const u8,
    max_depth: usize = 8,
    templates: *std.StringHashMap([]const u8),

    pub fn init(allocator: std.mem.Allocator, templates: *std.StringHashMap([]const u8)) BootstrapResolver {
        return .{
            .allocator = allocator,
            .secret = "server-dev-secret",
            .templates = templates,
        };
    }

    pub fn withSecret(self: *BootstrapResolver, secret: []const u8) void {
        self.secret = secret;
    }

    pub fn resolve(self: *BootstrapResolver, seed: []const u8, target_language: []const u8) !RuntimeGraph {
        var stages = std.array_list.Managed([]const u8).init(self.allocator);
        defer stages.deinit();
        try stages.append("1:seed-parse");

        const manifests = try self.extractManifests(seed);
        defer {
            for (manifests.items) |*m| m.deinit(self.allocator);
            manifests.deinit();
        }
        try stages.append("2:manifest-validation");
        try stages.append("3:module-registration");
        try stages.append("4:context-injection");
        try stages.append("5:pre-graph-processors");

        var visited = std.StringHashMap(void).init(self.allocator);
        defer visited.deinit();
        const includes_done = try self.resolveIncludes(seed, 0, &visited);
        defer self.allocator.free(includes_done);
        try stages.append("6:include-expansion");

        const component_done = try self.resolveComponents(includes_done, 0);
        defer self.allocator.free(component_done);
        try stages.append("7:component-resolution");

        try stages.append("8:pipeline-wiring");
        try stages.append("9:grant-materialization");

        const auth_done = try self.resolveAuth(component_done);
        defer self.allocator.free(auth_done);
        try stages.append("10:auth-resolution");

        const expr_done = try self.resolveExpressions(auth_done);
        defer self.allocator.free(expr_done);
        try stages.append("11:expression-assembly");

        const stripped = try self.stripSrvDirectives(expr_done);
        defer self.allocator.free(stripped);

        const manifest_summary = try self.manifestSummary(manifests.items);
        defer self.allocator.free(manifest_summary);
        const manifest_mac = hmacSha256(self.secret, manifest_summary);
        const manifest_hash = try b64UrlEncodeAlloc(self.allocator, manifest_mac[0..]);

        const graph_source = try std.fmt.allocPrint(
            self.allocator,
            "// SERVER-RUNTIME-GRAPH target={s}\n// manifest_hash={s}\n{s}\n",
            .{ target_language, manifest_hash, stripped },
        );
        const graph_mac = hmacSha256(self.secret, graph_source);
        const signature = try b64UrlEncodeAlloc(self.allocator, graph_mac[0..]);
        try stages.append("12:graph-signing");
        try stages.append("13:post-graph-processors");
        try stages.append("14:final-emission");

        const stage_trace = try joinLines(self.allocator, stages.items);
        return .{
            .allocator = self.allocator,
            .target_language = try self.allocator.dupe(u8, target_language),
            .source = graph_source,
            .manifest_hash = manifest_hash,
            .signature = signature,
            .stage_trace = stage_trace,
        };
    }

    pub fn enforceRegistrations(self: *BootstrapResolver, manifest: *const Manifest, attempted: AttemptedRegistrations) !EnforcedRegistrations {
        _ = self;
        var out = EnforcedRegistrations.init(manifest.context_providers.allocator);
        if (manifest.trust == .first_party) {
            try appendMany(&out.context_providers, attempted.context_providers);
            try appendMany(&out.channel_handlers, attempted.channel_handlers);
            try appendMany(&out.middleware, attempted.middleware);
            return out;
        }
        for (attempted.context_providers) |v| {
            if (manifest.context_providers.contains(v)) try out.context_providers.append(v);
        }
        for (attempted.channel_handlers) |v| {
            if (manifest.channel_handlers.contains(v)) try out.channel_handlers.append(v);
        }
        for (attempted.middleware) |v| {
            if (manifest.middleware.contains(v)) try out.middleware.append(v);
        }
        return out;
    }

    pub fn issueCapabilityToken(self: *BootstrapResolver, scope: []const u8, ttl_s: i64) ![]u8 {
        const exp = std.time.timestamp() + ttl_s;
        const payload = try std.fmt.allocPrint(self.allocator, "{{\"scope\":\"{s}\",\"exp\":{d},\"jti\":\"{d}\"}}", .{
            scope,
            exp,
            std.time.milliTimestamp(),
        });
        return self.signPayload(payload);
    }

    pub fn verifyCapabilityToken(self: *BootstrapResolver, token: []const u8) !CapabilityClaims {
        const payload = try self.verifySignedToken(token);
        const scope = extractJsonString(payload, "scope") orelse return error.InvalidToken;
        const exp = extractJsonInt(payload, "exp") orelse return error.InvalidToken;
        const jti = extractJsonString(payload, "jti") orelse return error.InvalidToken;
        if (exp <= std.time.timestamp()) return error.TokenExpired;
        return .{ .scope = scope, .exp = exp, .jti = jti };
    }

    fn signPayload(self: *BootstrapResolver, payload: []const u8) ![]u8 {
        const payload_b64 = try b64UrlEncodeAlloc(self.allocator, payload);
        const mac = hmacSha256(self.secret, payload_b64);
        const mac_b64 = try b64UrlEncodeAlloc(self.allocator, mac[0..]);
        return std.fmt.allocPrint(self.allocator, "{s}.{s}", .{ payload_b64, mac_b64 });
    }

    fn verifySignedToken(self: *BootstrapResolver, token: []const u8) ![]u8 {
        const dot = std.mem.indexOfScalar(u8, token, '.') orelse return error.InvalidToken;
        const payload_b64 = token[0..dot];
        const sig_b64 = token[dot + 1 ..];
        const expect_mac = hmacSha256(self.secret, payload_b64);
        if (!verifyBase64Mac(sig_b64, expect_mac)) return error.InvalidSignature;
        return b64UrlDecodeAlloc(self.allocator, payload_b64);
    }

    fn extractManifests(self: *BootstrapResolver, seed: []const u8) !std.array_list.Managed(Manifest) {
        var out = std.array_list.Managed(Manifest).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, seed, idx, "<srv:manifest")) |start| {
            const end = std.mem.indexOfPos(u8, seed, start, "/>") orelse break;
            const tag = seed[start .. end + 2];
            const module_name = getAttr(tag, "module") orelse "unknown";
            const trust_raw = getAttr(tag, "trust") orelse "restricted";
            var manifest = try Manifest.init(self.allocator, module_name, if (std.mem.eql(u8, trust_raw, "first-party")) .first_party else .restricted);
            manifest.max_layer = @intCast(std.fmt.parseInt(u8, getAttr(tag, "layer") orelse "0", 10) catch 0);
            try parseCsvSet(self.allocator, &manifest.context_providers, getAttr(tag, "context_providers") orelse "");
            try parseCsvSet(self.allocator, &manifest.channel_handlers, getAttr(tag, "channel_handlers") orelse "");
            try parseCsvSet(self.allocator, &manifest.middleware, getAttr(tag, "middleware") orelse "");
            try out.append(manifest);
            idx = end + 2;
        }
        return out;
    }

    fn resolveIncludes(self: *BootstrapResolver, source: []const u8, depth: usize, visited: *std.StringHashMap(void)) ![]u8 {
        if (depth > self.max_depth) return error.MaxDepthExceeded;
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<srv:include")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "/>") orelse break;
            const tag = source[start .. end + 2];
            const src = getAttr(tag, "src") orelse "";
            if (std.mem.indexOf(u8, src, "..") != null) {
                try out.appendSlice("<!-- SERVER:path traversal rejected -->");
                idx = end + 2;
                continue;
            }
            if (visited.contains(src)) {
                try out.appendSlice("<!-- SERVER:circular include -->");
                idx = end + 2;
                continue;
            }
            const tpl = self.templates.get(src) orelse "<!-- SERVER:include not found -->";
            try visited.put(src, {});
            const expanded = self.resolveIncludes(tpl, depth + 1, visited) catch |err| blk: {
                _ = visited.remove(src);
                if (err == error.MaxDepthExceeded) break :blk try self.allocator.dupe(u8, "<!-- SERVER:max depth exceeded -->");
                return err;
            };
            _ = visited.remove(src);
            defer self.allocator.free(expanded);
            try out.appendSlice(expanded);
            idx = end + 2;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveComponents(self: *BootstrapResolver, source: []const u8, depth: usize) ![]u8 {
        if (depth > self.max_depth) return error.MaxDepthExceeded;
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<srv:component")) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const open_tag = source[start .. open_end + 1];
            const self_closing = open_tag.len >= 2 and open_tag[open_tag.len - 2] == '/';
            var inner: []const u8 = "";
            var close_end = open_end + 1;
            if (!self_closing) {
                const close_start = std.mem.indexOfPos(u8, source, open_end + 1, "</srv:component>") orelse break;
                inner = source[open_end + 1 .. close_start];
                close_end = close_start + "</srv:component>".len;
            }
            const src = getAttr(open_tag, "src") orelse "";
            var component_src = self.templates.get(src) orelse "<!-- SERVER:component not found -->";
            component_src = try self.applyComponentProps(component_src, open_tag);
            const slotted = try replaceAllAlloc(self.allocator, component_src, "<srv:slot />", inner);
            defer self.allocator.free(slotted);
            const rec = try self.resolveComponents(slotted, depth + 1);
            defer self.allocator.free(rec);
            try out.appendSlice(rec);
            idx = close_end;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn applyComponentProps(self: *BootstrapResolver, component_src: []const u8, open_tag: []const u8) ![]u8 {
        var props_block: []const u8 = "";
        var without_props = try self.allocator.dupe(u8, component_src);
        errdefer self.allocator.free(without_props);
        if (std.mem.indexOf(u8, component_src, "<srv:props>")) |s| {
            if (std.mem.indexOfPos(u8, component_src, s, "</srv:props>")) |e| {
                props_block = component_src[s + "<srv:props>".len .. e];
                self.allocator.free(without_props);
                without_props = try concat3(self.allocator, component_src[0..s], "", component_src[e + "</srv:props>".len ..]);
            }
        }
        var prop_map = std.StringHashMap([]const u8).init(self.allocator);
        defer prop_map.deinit();
        try parseProps(props_block, &prop_map);

        var attrs = std.mem.splitScalar(u8, open_tag, ' ');
        while (attrs.next()) |chunk| {
            if (!std.mem.containsAtLeast(u8, chunk, 1, "=")) continue;
            const eq = std.mem.indexOfScalar(u8, chunk, '=') orelse continue;
            const key = std.mem.trim(u8, chunk[0..eq], " \t\r\n<>");
            if (std.mem.eql(u8, key, "src")) continue;
            const raw = std.mem.trim(u8, chunk[eq + 1 ..], " \t\r\n\"'>");
            try prop_map.put(key, raw);
        }
        var out = try self.allocator.dupe(u8, without_props);
        self.allocator.free(without_props);
        var it = prop_map.iterator();
        while (it.next()) |entry| {
            const marker = try std.fmt.allocPrint(self.allocator, "{{{{ {s} }}}}", .{entry.key_ptr.*});
            defer self.allocator.free(marker);
            const next = try replaceAllAlloc(self.allocator, out, marker, entry.value_ptr.*);
            self.allocator.free(out);
            out = next;
        }
        return out;
    }

    fn resolveAuth(self: *BootstrapResolver, source: []const u8) ![]u8 {
        const a = try replaceAllAlloc(self.allocator, source, "<srv:auth>", "");
        defer self.allocator.free(a);
        const b = try replaceAllAlloc(self.allocator, a, "</srv:auth>", "");
        defer self.allocator.free(b);
        const c = try replaceAllAlloc(self.allocator, b, "<srv:unauth>", "");
        defer self.allocator.free(c);
        return replaceAllAlloc(self.allocator, c, "</srv:unauth>", "");
    }

    fn resolveExpressions(self: *BootstrapResolver, source: []const u8) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "{srv:")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "}") orelse break;
            const key = std.mem.trim(u8, source[start + 5 .. end], " \t\r\n");
            if (std.mem.eql(u8, key, "target")) try out.appendSlice("{{target}}") else try out.appendSlice("");
            idx = end + 1;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn stripSrvDirectives(self: *BootstrapResolver, source: []const u8) ![]u8 {
        var blocks = std.array_list.Managed(ProtectedBlock).init(self.allocator);
        defer {
            for (blocks.items) |b| {
                self.allocator.free(b.marker);
                self.allocator.free(b.content);
            }
            blocks.deinit();
        }
        const protected = try self.protectRaw(source, &blocks);
        defer self.allocator.free(protected);

        var out = std.array_list.Managed(u8).init(self.allocator);
        var i: usize = 0;
        while (i < protected.len) {
            if (protected[i] == '<' and i + 5 < protected.len and std.mem.startsWith(u8, protected[i..], "<srv:")) {
                const end = std.mem.indexOfPos(u8, protected, i, ">") orelse break;
                i = end + 1;
                continue;
            }
            if (protected[i] == '<' and i + 6 < protected.len and std.mem.startsWith(u8, protected[i..], "</srv:")) {
                const end = std.mem.indexOfPos(u8, protected, i, ">") orelse break;
                i = end + 1;
                continue;
            }
            try out.append(protected[i]);
            i += 1;
        }
        const stripped = try out.toOwnedSlice();
        defer self.allocator.free(stripped);
        return self.restoreProtected(stripped, blocks.items);
    }

    const ProtectedBlock = struct {
        marker: []const u8,
        content: []const u8,
    };

    fn protectRaw(self: *BootstrapResolver, source: []const u8, blocks: *std.array_list.Managed(ProtectedBlock)) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<srv:raw>")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "</srv:raw>") orelse break;
            const body = source[start + "<srv:raw>".len .. end];
            const marker = try std.fmt.allocPrint(self.allocator, "__SERVER_RAW_{d}__", .{blocks.items.len});
            try blocks.append(.{ .marker = marker, .content = try self.allocator.dupe(u8, body) });
            try out.appendSlice(marker);
            idx = end + "</srv:raw>".len;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn restoreProtected(self: *BootstrapResolver, source: []const u8, blocks: []const ProtectedBlock) ![]u8 {
        var out = try self.allocator.dupe(u8, source);
        for (blocks) |b| {
            const next = try replaceAllAlloc(self.allocator, out, b.marker, b.content);
            self.allocator.free(out);
            out = next;
        }
        return out;
    }

    fn manifestSummary(self: *BootstrapResolver, manifests: []const Manifest) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        for (manifests) |m| {
            try out.appendSlice(m.module_name);
            try out.append('|');
            try out.appendSlice(if (m.trust == .first_party) "first-party" else "restricted");
            try out.append('|');
            try out.appendSlice(try std.fmt.allocPrint(self.allocator, "{d}", .{m.max_layer}));
            try out.append('\n');
        }
        return out.toOwnedSlice();
    }
};

pub fn layerAllowed(manifest: *const Manifest, requested_layer: u8) bool {
    return requested_layer <= manifest.max_layer;
}

fn appendMany(list: *std.array_list.Managed([]const u8), values: []const []const u8) !void {
    for (values) |v| try list.append(v);
}

fn parseCsvSet(allocator: std.mem.Allocator, map: *std.StringHashMap(void), csv: []const u8) !void {
    var it = std.mem.splitScalar(u8, csv, ',');
    while (it.next()) |raw| {
        const t = std.mem.trim(u8, raw, " \t\r\n");
        if (t.len == 0) continue;
        try map.put(try allocator.dupe(u8, t), {});
    }
}

fn parseProps(block: []const u8, map: *std.StringHashMap([]const u8)) !void {
    var lines = std.mem.splitScalar(u8, block, '\n');
    while (lines.next()) |line_raw| {
        const line = std.mem.trim(u8, line_raw, " \t\r\n");
        if (line.len == 0) continue;
        const eq = std.mem.indexOfScalar(u8, line, '=') orelse continue;
        const key = std.mem.trim(u8, line[0..eq], " \t");
        const value = std.mem.trim(u8, line[eq + 1 ..], " \t\"");
        try map.put(key, value);
    }
}

fn getAttr(tag: []const u8, name: []const u8) ?[]const u8 {
    var pat_buf: [128]u8 = undefined;
    const pat = std.fmt.bufPrint(&pat_buf, "{s}=\"", .{name}) catch return null;
    const s = std.mem.indexOf(u8, tag, pat) orelse return null;
    const start = s + pat.len;
    const end = std.mem.indexOfPos(u8, tag, start, "\"") orelse return null;
    return tag[start..end];
}

fn joinLines(allocator: std.mem.Allocator, lines: []const []const u8) ![]u8 {
    var out = std.array_list.Managed(u8).init(allocator);
    for (lines) |line| {
        try out.appendSlice(line);
        try out.append('\n');
    }
    return out.toOwnedSlice();
}

fn replaceAllAlloc(allocator: std.mem.Allocator, haystack: []const u8, needle: []const u8, replacement: []const u8) ![]u8 {
    if (needle.len == 0) return allocator.dupe(u8, haystack);
    var out = std.array_list.Managed(u8).init(allocator);
    var idx: usize = 0;
    while (std.mem.indexOfPos(u8, haystack, idx, needle)) |pos| {
        try out.appendSlice(haystack[idx..pos]);
        try out.appendSlice(replacement);
        idx = pos + needle.len;
    }
    try out.appendSlice(haystack[idx..]);
    return out.toOwnedSlice();
}

fn concat3(allocator: std.mem.Allocator, a: []const u8, b: []const u8, c: []const u8) ![]u8 {
    var out = std.array_list.Managed(u8).init(allocator);
    try out.appendSlice(a);
    try out.appendSlice(b);
    try out.appendSlice(c);
    return out.toOwnedSlice();
}

fn b64UrlEncodeAlloc(allocator: std.mem.Allocator, in: []const u8) ![]u8 {
    const out_len = std.base64.url_safe_no_pad.Encoder.calcSize(in.len);
    const out = try allocator.alloc(u8, out_len);
    _ = std.base64.url_safe_no_pad.Encoder.encode(out, in);
    return out;
}

fn b64UrlDecodeAlloc(allocator: std.mem.Allocator, in: []const u8) ![]u8 {
    const len = try std.base64.url_safe_no_pad.Decoder.calcSizeForSlice(in);
    const out = try allocator.alloc(u8, len);
    try std.base64.url_safe_no_pad.Decoder.decode(out, in);
    return out;
}

fn hmacSha256(key: []const u8, msg: []const u8) [32]u8 {
    var out: [std.crypto.auth.hmac.sha2.HmacSha256.mac_length]u8 = undefined;
    std.crypto.auth.hmac.sha2.HmacSha256.create(out[0..], msg, key);
    return out;
}

fn verifyBase64Mac(sig_b64: []const u8, expect: [32]u8) bool {
    const decoded_len = std.base64.url_safe_no_pad.Decoder.calcSizeForSlice(sig_b64) catch return false;
    if (decoded_len != expect.len) return false;
    var actual: [32]u8 = undefined;
    std.base64.url_safe_no_pad.Decoder.decode(actual[0..], sig_b64) catch return false;
    return std.crypto.timing_safe.eql([32]u8, actual, expect);
}

fn extractJsonString(json: []const u8, key: []const u8) ?[]const u8 {
    var pat_buf: [96]u8 = undefined;
    const pat = std.fmt.bufPrint(&pat_buf, "\"{s}\":\"", .{key}) catch return null;
    const s = std.mem.indexOf(u8, json, pat) orelse return null;
    const start = s + pat.len;
    const end = std.mem.indexOfPos(u8, json, start, "\"") orelse return null;
    return json[start..end];
}

fn extractJsonInt(json: []const u8, key: []const u8) ?i64 {
    var pat_buf: [96]u8 = undefined;
    const pat = std.fmt.bufPrint(&pat_buf, "\"{s}\":", .{key}) catch return null;
    const s = std.mem.indexOf(u8, json, pat) orelse return null;
    const start = s + pat.len;
    var end = start;
    while (end < json.len and (json[end] == '-' or (json[end] >= '0' and json[end] <= '9'))) : (end += 1) {}
    return std.fmt.parseInt(i64, json[start..end], 10) catch null;
}
