const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const mod = b.addModule("presto_htx", .{
        .root_source_file = b.path("src/engine.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    const exe = b.addExecutable(.{
        .name = "presto-htx",
        .root_module = exe_mod,
    });
    exe.root_module.addImport("presto_htx", mod);
    b.installArtifact(exe);

    const server_mod = b.createModule(.{
        .root_source_file = b.path("src/server.zig"),
        .target = target,
        .optimize = optimize,
    });
    const server_exe = b.addExecutable(.{
        .name = "presto-server",
        .root_module = server_mod,
    });
    server_exe.root_module.addImport("presto_htx", mod);
    b.installArtifact(server_exe);

    const token_mod = b.createModule(.{
        .root_source_file = b.path("src/token_cli.zig"),
        .target = target,
        .optimize = optimize,
    });
    const token_exe = b.addExecutable(.{
        .name = "presto-token",
        .root_module = token_mod,
    });
    token_exe.root_module.addImport("presto_htx", mod);
    b.installArtifact(token_exe);

    const test_mod = b.createModule(.{
        .root_source_file = b.path("src/engine_test.zig"),
        .target = target,
        .optimize = optimize,
    });
    const engine_tests = b.addTest(.{
        .root_module = test_mod,
    });
    engine_tests.root_module.addImport("presto_htx", mod);

    const server_test_mod = b.createModule(.{
        .root_source_file = b.path("src/server_layer_test.zig"),
        .target = target,
        .optimize = optimize,
    });
    const server_tests = b.addTest(.{
        .root_module = server_test_mod,
    });

    const run_tests = b.addRunArtifact(engine_tests);
    const run_server_tests = b.addRunArtifact(server_tests);
    const test_step = b.step("test", "Run conformance fixtures");
    test_step.dependOn(&run_tests.step);
    test_step.dependOn(&run_server_tests.step);
}
