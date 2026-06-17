import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureHelper = join(testDir, "../fixtures/runtime-helper.mjs");

describe("RuntimeClient", () => {
  let client: RuntimeClient | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("sends runtime.ping over JSON lines and returns the helper result", async () => {
    client = new RuntimeClient({
      command: process.execPath,
      args: [fixtureHelper],
    });

    const result = await client.request("runtime.ping", {});

    expect(result).toMatchObject({
      version: "0.1.0-test",
      platform: "macos",
    });
    expect(result).toHaveProperty("pid");
  });

  it("turns helper errors into JavaScript errors", async () => {
    client = new RuntimeClient({
      command: process.execPath,
      args: [fixtureHelper],
    });

    await expect(client.request("missing.method", {})).rejects.toThrow(
      "Unknown method: missing.method",
    );
  });
});
