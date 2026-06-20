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

  it("applies app policy to bundle identifiers and app names", () => {
    const policy = new PolicyEngine({
      apps: {
        allowed: ["com.apple.TextEdit"],
        denied: ["System Settings"],
        prompt: [],
      },
    });

    expect(policy.evaluateApp({ name: "TextEdit", bundle_id: "com.apple.TextEdit" })).toEqual({
      decision: "allowed",
    });
    expect(policy.evaluateApp({ bundle_id: "com.apple.SystemSettings" })).toEqual({
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

    expect(policy.evaluateApp({ name: "Preview", bundle_id: "com.apple.Preview" })).toEqual({
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
    expect(policy.evaluateAction({ tool: "type_text", text: "not secret", sensitive: true })).toEqual({
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

  it("allows ordinary click targets but requires approval for coordinate-only clicks", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "click", target: "Save" })).toEqual({
      decision: "allowed",
    });
    expect(policy.evaluateAction({ tool: "click" })).toEqual({
      decision: "approval_required",
      reason: "coordinate_click",
    });
  });

  it("requires approval for destructive key presses", () => {
    const policy = new PolicyEngine();

    expect(policy.evaluateAction({ tool: "press_key", key: "Delete" })).toEqual({
      decision: "approval_required",
      reason: "destructive_action",
    });
  });

  it("confirm-on-retry allows apps but requires a matching token for risky actions", () => {
    const policy = new PolicyEngine({
      access: { mode: "confirm_on_retry" },
      apps: {
        allowed: [],
        denied: ["System Settings"],
        prompt: [],
      },
    });

    expect(policy.evaluateApp("System Settings")).toEqual({ decision: "allowed" });

    const first = policy.evaluateAction({ tool: "click", target: "Delete account" });
    expect(first).toEqual({
      decision: "approval_required",
      reason: "destructive_action",
      confirmation_token: "confirm_destructive_action",
    });
    expect(policy.evaluateAction({ tool: "click", target: "Delete account", confirmation_token: "confirm_destructive_action" })).toEqual({
      decision: "allowed",
    });
  });

  it("full access allows all apps and risky actions", () => {
    const policy = new PolicyEngine({
      access: { mode: "full_access" },
      apps: {
        allowed: [],
        denied: ["System Settings"],
        prompt: [],
      },
    });

    expect(policy.evaluateApp("System Settings")).toEqual({ decision: "allowed" });
    expect(policy.evaluateAction({ tool: "click" })).toEqual({ decision: "allowed" });
    expect(policy.evaluateAction({ tool: "type_text", text: "sk-proj-abc123456789" })).toEqual({ decision: "allowed" });
    expect(policy.evaluateAction({ tool: "type_text", text: "not secret", sensitive: true })).toEqual({ decision: "allowed" });
    expect(policy.evaluateAction({ tool: "press_key", key: "Delete" })).toEqual({ decision: "allowed" });
  });
});
