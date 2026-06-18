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

  it("requires approval for destructive click targets", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "click", target: "Delete account" })).toEqual({
      decision: "approval_required",
      reason: "destructive_action",
    });
    expect(policy.evaluateAction({ tool: "click", selector: { role: "AXButton", label: "Remove file" } })).toEqual({
      decision: "approval_required",
      reason: "destructive_action",
    });
  });

  it("requires approval for external or financial click targets", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "click", selector: { role: "AXButton", label: "Send email" } })).toEqual({
      decision: "approval_required",
      reason: "external_action",
    });
  });

  it("allows ordinary click targets and coordinate-only clicks", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "click", target: "Save" })).toEqual({
      decision: "allowed",
    });
    expect(policy.evaluateAction({ tool: "click" })).toEqual({
      decision: "allowed",
    });
  });

  it("requires approval for destructive key presses", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "press_key", key: "Delete" })).toEqual({
      decision: "approval_required",
      reason: "destructive_action",
    });
  });
});
