import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "runtime.ping") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          version: "0.1.0-test",
          platform: "macos",
          pid: process.pid,
        },
      })}\n`,
    );
    return;
  }

  if (request.method === "runtime.sleep") {
    setTimeout(() => {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            slept_ms: request.params?.ms ?? 0,
          },
        })}\n`,
      );
    }, request.params?.ms ?? 0);
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: "method_not_found",
        message: `Unknown method: ${request.method}`,
      },
    })}\n`,
  );
});
