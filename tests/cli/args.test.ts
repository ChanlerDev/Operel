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

  it("rejects call without tool name", () => {
    expect(() => parseCliArgs(["call"])).toThrow("call requires a tool name");
  });

  it("rejects invalid JSON args", () => {
    expect(() => parseCliArgs(["call", "observe", "--args", "{"])).toThrow(
      "invalid JSON for --args",
    );
  });
});
