import { describe, expect, it } from "vitest";

import { PolicyEngine } from "../../src/core/policy.js";

describe("PolicyEngine", () => {
  it("denies apps listed in deny policy before allow policy", () => {
    const policy = new PolicyEngine({
      apps: {
        allowed: ["System Settings"],
        denied: ["System Settings"],
        prompt: [],
      },
    });

    expect(policy.evaluateApp("System Settings")).toEqual({
      decision: "denied",
      reason: "app_denied",
    });
  });

  it("allows explicitly allowed apps", () => {
    const policy = new PolicyEngine({
      apps: {
        allowed: ["TextEdit"],
        denied: [],
        prompt: [],
      },
    });

    expect(policy.evaluateApp("TextEdit")).toEqual({
      decision: "allowed",
    });
  });

  it("requires prompt for unspecified apps", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateApp("Preview")).toEqual({
      decision: "prompt_required",
      reason: "app_not_preapproved",
    });
  });

  it("requires approval for sensitive text", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "type_text", text: "sk-proj-abc123456789" })).toEqual({
      decision: "approval_required",
      reason: "sensitive_text",
    });
  });
});
