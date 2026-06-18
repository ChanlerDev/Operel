import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";

export type ArtifactKind = "screenshot" | "accessibility_tree" | "audit";

export type FileArtifactInput = {
  session_id: string;
  kind: ArtifactKind;
  source_path: string;
  extension: string;
  mime_type: string;
};

export type Artifact = {
  artifact_id: string;
  session_id: string;
  kind: ArtifactKind;
  uri: string;
  path: string;
  mime_type: string;
};

export type ArtifactStoreOptions = {
  root?: string;
  id?: () => string;
};

export class ArtifactStore {
  private readonly root: string;
  private readonly id: () => string;

  constructor(options: ArtifactStoreOptions = {}) {
    this.root = options.root ?? join(process.env.HOME ?? process.cwd(), ".operel/computer-use");
    this.id = options.id ?? (() => randomUUID());
  }

  saveFileArtifact(input: FileArtifactInput): Artifact {
    const artifactId = `artifact_${this.id()}`;
    const extension = input.extension.replace(/^\./, "");
    const sessionDir = join(this.root, "sessions", input.session_id, "artifacts");
    const path = join(sessionDir, `${artifactId}.${extension}`);

    mkdirSync(sessionDir, { recursive: true });
    copyFileSync(input.source_path, path);

    return {
      artifact_id: artifactId,
      session_id: input.session_id,
      kind: input.kind,
      uri: `operel://sessions/${input.session_id}/artifacts/${artifactId}`,
      path,
      mime_type: input.mime_type || mimeTypeForExtension(basename(path)),
    };
  }
}

function mimeTypeForExtension(path: string): string {
  if (path.endsWith(".png")) {
    return "image/png";
  }
  if (path.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}
