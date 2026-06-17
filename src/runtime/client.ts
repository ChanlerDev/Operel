import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

export type RuntimeClientOptions = {
  command: string;
  args?: string[];
  requestTimeoutMs?: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type RuntimeResponse =
  | { jsonrpc: "2.0"; id: string; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string;
      error: { code: string; message: string; details?: unknown };
    };

export class RuntimeClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: Interface;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private nextId = 1;

  constructor(options: RuntimeClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.child = spawn(options.command, options.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.lines = createInterface({
      input: this.child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    this.lines.on("line", (line) => this.handleLine(line));
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code, signal) => {
      this.rejectAll(new Error(`runtime helper exited: code=${code ?? "null"} signal=${signal ?? "null"}`));
    });
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = `req_${this.nextId}`;
    this.nextId += 1;

    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`runtime request timed out: ${method}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${message}\n`, (error) => {
        if (error) {
          const pending = this.pending.get(id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pending.delete(id);
            pending.reject(error);
          }
        }
      });
    });
  }

  async close(): Promise<void> {
    this.lines.close();
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("runtime client closed"));
      this.pending.delete(id);
    }

    if (!this.child.killed) {
      this.child.kill();
    }
  }

  private handleLine(line: string): void {
    let response: RuntimeResponse;
    try {
      response = JSON.parse(line) as RuntimeResponse;
    } catch {
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if ("error" in response) {
      pending.reject(new Error(response.error.message));
      return;
    }

    pending.resolve(response.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
