const std = @import("std");

pub const TemplateStore = std.StringHashMap([]const u8);

pub const RenderOptions = struct {
    template_path: ?[]const u8 = null,
    apply_layout: bool = true,
};

pub const ActionClaims = struct {
    action: []const u8,
    entity_type: []const u8,
    record_id: []const u8,
    exp: i64,
};

pub const ChannelClaims = struct {
    sub: []const u8,
    scope: []const u8,
    exp: i64,
    jti: []const u8,
};

pub const RouteMatch = struct {
    template_path: []const u8,
    params: std.StringHashMap([]const u8),
};

const LayoutChoice = struct {
    none: bool = false,
    src: ?[]u8 = null,
};

const Runtime = struct {
    allocator: std.mem.Allocator,
    root: std.json.Value,
    locals: std.StringHashMap(std.json.Value),
    script_collector: std.array_list.Managed([]const u8),
    include_stack: std.StringHashMap(void),
    current_path: ?[]const u8,

    fn init(allocator: std.mem.Allocator, root: std.json.Value, current_path: ?[]const u8) Runtime {
        return .{
            .allocator = allocator,
            .root = root,
            .locals = std.StringHashMap(std.json.Value).init(allocator),
            .script_collector = std.array_list.Managed([]const u8).init(allocator),
            .include_stack = std.StringHashMap(void).init(allocator),
            .current_path = current_path,
        };
    }

    fn deinit(self: *Runtime) void {
        self.locals.deinit();
        self.script_collector.deinit();
        self.include_stack.deinit();
    }
};

