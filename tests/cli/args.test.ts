import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../../src/cli/args.js";

describe("parseCliArgs", () => {
  it("routes no arguments to help", () => {
    expect(parseCliArgs([])).toEqual({ command: "help" });
  });

  it("routes mcp command", () => {
    expect(parseCliArgs(["mcp"])).toEqual({ command: "mcp" });
  });

  it("routes doctor command with json output", () => {
    expect(parseCliArgs(["doctor", "--json"])).toEqual({
      command: "doctor",
      json: true,
    });
  });

  it("routes call command with parsed JSON args", () => {
    expect(parseCliArgs(["call", "runtime.ping", "--args", "{\"ok\":true}"])).toEqual({
      command: "call",
      tool: "runtime.ping",
      args: { ok: true },
      stdin: false,
    });
  });

  it("routes config subcommands", () => {
    expect(parseCliArgs(["config", "path"])).toEqual({ command: "config", action: "path" });
    expect(parseCliArgs(["config", "init"])).toEqual({ command: "config", action: "init" });
    expect(parseCliArgs(["config", "print"])).toEqual({ command: "config", action: "print" });
    expect(parseCliArgs(["config", "mode", "full-access"])).toEqual({
      command: "config",
      action: "mode",
      mode: "full_access",
    });
  });

  it("routes install subcommands", () => {
    expect(parseCliArgs(["install", "codex"])).toEqual({
      command: "install",
      client: "codex",
      configPath: undefined,
      serverCommand: undefined,
    });
    expect(parseCliArgs(["install", "claude", "--config-path", "/tmp/settings.json", "--command", "node"])).toEqual({
      command: "install",
      client: "claude",
      configPath: "/tmp/settings.json",
      serverCommand: "node",
    });
  });

  it("rejects call without tool name", () => {
    expect(() => parseCliArgs(["call"])).toThrow("call requires a tool name");
  });

  it("rejects invalid JSON args", () => {
    expect(() => parseCliArgs(["call", "observe", "--args", "{"])).toThrow(
      "invalid JSON for --args",
    );
  });

  it("rejects unknown config subcommands", () => {
    expect(() => parseCliArgs(["config", "delete"])).toThrow("unknown config action: delete");
  });

  it("rejects invalid install arguments", () => {
    expect(() => parseCliArgs(["install"])).toThrow("install requires client: codex or claude");
    expect(() => parseCliArgs(["install", "codex", "--missing"])).toThrow("unknown install option: --missing");
  });
});
