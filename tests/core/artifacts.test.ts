import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { ArtifactStore } from "../../src/core/artifacts.js";

describe("ArtifactStore", () => {
  it("copies screenshot artifacts into the session directory", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-artifacts-"));
    const source = join(root, "source.png");
    writeFileSync(source, "png-bytes");
    const store = new ArtifactStore({
      root,
      id: () => "artifactid",
    });

    const artifact = store.saveFileArtifact({
      session_id: "sess_123",
      kind: "screenshot",
      source_path: source,
      extension: "png",
      mime_type: "image/png",
    });

    expect(artifact).toMatchObject({
      artifact_id: "artifact_artifactid",
      uri: "operel://sessions/sess_123/artifacts/artifact_artifactid",
      mime_type: "image/png",
      kind: "screenshot",
    });
    expect(existsSync(artifact.path)).toBe(true);
    expect(readFileSync(artifact.path, "utf8")).toBe("png-bytes");
  });
});
