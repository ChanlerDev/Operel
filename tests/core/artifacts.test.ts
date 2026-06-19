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

  it("can move temporary file artifacts into managed storage", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-artifacts-move-"));
    const source = join(root, "source.png");
    writeFileSync(source, "png-bytes");
    const store = new ArtifactStore({
      root,
      id: () => "moved",
    });

    const artifact = store.moveFileArtifact({
      session_id: "sess_123",
      kind: "screenshot",
      source_path: source,
      extension: "png",
      mime_type: "image/png",
    });

    expect(existsSync(source)).toBe(false);
    expect(readFileSync(artifact.path, "utf8")).toBe("png-bytes");
  });

  it("uses OPEREL_COMPUTER_USE_HOME as the default root", () => {
    const previous = process.env.OPEREL_COMPUTER_USE_HOME;
    const root = mkdtempSync(join(tmpdir(), "operel-artifacts-env-"));
    process.env.OPEREL_COMPUTER_USE_HOME = root;

    try {
      const source = join(root, "source.png");
      writeFileSync(source, "png-bytes");
      const store = new ArtifactStore({
        id: () => "envid",
      });

      const artifact = store.saveFileArtifact({
        session_id: "sess_env",
        kind: "screenshot",
        source_path: source,
        extension: "png",
        mime_type: "image/png",
      });

      expect(artifact.path).toContain(root);
    } finally {
      if (previous === undefined) {
        delete process.env.OPEREL_COMPUTER_USE_HOME;
      } else {
        process.env.OPEREL_COMPUTER_USE_HOME = previous;
      }
    }
  });

  it("rejects path traversal identifiers before writing artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-artifacts-traversal-"));
    const source = join(root, "source.png");
    writeFileSync(source, "png-bytes");
    const store = new ArtifactStore({
      root,
      id: () => "../escape",
    });

    expect(() =>
      store.saveFileArtifact({
        session_id: "sess_../../escape",
        kind: "screenshot",
        source_path: source,
        extension: "../png",
        mime_type: "image/png",
      }),
    ).toThrow(/invalid/);
  });
});