pub const Engine = struct {
    allocator: std.mem.Allocator,
    templates: *TemplateStore,
    secret: []const u8,
    max_depth: usize = 10,
    channel_handlers: std.StringHashMap(void),

    pub fn init(allocator: std.mem.Allocator, templates: *TemplateStore) Engine {
        return .{
            .allocator = allocator,
            .templates = templates,
            .secret = "presto-dev-secret",
            .channel_handlers = std.StringHashMap(void).init(allocator),
        };
    }

    pub fn deinit(self: *Engine) void {
        self.channel_handlers.deinit();
    }

    pub fn withSecret(self: *Engine, secret: []const u8) void {
        self.secret = secret;
    }

    pub fn registerChannelModule(self: *Engine, module: []const u8) !void {
        try self.channel_handlers.put(module, {});
    }

    pub fn resolveRoute(self: *Engine, path: []const u8) !?RouteMatch {
        const normalized = try normalizeRoutePath(self.allocator, path);
        defer self.allocator.free(normalized);

        const static_path = try std.fmt.allocPrint(self.allocator, "{s}.htx", .{normalized});
        defer self.allocator.free(static_path);
        if (self.templates.contains(static_path)) {
            return .{ .template_path = try self.allocator.dupe(u8, static_path), .params = std.StringHashMap([]const u8).init(self.allocator) };
        }

        const index_path = try std.fmt.allocPrint(self.allocator, "{s}/index.htx", .{normalized});
        defer self.allocator.free(index_path);
        if (self.templates.contains(index_path)) {
            return .{ .template_path = try self.allocator.dupe(u8, index_path), .params = std.StringHashMap([]const u8).init(self.allocator) };
        }

        var it = self.templates.iterator();
        while (it.next()) |entry| {
            const candidate = entry.key_ptr.*;
            if (!std.mem.endsWith(u8, candidate, ".htx")) continue;
            var params = std.StringHashMap([]const u8).init(self.allocator);
            if (matchDynamicPath(self.allocator, candidate, normalized, &params)) {
                return .{ .template_path = try self.allocator.dupe(u8, candidate), .params = params };
            }
            params.deinit();
        }
        return null;
    }

    pub fn render(self: *Engine, source: []const u8, root_ctx: std.json.Value, opts: RenderOptions) anyerror![]u8 {
        var runtime = Runtime.init(self.allocator, root_ctx, opts.template_path);
        defer runtime.deinit();

        const rendered = try self.resolvePasses(source, &runtime, 0, opts.template_path);
        defer self.allocator.free(rendered);

        const layout_choice = try self.extractLayoutDirective(rendered);
        defer if (layout_choice.src) |src| self.allocator.free(src);

        const without_layout = try self.removeLayoutDirective(rendered);
        defer self.allocator.free(without_layout);

        const stripped = try self.stripHtxDirectives(without_layout);
        defer self.allocator.free(stripped);

        const wrapped = if (opts.apply_layout)
            try self.applyLayout(stripped, opts.template_path, layout_choice)
        else
            try self.allocator.dupe(u8, stripped);
        defer self.allocator.free(wrapped);

        const post_layout = try self.resolvePostLayout(wrapped, &runtime, opts.template_path);
        defer self.allocator.free(post_layout);

        const final_eval = try self.evalExpressions(post_layout, &runtime);
        defer self.allocator.free(final_eval);

        const with_scripts = try self.injectScripts(final_eval, runtime.script_collector.items);
        defer self.allocator.free(with_scripts);

        return try self.unwrapRaw(with_scripts);
    }

    fn resolvePasses(self: *Engine, source: []const u8, runtime: *Runtime, depth: usize, current_path: ?[]const u8) anyerror![]u8 {
        if (depth > self.max_depth) return error.MaxDepthExceeded;

        var out = try self.allocator.dupe(u8, source);

        var stage = try self.resolveIncludes(out, runtime, depth, current_path);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveComponents(out, runtime, depth, current_path);
        self.allocator.free(out);
        out = stage;

        stage = try self.extractHtxScript(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveLet(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveData(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveGrants(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveActions(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveAuth(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.resolveControlFlow(out, runtime);
        self.allocator.free(out);
        out = stage;

        stage = try self.evalExpressions(out, runtime);
        self.allocator.free(out);
        return stage;
    }

    fn lookup(self: *Engine, runtime: *Runtime, expr: []const u8) ?std.json.Value {
        const trimmed = std.mem.trim(u8, expr, " \t\r\n");
        var pipe_it = std.mem.splitSequence(u8, trimmed, "|");
        const left = std.mem.trim(u8, pipe_it.next() orelse "", " \t\r\n");

        var seg_it = std.mem.splitScalar(u8, left, '.');
        const first = seg_it.next() orelse return null;

        var current: ?std.json.Value = runtime.locals.get(first) orelse blk: {
            switch (runtime.root) {
                .object => |obj| break :blk obj.get(first),
                else => break :blk null,
            }
        };
        if (current == null) return null;

        while (seg_it.next()) |seg| {
            current = switch (current.?) {
                .object => |obj| obj.get(seg),
                .array => |arr| blk: {
                    const idx = std.fmt.parseInt(usize, seg, 10) catch break :blk null;
                    if (idx >= arr.items.len) break :blk null;
                    break :blk arr.items[idx];
                },
                else => null,
            };
            if (current == null) return null;
        }
        return self.applyPipes(current.?, trimmed);
    }

    fn applyPipes(self: *Engine, value: std.json.Value, expr: []const u8) ?std.json.Value {
        _ = self;
        var it = std.mem.splitSequence(u8, expr, "|");
        _ = it.next();
        var current = value;
        while (it.next()) |pipe_raw| {
            const pipe = std.mem.trim(u8, pipe_raw, " \t\r\n");
            if (std.mem.eql(u8, pipe, "uppercase")) {
                const s = asString(current);
                var buf = std.array_list.Managed(u8).init(std.heap.page_allocator);
                defer buf.deinit();
                for (s) |c| buf.append(std.ascii.toUpper(c)) catch return null;
                current = .{ .string = buf.toOwnedSlice() catch return null };
            } else if (std.mem.eql(u8, pipe, "lowercase")) {
                const s = asString(current);
                var buf = std.array_list.Managed(u8).init(std.heap.page_allocator);
                defer buf.deinit();
                for (s) |c| buf.append(std.ascii.toLower(c)) catch return null;
                current = .{ .string = buf.toOwnedSlice() catch return null };
            } else if (std.mem.eql(u8, pipe, "capitalize")) {
                const s = asString(current);
                if (s.len == 0) continue;
                var buf = std.array_list.Managed(u8).init(std.heap.page_allocator);
                defer buf.deinit();
                buf.append(std.ascii.toUpper(s[0])) catch return null;
                if (s.len > 1) buf.appendSlice(s[1..]) catch return null;
                current = .{ .string = buf.toOwnedSlice() catch return null };
            } else if (std.mem.eql(u8, pipe, "trim")) {
                current = .{ .string = std.mem.trim(u8, asString(current), " \t\r\n") };
            } else if (std.mem.eql(u8, pipe, "length")) {
                current = .{ .integer = @intCast(asString(current).len) };
            }
        }
        return current;
    }

    fn resolveIncludes(self: *Engine, source: []const u8, runtime: *Runtime, depth: usize, current_path: ?[]const u8) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:include")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "/>") orelse break;
            const tag = source[start .. end + 2];
            const raw_src = getAttr(tag, "src") orelse "";
            const resolved_src = try self.resolveTemplatePath(raw_src, current_path);
            defer self.allocator.free(resolved_src);

            if (hasPathTraversal(raw_src) or hasPathTraversal(resolved_src)) {
                try out.appendSlice("<!-- PRESTO: path traversal rejected -->");
                idx = end + 2;
                continue;
            }
            if (runtime.include_stack.contains(resolved_src)) {
                try out.appendSlice("<!-- PRESTO: circular include detected -->");
                idx = end + 2;
                continue;
            }
            const tpl = self.templates.get(resolved_src) orelse self.templates.get(raw_src) orelse "<!-- PRESTO: include not found -->";
            try runtime.include_stack.put(resolved_src, {});
            const expanded = self.resolvePasses(tpl, runtime, depth + 1, resolved_src) catch |err| blk: {
                _ = runtime.include_stack.remove(resolved_src);
                if (err == error.MaxDepthExceeded) break :blk try self.allocator.dupe(u8, "<!-- PRESTO: max include depth exceeded -->");
                return err;
            };
            _ = runtime.include_stack.remove(resolved_src);
            defer self.allocator.free(expanded);
            try out.appendSlice(expanded);
            idx = end + 2;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveComponents(self: *Engine, source: []const u8, runtime: *Runtime, depth: usize, current_path: ?[]const u8) ![]u8 {
        _ = depth;
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:component")) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const open_tag = source[start .. open_end + 1];
            const self_closing = open_tag.len >= 2 and open_tag[open_tag.len - 2] == '/';

            var inner: []const u8 = "";
            var close_end = open_end + 1;
            if (!self_closing) {
                const close_start = std.mem.indexOfPos(u8, source, open_end + 1, "</htx:component>") orelse break;
                inner = source[open_end + 1 .. close_start];
                close_end = close_start + "</htx:component>".len;
            }

            const raw_src = getAttr(open_tag, "src") orelse "";
            const resolved_src = try self.resolveTemplatePath(raw_src, current_path);
            defer self.allocator.free(resolved_src);

            if (hasPathTraversal(raw_src) or hasPathTraversal(resolved_src)) {
                try out.appendSlice("<!-- PRESTO: path traversal rejected -->");
                idx = close_end;
                continue;
            }

            var component_src = self.templates.get(resolved_src) orelse self.templates.get(raw_src) orelse "<!-- PRESTO: component not found -->";
            component_src = try self.applyComponentProps(component_src, open_tag, runtime);
            component_src = try replaceAllAlloc(self.allocator, component_src, "<htx:slot />", inner);

            // Keep expressions inside component-expanded content for later control-flow scoped eval.
            try out.appendSlice(component_src);
            idx = close_end;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn applyComponentProps(self: *Engine, component_src: []const u8, tag: []const u8, runtime: *Runtime) ![]const u8 {
        const src = component_src;
        var props_block: []const u8 = "";
        var without_props = try self.allocator.dupe(u8, src);
        errdefer self.allocator.free(without_props);

        if (std.mem.indexOf(u8, src, "<htx:props>")) |s| {
            if (std.mem.indexOfPos(u8, src, s, "</htx:props>")) |e| {
                props_block = src[s + "<htx:props>".len .. e];
                self.allocator.free(without_props);
                without_props = try concat3(self.allocator, src[0..s], "", src[e + "</htx:props>".len ..]);
            }
        }

        var prop_map = std.StringHashMap([]const u8).init(self.allocator);
        defer prop_map.deinit();
        try parseProps(props_block, &prop_map);

        var attrs = std.mem.splitScalar(u8, tag, ' ');
        while (attrs.next()) |chunk| {
            if (!std.mem.containsAtLeast(u8, chunk, 1, "=")) continue;
            const eq = std.mem.indexOf(u8, chunk, "=") orelse continue;
            const key = std.mem.trim(u8, chunk[0..eq], " \t\r\n<>");
            if (std.mem.eql(u8, key, "src")) continue;
            const raw = std.mem.trim(u8, chunk[eq + 1 ..], " \t\r\n\"'>");
            const val = if (std.mem.startsWith(u8, raw, "{htx:") and std.mem.endsWith(u8, raw, "}"))
                blk: {
                    const path = raw[5 .. raw.len - 1];
                    if (self.lookup(runtime, path)) |v| break :blk try self.stringify(v);
                    break :blk raw;
                }
            else
                raw;
            try prop_map.put(key, val);
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

    fn resolveLet(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:let")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "/>") orelse break;
            const tag = source[start .. end + 2];
            const name = getAttr(tag, "name") orelse "";
            const value = getAttr(tag, "value") orelse "";
            const owned_value = try self.allocator.dupe(u8, value);
            try putLocal(runtime, name, .{ .string = owned_value });
            idx = end + 2;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveData(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:data")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "/>") orelse break;
            const tag = source[start .. end + 2];
            const type_name = getAttr(tag, "type") orelse "";
            const as_name = getAttr(tag, "as") orelse type_name;
            const where_clause = getAttr(tag, "where");
            const order = getAttr(tag, "order");
            const limit_raw = getAttr(tag, "limit");

            var rows = try self.queryData(runtime, type_name, where_clause);
            defer rows.deinit();
            if (order) |o| sortRowsByOrder(rows.items, o);
            if (limit_raw) |l| {
                const lim = std.fmt.parseInt(usize, l, 10) catch rows.items.len;
                if (rows.items.len > lim) rows.items.len = lim;
            }

            var arr = std.json.Array.init(self.allocator);
            for (rows.items) |v| try arr.append(v);
            try putLocal(runtime, as_name, .{ .array = arr });
            idx = end + 2;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn queryData(self: *Engine, runtime: *Runtime, type_name: []const u8, where_clause: ?[]const u8) !std.array_list.Managed(std.json.Value) {
        _ = self;
        var out = std.array_list.Managed(std.json.Value).init(runtime.allocator);
        const root_obj = switch (runtime.root) {
            .object => |obj| obj,
            else => return out,
        };
        const data_val = root_obj.get("$data") orelse return out;
        const data_obj = switch (data_val) {
            .object => |obj| obj,
            else => return out,
        };
        const type_val = data_obj.get(type_name) orelse return out;
        const rows = switch (type_val) {
            .array => |a| a.items,
            else => return out,
        };

        for (rows) |row| {
            if (where_clause) |w| {
                if (!matchWhere(row, w)) continue;
            }
            try out.append(row);
        }
        return out;
    }

    fn resolveGrants(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:grant")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "/>") orelse break;
            const tag = source[start .. end + 2];
            const kind = getAttr(tag, "type") orelse "";
            const as_name = getAttr(tag, "as") orelse "";
            const ttl = parseTtl(getAttr(tag, "ttl"), if (std.mem.eql(u8, kind, "asset")) 3600 else 120);

            var value: []const u8 = "";
            if (std.mem.eql(u8, kind, "channel")) {
                const module = getAttr(tag, "module") orelse "default";
                value = try self.issueChannelToken(module, "anon", ttl);
            } else if (std.mem.eql(u8, kind, "websocket")) {
                value = try self.issueRawScopedToken("websocket", "anon", ttl);
            } else if (std.mem.eql(u8, kind, "asset")) {
                const path = getAttr(tag, "path") orelse "";
                value = try self.issueSignedUrl(path, ttl);
            }
            if (as_name.len > 0) try putLocal(runtime, as_name, .{ .string = value });
            idx = end + 2;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveActions(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;

        var action_obj = std.json.ObjectMap.init(self.allocator);
        if (runtime.locals.get("$actions")) |v| {
            if (v == .object) action_obj = v.object;
        }

        while (std.mem.indexOfPos(u8, source, idx, "<htx:action")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "/>") orelse break;
            const tag = source[start .. end + 2];
            const name = getAttr(tag, "name") orelse "";
            const entity_type = getAttr(tag, "type") orelse "";
            var record = getAttr(tag, "record") orelse "";
            if (std.mem.startsWith(u8, record, "{htx:") and std.mem.endsWith(u8, record, "}")) {
                const path = record[5 .. record.len - 1];
                if (self.lookup(runtime, path)) |v| record = try self.stringify(v);
            }
            const token = try self.issueActionToken(name, entity_type, record, 3600);
            if (name.len > 0) {
                const key_owned = try self.allocator.dupe(u8, name);
                try action_obj.put(key_owned, .{ .string = token });
            }
            idx = end + 2;
        }
        try runtime.locals.put("$actions", .{ .object = action_obj });
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveAuth(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        const out = try self.processAuthBlocks(source, runtime, true);
        defer self.allocator.free(out);
        return self.processAuthBlocks(out, runtime, false);
    }

    fn processAuthBlocks(self: *Engine, source: []const u8, runtime: *Runtime, is_auth: bool) ![]u8 {
        const open_tag = if (is_auth) "<htx:auth" else "<htx:unauth";
        const close_tag = if (is_auth) "</htx:auth>" else "</htx:unauth>";
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, open_tag)) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const close_start = std.mem.indexOfPos(u8, source, open_end + 1, close_tag) orelse break;
            const tag = source[start .. open_end + 1];
            const body = source[open_end + 1 .. close_start];

            const user = self.lookup(runtime, "auth.user");
            const authed = user != null and !isFalsy(user.?);
            var allow = if (is_auth) authed else !authed;
            if (is_auth and allow) {
                if (getAttr(tag, "role")) |needed| {
                    if (self.lookup(runtime, "auth.user.role")) |rolev| {
                        allow = std.mem.eql(u8, asString(rolev), needed);
                    } else allow = false;
                }
            }
            if (allow) try out.appendSlice(body);
            idx = close_start + close_tag.len;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveControlFlow(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        const each_done = try self.resolveEach(source, runtime);
        defer self.allocator.free(each_done);
        return self.resolveIf(each_done, runtime);
    }

    fn resolveEach(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:each")) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const close_start = std.mem.indexOfPos(u8, source, open_end + 1, "</htx:each>") orelse break;
            const tag = source[start .. open_end + 1];
            const body_all = source[open_end + 1 .. close_start];
            const items_path = getAttr(tag, "items") orelse "";
            const as_name = getAttr(tag, "as") orelse "item";

            var empty_block: []const u8 = "";
            var item_block = body_all;
            if (std.mem.indexOf(u8, body_all, "<htx:empty")) |es| {
                const ee = std.mem.indexOfPos(u8, body_all, es, ">") orelse es;
                empty_block = body_all[ee + 1 ..];
                item_block = body_all[0..es];
            }

            const items_val = self.lookup(runtime, items_path);
            if (items_val == null or items_val.? != .array or items_val.?.array.items.len == 0) {
                try out.appendSlice(empty_block);
            } else {
                const items = items_val.?.array.items;
                for (items, 0..) |itv, i| {
                    try putLocal(runtime, as_name, itv);
                    try putLocal(runtime, "$index", .{ .integer = @intCast(i) });
                    try putLocal(runtime, "$first", .{ .bool = i == 0 });
                    try putLocal(runtime, "$last", .{ .bool = i == items.len - 1 });
                    const rendered = try self.evalExpressions(item_block, runtime);
                    defer self.allocator.free(rendered);
                    try out.appendSlice(rendered);
                }
            }
            idx = close_start + "</htx:each>".len;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveIf(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:if")) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const close_if = std.mem.indexOfPos(u8, source, open_end + 1, "</htx:if>") orelse break;
            const tag = source[start .. open_end + 1];
            const if_body = source[open_end + 1 .. close_if];

            var cursor = close_if + "</htx:if>".len;
            var else_body: []const u8 = "";
            if (std.mem.indexOfPos(u8, source, cursor, "<htx:else>")) |else_start| {
                if (else_start == cursor or std.mem.trim(u8, source[cursor..else_start], " \t\r\n").len == 0) {
                    const else_end = std.mem.indexOfPos(u8, source, else_start, "</htx:else>") orelse else_start;
                    else_body = source[else_start + "<htx:else>".len .. else_end];
                    cursor = else_end + "</htx:else>".len;
                }
            }

            const test_path = getAttr(tag, "test") orelse "";
            const truthy = if (self.lookup(runtime, test_path)) |v| !isFalsy(v) else false;
            const rendered = try self.evalExpressions(if (truthy) if_body else else_body, runtime);
            defer self.allocator.free(rendered);
            try out.appendSlice(rendered);
            idx = cursor;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn evalExpressions(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var blocks = std.array_list.Managed(ProtectedBlock).init(self.allocator);
        defer {
            for (blocks.items) |b| {
                self.allocator.free(b.marker);
                self.allocator.free(b.content);
            }
            blocks.deinit();
        }

        const protected_script = try self.protect(source, &blocks, "script");
        defer self.allocator.free(protected_script);
        const protected_raw = try self.protect(protected_script, &blocks, "htx:raw");
        defer self.allocator.free(protected_raw);

        const v_done = try self.resolveHtxV(protected_raw, runtime);
        defer self.allocator.free(v_done);
        const attr_done = try self.resolveAttrBindings(v_done, runtime);
        defer self.allocator.free(attr_done);

        return self.restoreProtected(attr_done, blocks.items);
    }

    fn resolveHtxV(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:v")) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const open_tag = source[start .. open_end + 1];
            const is_raw = std.mem.indexOf(u8, open_tag, " raw") != null;

            var path = getAttr(open_tag, "path") orelse "";
            var close_end = open_end + 1;
            if (path.len == 0) {
                const close_start = std.mem.indexOfPos(u8, source, open_end + 1, "</htx:v>") orelse break;
                path = std.mem.trim(u8, source[open_end + 1 .. close_start], " \t\r\n");
                close_end = close_start + "</htx:v>".len;
            }

            const val = if (self.lookup(runtime, path)) |v| try self.stringify(v) else "";
            const rendered = if (is_raw) try self.allocator.dupe(u8, val) else try htmlEscape(self.allocator, val);
            defer self.allocator.free(rendered);
            try out.appendSlice(rendered);
            idx = close_end;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn resolveAttrBindings(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "{htx:")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "}") orelse break;
            const expr = source[start + 5 .. end];
            const raw = if (self.lookup(runtime, expr)) |v| try self.stringify(v) else "";
            const escaped = try htmlEscape(self.allocator, raw);
            defer self.allocator.free(escaped);
            try out.appendSlice(escaped);
            idx = end + 1;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn extractHtxScript(self: *Engine, source: []const u8, runtime: *Runtime) ![]u8 {
        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, "<htx:script>")) |start| {
            try out.appendSlice(source[idx..start]);
            const end = std.mem.indexOfPos(u8, source, start, "</htx:script>") orelse break;
            const body = source[start + "<htx:script>".len .. end];
            try runtime.script_collector.append(try self.allocator.dupe(u8, body));
            idx = end + "</htx:script>".len;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn stripHtxDirectives(self: *Engine, source: []const u8) ![]u8 {
        var out = try self.allocator.dupe(u8, source);
        const tokens = [_][]const u8{ "<htx:else>", "</htx:else>", "<htx:empty>", "</htx:empty>" };
        for (tokens) |tok| {
            const next = try replaceAllAlloc(self.allocator, out, tok, "");
            self.allocator.free(out);
            out = next;
        }
        return out;
    }

    fn extractLayoutDirective(self: *Engine, source: []const u8) !LayoutChoice {
        if (std.mem.indexOf(u8, source, "<htx:layout")) |s| {
            const e = std.mem.indexOfPos(u8, source, s, "/>") orelse std.mem.indexOfPos(u8, source, s, "</htx:layout>") orelse return .{};
            const tag = source[s .. e + 2];
            if (std.mem.indexOf(u8, tag, "none") != null) return .{ .none = true };
            if (getAttr(tag, "src")) |path| return .{ .src = try self.allocator.dupe(u8, path) };
        }
        return .{};
    }

    fn removeLayoutDirective(self: *Engine, source: []const u8) ![]u8 {
        if (std.mem.indexOf(u8, source, "<htx:layout")) |s| {
            const e = std.mem.indexOfPos(u8, source, s, "/>") orelse std.mem.indexOfPos(u8, source, s, "</htx:layout>") orelse return self.allocator.dupe(u8, source);
            return concat3(self.allocator, source[0..s], "", source[e + 2 ..]);
        }
        return self.allocator.dupe(u8, source);
    }

    fn applyLayout(self: *Engine, content: []const u8, template_path: ?[]const u8, choice: LayoutChoice) ![]u8 {
        _ = template_path;
        if (choice.none) return self.allocator.dupe(u8, content);
        const layout_src = if (choice.src) |src|
            self.templates.get(src) orelse return self.allocator.dupe(u8, content)
        else
            self.templates.get("_layout.htx") orelse return self.allocator.dupe(u8, content);
        return replaceAllAlloc(self.allocator, layout_src, "__content__", content);
    }

    fn injectScripts(self: *Engine, html: []const u8, scripts: []const []const u8) ![]u8 {
        if (scripts.len == 0) return self.allocator.dupe(u8, html);
        var bundle = std.array_list.Managed(u8).init(self.allocator);
        try bundle.appendSlice("<!--PRESTO:SCRIPT:BEGIN-->");
        for (scripts) |s| {
            try bundle.appendSlice("<script>");
            try bundle.appendSlice(s);
            try bundle.appendSlice("</script>");
        }
        try bundle.appendSlice("<!--PRESTO:SCRIPT:END-->");
        const block = try bundle.toOwnedSlice();
        defer self.allocator.free(block);

        if (std.mem.lastIndexOf(u8, html, "</body>")) |pos| {
            return concat3(self.allocator, html[0..pos], block, html[pos..]);
        }
        return concat3(self.allocator, html, block, "");
    }

    fn unwrapRaw(self: *Engine, html: []const u8) ![]u8 {
        const out = try replaceAllAlloc(self.allocator, html, "<htx:raw>", "");
        const next = try replaceAllAlloc(self.allocator, out, "</htx:raw>", "");
        self.allocator.free(out);
        return next;
    }

    fn stringify(self: *Engine, v: std.json.Value) ![]const u8 {
        return switch (v) {
            .null => "",
            .bool => |b| if (b) "true" else "false",
            .integer => |n| try std.fmt.allocPrint(self.allocator, "{d}", .{n}),
            .float => |f| try std.fmt.allocPrint(self.allocator, "{d}", .{f}),
            .number_string => |s| s,
            .string => |s| s,
            .array, .object => "",
        };
    }

    const ProtectedBlock = struct {
        marker: []const u8,
        content: []const u8,
    };

    fn protect(self: *Engine, source: []const u8, blocks: *std.array_list.Managed(ProtectedBlock), tag: []const u8) ![]u8 {
        const open = if (std.mem.eql(u8, tag, "script")) "<script" else "<htx:raw";
        const close = if (std.mem.eql(u8, tag, "script")) "</script>" else "</htx:raw>";

        var out = std.array_list.Managed(u8).init(self.allocator);
        var idx: usize = 0;
        while (std.mem.indexOfPos(u8, source, idx, open)) |start| {
            try out.appendSlice(source[idx..start]);
            const open_end = std.mem.indexOfPos(u8, source, start, ">") orelse break;
            const end = std.mem.indexOfPos(u8, source, open_end + 1, close) orelse break;
            const content = source[start .. end + close.len];
            const marker = try std.fmt.allocPrint(self.allocator, "__PRESTO_PROT_{d}__", .{blocks.items.len});
            try blocks.append(.{
                .marker = marker,
                .content = try self.allocator.dupe(u8, content),
            });
            try out.appendSlice(marker);
            idx = end + close.len;
        }
        try out.appendSlice(source[idx..]);
        return out.toOwnedSlice();
    }

    fn restoreProtected(self: *Engine, source: []const u8, blocks: []const ProtectedBlock) ![]u8 {
        var out = try self.allocator.dupe(u8, source);
        for (blocks) |b| {
            const next = try replaceAllAlloc(self.allocator, out, b.marker, b.content);
            self.allocator.free(out);
            out = next;
        }
        return out;
    }

    fn resolvePostLayout(self: *Engine, source: []const u8, runtime: *Runtime, current_path: ?[]const u8) ![]u8 {
        const includes_done = try self.resolveIncludes(source, runtime, 0, current_path);
        defer self.allocator.free(includes_done);
        const auth_done = try self.resolveAuth(includes_done, runtime);
        defer self.allocator.free(auth_done);
        return self.resolveControlFlow(auth_done, runtime);
    }

    pub fn issueActionToken(self: *Engine, action: []const u8, entity_type: []const u8, record_id: []const u8, ttl_s: i64) ![]u8 {
        const exp = std.time.timestamp() + ttl_s;
        const payload = try std.fmt.allocPrint(self.allocator, "{{\"action\":\"{s}\",\"type\":\"{s}\",\"recordId\":\"{s}\",\"exp\":{d}}}", .{
            action,
            entity_type,
            record_id,
            exp,
        });
        return self.signPayload(payload);
    }

    pub fn verifyActionToken(self: *Engine, token: []const u8) !ActionClaims {
        const payload = try self.verifySignedToken(token);
        const action = extractJsonString(payload, "action") orelse return error.InvalidToken;
        const entity_type = extractJsonString(payload, "type") orelse return error.InvalidToken;
        const record_id = extractJsonString(payload, "recordId") orelse return error.InvalidToken;
        const exp = extractJsonInt(payload, "exp") orelse return error.InvalidToken;
        if (exp <= std.time.timestamp()) return error.TokenExpired;
        return .{ .action = action, .entity_type = entity_type, .record_id = record_id, .exp = exp };
    }

    pub fn issueChannelToken(self: *Engine, module: []const u8, sub: []const u8, ttl_s: i64) ![]u8 {
        const scope = try std.fmt.allocPrint(self.allocator, "channel:{s}", .{module});
        return self.issueRawScopedToken(scope, sub, ttl_s);
    }

    fn issueRawScopedToken(self: *Engine, scope: []const u8, sub: []const u8, ttl_s: i64) ![]u8 {
        const exp = std.time.timestamp() + ttl_s;
        const payload = try std.fmt.allocPrint(self.allocator, "{{\"sub\":\"{s}\",\"scope\":\"{s}\",\"exp\":{d},\"jti\":\"{d}\"}}", .{
            sub,
            scope,
            exp,
            std.time.milliTimestamp(),
        });
        return self.signPayload(payload);
    }

    pub fn verifyChannelToken(self: *Engine, token: []const u8, expected_module: []const u8) !ChannelClaims {
        const payload = try self.verifySignedToken(token);
        const sub = extractJsonString(payload, "sub") orelse return error.InvalidToken;
        const scope = extractJsonString(payload, "scope") orelse return error.InvalidToken;
        const exp = extractJsonInt(payload, "exp") orelse return error.InvalidToken;
        const jti = extractJsonString(payload, "jti") orelse return error.InvalidToken;
        if (exp <= std.time.timestamp()) return error.TokenExpired;

        const expect_scope = try std.fmt.allocPrint(self.allocator, "channel:{s}", .{expected_module});
        defer self.allocator.free(expect_scope);
        if (!std.mem.eql(u8, scope, expect_scope)) return error.WrongScope;
        return .{ .sub = sub, .scope = scope, .exp = exp, .jti = jti };
    }

    pub fn handleChannelApi(self: *Engine, path: []const u8, bearer: []const u8) !u16 {
        if (!std.mem.startsWith(u8, path, "/api/channel/")) return 404;
        const rest = path["/api/channel/".len..];
        const slash = std.mem.indexOfScalar(u8, rest, '/') orelse rest.len;
        const module = rest[0..slash];
        if (!self.channel_handlers.contains(module)) return 404;
        _ = self.verifyChannelToken(bearer, module) catch |err| {
            return switch (err) {
                error.WrongScope => 403,
                else => 401,
            };
        };
        return 200;
    }

    pub fn issueSignedUrl(self: *Engine, path: []const u8, ttl_s: i64) ![]u8 {
        const exp = std.time.timestamp() + ttl_s;
        const basis = try std.fmt.allocPrint(self.allocator, "{s}:{d}", .{ path, exp });
        defer self.allocator.free(basis);
        const sig = hmacSha256(self.secret, basis);
        const sig_b64 = try b64UrlEncodeAlloc(self.allocator, sig[0..]);
        return std.fmt.allocPrint(self.allocator, "{s}?sig={s}&exp={d}", .{ path, sig_b64, exp });
    }

    pub fn verifySignedUrl(self: *Engine, url: []const u8) !bool {
        const q = std.mem.indexOfScalar(u8, url, '?') orelse return false;
        const path = url[0..q];
        const query = url[q + 1 ..];
        const sig = queryParam(query, "sig") orelse return false;
        const exp_s = queryParam(query, "exp") orelse return false;
        const exp = std.fmt.parseInt(i64, exp_s, 10) catch return false;
        if (exp <= std.time.timestamp()) return false;
        const basis = try std.fmt.allocPrint(self.allocator, "{s}:{d}", .{ path, exp });
        defer self.allocator.free(basis);
        const expect = hmacSha256(self.secret, basis);
        return verifyBase64Mac(sig, expect);
    }

    fn signPayload(self: *Engine, payload: []const u8) ![]u8 {
        const payload_b64 = try b64UrlEncodeAlloc(self.allocator, payload);
        const mac = hmacSha256(self.secret, payload_b64);
        const mac_b64 = try b64UrlEncodeAlloc(self.allocator, mac[0..]);
        return std.fmt.allocPrint(self.allocator, "{s}.{s}", .{ payload_b64, mac_b64 });
    }

    fn verifySignedToken(self: *Engine, token: []const u8) ![]u8 {
        const dot = std.mem.indexOfScalar(u8, token, '.') orelse return error.InvalidToken;
        const payload_b64 = token[0..dot];
        const sig_b64 = token[dot + 1 ..];
        const expect_mac = hmacSha256(self.secret, payload_b64);
        if (!verifyBase64Mac(sig_b64, expect_mac)) return error.InvalidSignature;
        return b64UrlDecodeAlloc(self.allocator, payload_b64);
    }

    fn resolveTemplatePath(self: *Engine, raw_src: []const u8, current_path: ?[]const u8) ![]u8 {
        if (raw_src.len == 0) return self.allocator.dupe(u8, raw_src);
        if (std.mem.startsWith(u8, raw_src, "/")) return self.allocator.dupe(u8, raw_src);
        if (current_path) |cur| {
            const slash = std.mem.lastIndexOfScalar(u8, cur, '/') orelse return self.allocator.dupe(u8, raw_src);
            const base = cur[0..slash];
            return std.fmt.allocPrint(self.allocator, "{s}/{s}", .{ base, raw_src });
        }
        return self.allocator.dupe(u8, raw_src);
    }
};

pub fn parseCookies(allocator: std.mem.Allocator, cookie_header: []const u8) !std.StringHashMap([]const u8) {
    var map = std.StringHashMap([]const u8).init(allocator);
    var parts = std.mem.splitScalar(u8, cookie_header, ';');
    while (parts.next()) |pair_raw| {
        const pair = std.mem.trim(u8, pair_raw, " \t");
        const eq = std.mem.indexOfScalar(u8, pair, '=') orelse continue;
        const key = std.mem.trim(u8, pair[0..eq], " \t");
        const val = std.mem.trim(u8, pair[eq + 1 ..], " \t");
        try map.put(key, val);
    }
    return map;
}

pub fn parseRequestBody(allocator: std.mem.Allocator, content_type: []const u8, body: []const u8) !std.StringHashMap([]const u8) {
    var out = std.StringHashMap([]const u8).init(allocator);
    if (std.mem.startsWith(u8, content_type, "application/json")) {
        var parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
        defer parsed.deinit();
        if (parsed.value == .object) {
            var it = parsed.value.object.iterator();
            while (it.next()) |e| {
                if (e.value_ptr.* == .string) try out.put(e.key_ptr.*, e.value_ptr.*.string);
            }
        }
    } else if (std.mem.startsWith(u8, content_type, "application/x-www-form-urlencoded")) {
        var pairs = std.mem.splitScalar(u8, body, '&');
        while (pairs.next()) |kv| {
            const eq = std.mem.indexOfScalar(u8, kv, '=') orelse continue;
            try out.put(kv[0..eq], kv[eq + 1 ..]);
        }
    }
    return out;
}

fn hasPathTraversal(path: []const u8) bool {
    return std.mem.indexOf(u8, path, "..") != null;
}

fn parseTtl(ttl: ?[]const u8, fallback: i64) i64 {
    if (ttl) |t| return std.fmt.parseInt(i64, t, 10) catch fallback;
    return fallback;
}

fn matchWhere(row: std.json.Value, clause: []const u8) bool {
    const eq = std.mem.indexOf(u8, clause, "=") orelse return true;
    const key = std.mem.trim(u8, clause[0..eq], " \t");
    var val = std.mem.trim(u8, clause[eq + 1 ..], " \t");
    if (val.len >= 2 and ((val[0] == '\'' and val[val.len - 1] == '\'') or (val[0] == '"' and val[val.len - 1] == '"'))) {
        val = val[1 .. val.len - 1];
    }
    if (row != .object) return false;
    const field = row.object.get(key) orelse return false;
    return std.mem.eql(u8, asString(field), val);
}

fn sortRowsByOrder(rows: []std.json.Value, order: []const u8) void {
    const desc = std.mem.indexOf(u8, order, "desc") != null;
    std.mem.sort(std.json.Value, rows, desc, struct {
        fn lessThan(descend: bool, a: std.json.Value, b: std.json.Value) bool {
            const av = if (a == .object and a.object.get("id") != null and a.object.get("id").? == .integer) a.object.get("id").?.integer else 0;
            const bv = if (b == .object and b.object.get("id") != null and b.object.get("id").? == .integer) b.object.get("id").?.integer else 0;
            return if (descend) av > bv else av < bv;
        }
    }.lessThan);
}

fn queryParam(query: []const u8, name: []const u8) ?[]const u8 {
    var pairs = std.mem.splitScalar(u8, query, '&');
    while (pairs.next()) |kv| {
        const eq = std.mem.indexOfScalar(u8, kv, '=') orelse continue;
        if (std.mem.eql(u8, kv[0..eq], name)) return kv[eq + 1 ..];
    }
    return null;
}

fn isFalsy(v: std.json.Value) bool {
    return switch (v) {
        .null => true,
        .bool => |b| !b,
        .integer => |n| n == 0,
        .float => |f| f == 0,
        .number_string => |s| s.len == 0,
        .string => |s| s.len == 0,
        .array => |arr| arr.items.len == 0,
        .object => false,
    };
}

fn asString(v: std.json.Value) []const u8 {
    return switch (v) {
        .string => |s| s,
        .number_string => |s| s,
        .bool => |b| if (b) "true" else "false",
        .null => "",
        .integer => "",
        .float => "",
        .array => "",
        .object => "",
    };
}

fn parseProps(block: []const u8, map: *std.StringHashMap([]const u8)) !void {
    var lines = std.mem.splitScalar(u8, block, '\n');
    while (lines.next()) |line_raw| {
        const line = std.mem.trim(u8, line_raw, " \t\r\n");
        if (line.len == 0) continue;
        const eq = std.mem.indexOf(u8, line, "=") orelse continue;
        const key = std.mem.trim(u8, line[0..eq], " \t");
        const value = std.mem.trim(u8, line[eq + 1 ..], " \t\"");
        try map.put(key, value);
    }
}

fn putLocal(runtime: *Runtime, key: []const u8, val: std.json.Value) !void {
    const owned = try runtime.allocator.dupe(u8, key);
    try runtime.locals.put(owned, val);
}

fn getAttr(tag: []const u8, name: []const u8) ?[]const u8 {
    var pattern_buf: [64]u8 = undefined;
    const pattern = std.fmt.bufPrint(&pattern_buf, "{s}=\"", .{name}) catch return null;
    const s = std.mem.indexOf(u8, tag, pattern) orelse return null;
    const start = s + pattern.len;
    const end = std.mem.indexOfPos(u8, tag, start, "\"") orelse return null;
    return tag[start..end];
}

fn htmlEscape(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    var out = std.array_list.Managed(u8).init(allocator);
    for (input) |c| switch (c) {
        '&' => try out.appendSlice("&amp;"),
        '<' => try out.appendSlice("&lt;"),
        '>' => try out.appendSlice("&gt;"),
        '"' => try out.appendSlice("&quot;"),
        else => try out.append(c),
    };
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

fn normalizeRoutePath(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
    if (path.len == 0 or std.mem.eql(u8, path, "/")) return allocator.dupe(u8, "/index");
    var p_owned: ?[]u8 = null;
    var p = path;
    if (!std.mem.startsWith(u8, p, "/")) {
        p_owned = try std.fmt.allocPrint(allocator, "/{s}", .{path});
        p = p_owned.?;
    }
    defer if (p_owned) |v| allocator.free(v);
    if (std.mem.endsWith(u8, p, "/") and p.len > 1) p = p[0 .. p.len - 1];
    return allocator.dupe(u8, p);
}

fn matchDynamicPath(allocator: std.mem.Allocator, template_path: []const u8, route: []const u8, params: *std.StringHashMap([]const u8)) bool {
    const tmpl = if (std.mem.endsWith(u8, template_path, ".htx")) template_path[0 .. template_path.len - 4] else template_path;
    var t_it = std.mem.splitScalar(u8, tmpl, '/');
    var r_it = std.mem.splitScalar(u8, route, '/');
    while (true) {
        const t = t_it.next();
        const r = r_it.next();
        if (t == null and r == null) return true;
        if (t == null or r == null) return false;
        if (t.?.len == 0 and r.?.len == 0) continue;
        if (t.?.len >= 2 and t.?[0] == '[' and t.?[t.?.len - 1] == ']') {
            const key = t.?[1 .. t.?.len - 1];
            const k = allocator.dupe(u8, key) catch return false;
            const v = allocator.dupe(u8, r.?) catch return false;
            params.put(k, v) catch return false;
            continue;
        }
        if (!std.mem.eql(u8, t.?, r.?)) return false;
    }
}
