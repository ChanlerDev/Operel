export type CliCommand =
  | { command: "help" }
  | { command: "mcp" }
  | { command: "doctor"; json: boolean }
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

  throw new Error(`unknown command: ${command}`);
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
