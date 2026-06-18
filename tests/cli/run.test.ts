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

  it("returns a usage error for invalid arguments", async () => {
    const errors: string[] = [];

    const exitCode = await runCli(["call"], {
      writeError: (chunk) => errors.push(chunk),
    });

    expect(exitCode).toBe(2);
    expect(errors.join("")).toContain("call requires a tool name");
  });
});
