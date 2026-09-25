export const CHECK_RESULTS = ["pass", "fail", "na"] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Whether a rule runs on live URLs, uploaded code, or both. */
export const APPLIES_TO = ["url", "code", "both"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];

export const INPUT_TYPES = ["url", "code"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

export const ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];
