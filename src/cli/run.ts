import { join } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { parseCliArgs } from "./args.js";
import { loadConfig } from "../core/config.js";
import { PolicyEngine } from "../core/policy.js";
import { createComputerUseServer } from "../mcp/server.js";
import { RuntimeClient } from "../runtime/client.js";
import { checkPermissions } from "../runtime/permissions.js";

export type DoctorResult = {
  screen_recording: string;
  accessibility: string;
  helper_status: string;
  next_steps: string[];
};

export type CliServices = {
  write?: (chunk: string) => void;
  writeError?: (chunk: string) => void;
  doctor?: () => Promise<DoctorResult>;
  call?: (tool: string, args: unknown) => Promise<unknown>;
  startMcp?: () => Promise<void>;
};

const defaultDoctorResult: DoctorResult = {
  screen_recording: "unknown",
  accessibility: "unknown",
  helper_status: "unknown",
  next_steps: ["Runtime doctor is not fully implemented yet."],
};

export async function runCli(argv: string[], services: CliServices = {}): Promise<number> {
  const write = services.write ?? ((chunk) => process.stdout.write(chunk));
  const writeError = services.writeError ?? ((chunk) => process.stderr.write(chunk));

  try {
    const command = parseCliArgs(argv);

    switch (command.command) {
      case "help":
        write(helpText());
        return 0;
      case "mcp":
        await (services.startMcp ?? defaultStartMcp)();
        return 0;
      case "doctor": {
        const result = await (services.doctor ?? defaultDoctor)();
        if (command.json) {
          write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          write(formatDoctor(result));
        }
        return 0;
      }
      case "call": {
        if (command.stdin) {
          throw new Error("--stdin is not implemented yet");
        }
        const result = await (services.call ?? defaultCall)(command.tool, command.args);
        write(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
      }
    }
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

export function helpText(): string {
  return [
    "operel-computer-use <command>",
    "",
    "Commands:",
    "  mcp                 Start the MCP server over stdio",
    "  doctor [--json]     Check macOS permissions and runtime health",
    "  call <tool>         Invoke a tool for local debugging",
    "",
  ].join("\n");
}

function formatDoctor(result: DoctorResult): string {
  const nextSteps =
    result.next_steps.length === 0
      ? "None"
      : result.next_steps.map((step) => `- ${step}`).join("\n");

  return [
    "Operel Computer Use Doctor",
    `Screen Recording: ${result.screen_recording}`,
    `Accessibility: ${result.accessibility}`,
    `Runtime helper: ${result.helper_status}`,
    "",
    "Next step:",
    nextSteps,
    "",
  ].join("\n");
}

async function defaultDoctor(): Promise<DoctorResult> {
  return checkPermissions();
}

async function defaultCall(tool: string, args: unknown): Promise<unknown> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath });

  try {
    return await client.request(tool, args);
  } finally {
    await client.close();
  }
}

async function defaultStartMcp(): Promise<void> {
  const config = loadConfig();
  const server = createComputerUseServer({
    policy: new PolicyEngine({
      apps: config.apps,
    }),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
