export type AppPolicyConfig = {
  access?: {
    mode?: AccessMode;
  };
  apps?: {
    allowed?: string[];
    denied?: string[];
    prompt?: string[];
  };
};

export type AccessMode = "manual" | "confirm_on_retry" | "full_access";

export type PolicyDecision =
  | { decision: "allowed"; reason?: undefined }
  | { decision: "denied"; reason: string }
  | { decision: "prompt_required"; reason: string }
  | { decision: "approval_required"; reason: string; confirmation_token?: string };

export type ActionPolicyInput = {
  tool: string;
  text?: string;
  sensitive?: boolean;
  target?: string;
  selector?: {
    role?: string;
    label?: string;
    value?: string;
  };
  key?: string;
  modifiers?: string[];
  confirmation_token?: string;
};

export type AppPolicyTarget =
  | string
  | {
      name?: string;
      bundle_id?: string;
    };

export class PolicyEngine {
  private readonly mode: AccessMode;
  private readonly allowed: Set<string>;
  private readonly denied: Set<string>;
  private readonly prompt: Set<string>;

  constructor(config: AppPolicyConfig = {}) {
    this.mode = config.access?.mode ?? "manual";
    this.allowed = new Set(config.apps?.allowed ?? []);
    this.denied = new Set(config.apps?.denied ?? []);
    this.prompt = new Set(config.apps?.prompt ?? []);
  }

  evaluateApp(app: AppPolicyTarget): PolicyDecision {
    if (this.mode === "confirm_on_retry" || this.mode === "full_access") {
      return { decision: "allowed" };
    }

    const candidates = appPolicyCandidates(app);
    if (candidates.some((candidate) => this.denied.has(candidate))) {
      return { decision: "denied", reason: "app_denied" };
    }

    if (candidates.some((candidate) => this.allowed.has(candidate))) {
      return { decision: "allowed" };
    }

    if (candidates.some((candidate) => this.prompt.has(candidate))) {
      return { decision: "prompt_required", reason: "app_requires_prompt" };
    }

    return { decision: "prompt_required", reason: "app_not_preapproved" };
  }

  evaluateAction(input: ActionPolicyInput): PolicyDecision {
    if (this.mode === "full_access") {
      return { decision: "allowed" };
    }

    if (input.sensitive || (input.text && looksSensitive(input.text))) {
      return approvalDecision("sensitive_text", input, this.mode);
    }

    if (input.tool === "click") {
      const targetText = [input.target, input.selector?.label, input.selector?.value].filter(isNonEmptyString).join(" ");
      if (!targetText) {
        return approvalDecision("coordinate_click", input, this.mode);
      }
      if (looksDestructive(targetText)) {
        return approvalDecision("destructive_action", input, this.mode);
      }
      if (looksExternalOrFinancial(targetText)) {
        return approvalDecision("external_action", input, this.mode);
      }
    }

    if (input.tool === "press_key" && isDestructiveShortcut(input.key, input.modifiers)) {
      return approvalDecision("destructive_action", input, this.mode);
    }

    return { decision: "allowed" };
  }

  confirmationToken(reason: string): string {
    return confirmationTokenForReason(reason);
  }

  accessMode(): AccessMode {
    return this.mode;
  }
}

function approvalDecision(reason: string, input: ActionPolicyInput, mode: AccessMode): PolicyDecision {
  const confirmationToken = confirmationTokenForReason(reason);
  if (mode === "confirm_on_retry" && input.confirmation_token === confirmationToken) {
    return { decision: "allowed" };
  }

  const decision: PolicyDecision = {
    decision: "approval_required",
    reason,
  };
  return mode === "confirm_on_retry" ? { ...decision, confirmation_token: confirmationToken } : decision;
}

function confirmationTokenForReason(reason: string): string {
  return `confirm_${reason}`;
}

function appPolicyCandidates(target: AppPolicyTarget): string[] {
  const raw =
    typeof target === "string"
      ? [target]
      : [target.name, target.bundle_id, defaultNameForBundleId(target.bundle_id)].filter(isNonEmptyString);
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))];
}

function defaultNameForBundleId(bundleId: string | undefined): string | undefined {
  switch (bundleId) {
    case "com.apple.SystemSettings":
      return "System Settings";
    case "com.apple.keychainaccess":
      return "Keychain Access";
    default:
      return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function looksSensitive(text: string): boolean {
  const patterns = [
    /sk-[a-z0-9_-]{8,}/i,
    /sk-proj-[a-z0-9_-]{8,}/i,
    /api[_-]?key/i,
    /password/i,
    /token/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function looksDestructive(text: string): boolean {
  return /(^|\b)(delete|remove|erase|discard|reset|format|terminate|revoke|disable|destroy|drop|truncate)(\b|$)/i.test(
    text,
  );
}

function looksExternalOrFinancial(text: string): boolean {
  return /(^|\b)(send|share|post|publish|email|pay|buy|purchase|checkout|transfer|submit)(\b|$)/i.test(text);
}

function isDestructiveShortcut(key: string | undefined, modifiers: string[] | undefined): boolean {
  const normalizedKey = key?.trim().toLocaleLowerCase();
  const normalizedModifiers = new Set((modifiers ?? []).map((modifier) => modifier.trim().toLocaleLowerCase()));
  if (!normalizedKey) {
    return false;
  }

  return (
    normalizedKey === "delete" ||
    normalizedKey === "backspace" ||
    (normalizedModifiers.has("cmd") && (normalizedKey === "delete" || normalizedKey === "backspace"))
  );
}
