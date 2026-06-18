import { join } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { parseCliArgs } from "./args.js";
import { defaultConfigPath, initConfig, loadConfig } from "../core/config.js";
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
  readStdin?: () => Promise<string>;
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
      case "config": {
        if (command.action === "path") {
          write(`${defaultConfigPath()}\n`);
          return 0;
        }
        if (command.action === "init") {
          write(`${JSON.stringify(initConfig(), null, 2)}\n`);
          return 0;
        }
        write(`${JSON.stringify(redactConfig(loadConfig()), null, 2)}\n`);
        return 0;
      }
      case "call": {
        const args = command.stdin
          ? parseStdinJson(await (services.readStdin ?? readProcessStdin)())
          : command.args;
        const result = await (services.call ?? defaultCall)(command.tool, args);
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
    "  config <action>     Manage config path, init, and print",
    "  call <tool>         Invoke a tool for local debugging",
    "",
  ].join("\n");
}

function redactConfig(config: unknown): unknown {
  if (Array.isArray(config)) {
    return config.map(redactConfig);
  }

  if (config && typeof config === "object") {
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        key,
        /password|token|secret|api[_-]?key/i.test(key) ? "[REDACTED]" : redactConfig(value),
      ]),
    );
  }

  return config;
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
  const config = loadConfig();
  const server = createComputerUseServer({
    policy: new PolicyEngine({
      apps: config.apps,
    }),
  });
  const registeredTools = (server as unknown as {
    _registeredTools?: Record<string, { handler: (args: unknown, extra: unknown) => Promise<{ structuredContent?: unknown }> }>;
  })._registeredTools;
  const registered = registeredTools?.[tool];

  try {
    if (!registered) {
      return await callRuntimeMethod(tool, args);
    }
    const result = await registered.handler(args, {});
    return result.structuredContent ?? {};
  } finally {
    await server.close();
  }
}

async function callRuntimeMethod(method: string, args: unknown): Promise<unknown> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath });

  try {
    return await client.request(method, args);
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

function parseStdinJson(raw: string): unknown {
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new Error("invalid JSON from stdin");
  }
}

async function readProcessStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}
