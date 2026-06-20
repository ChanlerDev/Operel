export type CliCommand =
  | { command: "help" }
  | { command: "mcp" }
  | { command: "doctor"; json: boolean }
  | { command: "config"; action: "path" | "init" | "print" }
  | { command: "config"; action: "mode"; mode: "manual" | "confirm_on_retry" | "full_access" }
  | { command: "install"; client: "codex" | "claude"; configPath?: string; serverCommand?: string }
  | { command: "call"; tool: string; args: unknown; stdin: boolean };

export function parseCliArgs(argv: string[]): CliCommand {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    return { command: "help" };
  }

  if (command === "mcp") {
    return { command: "mcp" };
  }

  if (command === "doctor") {
    return { command: "doctor", json: rest.includes("--json") };
  }

  if (command === "call") {
    return parseCallArgs(rest);
  }

  if (command === "config") {
    return parseConfigArgs(rest);
  }

  if (command === "install") {
    return parseInstallArgs(rest);
  }

  throw new Error(`unknown command: ${command}`);
}

function parseConfigArgs(args: string[]): CliCommand {
  const action = args[0] ?? "path";
  if (action === "path" || action === "init" || action === "print") {
    return { command: "config", action };
  }
  if (action === "mode") {
    return { command: "config", action, mode: parseAccessMode(args[1]) };
  }

  throw new Error(`unknown config action: ${action}`);
}

function parseAccessMode(value: string | undefined): "manual" | "confirm_on_retry" | "full_access" {
  if (value === "manual") {
    return "manual";
  }
  if (value === "confirm-on-retry" || value === "confirm_on_retry") {
    return "confirm_on_retry";
  }
  if (value === "full-access" || value === "full_access") {
    return "full_access";
  }
  throw new Error("config mode requires: manual, confirm-on-retry, or full-access");
}

function parseInstallArgs(args: string[]): CliCommand {
  const client = args[0];
  if (client !== "codex" && client !== "claude") {
    throw new Error("install requires client: codex or claude");
  }

  let configPath: string | undefined;
  let serverCommand: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--config-path") {
      configPath = requireValue(args, index, token);
      index += 1;
      continue;
    }
    if (token === "--command") {
      serverCommand = requireValue(args, index, token);
      index += 1;
      continue;
    }
    throw new Error(`unknown install option: ${token}`);
  }

  return { command: "install", client, configPath, serverCommand };
}

function parseCallArgs(args: string[]): CliCommand {
  const [tool, ...rest] = args;

  if (!tool || tool.startsWith("-")) {
    throw new Error("call requires a tool name");
  }

  let parsedArgs: unknown = {};
  let stdin = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--stdin") {
      stdin = true;
      continue;
    }

    if (token === "--args") {
      const rawJson = rest[index + 1];
      if (rawJson === undefined) {
        throw new Error("--args requires a JSON value");
      }
      parsedArgs = parseJsonArgs(rawJson);
      index += 1;
      continue;
    }

    throw new Error(`unknown call option: ${token}`);
  }

  return { command: "call", tool, args: parsedArgs, stdin };
}

function parseJsonArgs(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    throw new Error("invalid JSON for --args");
  }
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}
