import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/run.js";

describe("runCli", () => {
  it("prints help when no command is provided", async () => {
    const writes: string[] = [];

    const exitCode = await runCli([], {
      write: (chunk) => writes.push(chunk),
    });

    expect(exitCode).toBe(0);
    expect(writes.join("")).toContain("operel-computer-use <command>");
  });

  it("prints machine-readable doctor output", async () => {
    const writes: string[] = [];

    const exitCode = await runCli(["doctor", "--json"], {
      write: (chunk) => writes.push(chunk),
      doctor: async () => ({
        screen_recording: "unknown",
        accessibility: "unknown",
        helper_status: "ok",
        next_steps: [],
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(writes.join(""))).toEqual({
      screen_recording: "unknown",
      accessibility: "unknown",
      helper_status: "ok",
      next_steps: [],
    });
  });

  it("prints human-readable signing diagnostics", async () => {
    const writes: string[] = [];

    const exitCode = await runCli(["doctor"], {
      write: (chunk) => writes.push(chunk),
      doctor: async () => ({
        screen_recording: "unknown",
        accessibility: "unknown",
        binary_path: "/tmp/OperelRuntime",
        code_signing: {
          status: "adhoc",
          identity: "adhoc",
          team_identifier: "",
        },
        helper_status: "ok",
        next_steps: [],
      }),
    });

    expect(exitCode).toBe(0);
    expect(writes.join("")).toContain("Binary path: /tmp/OperelRuntime");
    expect(writes.join("")).toContain("Code signing: adhoc (adhoc)");
  });

  it("invokes call command with parsed args", async () => {
    const writes: string[] = [];
    const calls: unknown[] = [];

    const exitCode = await runCli(["call", "runtime.ping", "--args", "{\"fast\":true}"], {
      write: (chunk) => writes.push(chunk),
      call: async (tool, args) => {
        calls.push({ tool, args });
        return { ok: true };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ tool: "runtime.ping", args: { fast: true } }]);
    expect(JSON.parse(writes.join(""))).toEqual({ ok: true });
  });

  it("invokes call command with JSON args from stdin", async () => {
    const writes: string[] = [];
    const calls: unknown[] = [];

    const exitCode = await runCli(["call", "observe", "--stdin"], {
      write: (chunk) => writes.push(chunk),
      readStdin: async () => "{\"app\":\"TextEdit\"}",
      call: async (tool, args) => {
        calls.push({ tool, args });
        return { ok: true };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ tool: "observe", args: { app: "TextEdit" } }]);
    expect(JSON.parse(writes.join(""))).toEqual({ ok: true });
  });

  it("prints config path", async () => {
    const writes: string[] = [];
    const exitCode = await runCli(["config", "path"], {
      write: (chunk) => writes.push(chunk),
    });

    expect(exitCode).toBe(0);
    expect(writes.join("")).toContain("config.toml");
  });

  it("installs MCP config from the CLI", async () => {
    const writes: string[] = [];
    const root = mkdtempSync(join(tmpdir(), "operel-cli-install-"));
    const configPath = join(root, "config.toml");

    const exitCode = await runCli(["install", "codex", "--config-path", configPath, "--command", "operel-dev"], {
      write: (chunk) => writes.push(chunk),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(writes.join(""))).toMatchObject({
      client: "codex",
      server_name: "operel-computer-use",
      config_path: configPath,
      command: "operel-dev",
      args: ["mcp"],
    });
    expect(readFileSync(configPath, "utf8")).toContain('command = "operel-dev"');
  });

  it("returns a usage error for invalid arguments", async () => {
    const errors: string[] = [];

    const exitCode = await runCli(["call"], {
      writeError: (chunk) => errors.push(chunk),
    });

    expect(exitCode).toBe(2);
    expect(errors.join("")).toContain("call requires a tool name");
  });
});
