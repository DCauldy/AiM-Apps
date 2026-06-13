import "server-only";

import { getStateRequirements } from "./state-requirements";
import type { PlatformProfile } from "@/types/platform-profile";

// ============================================================
// Send-time compliance gates.
//
// Two layers:
//
//   1) Per-run launch check (assertRunLaunchCompliance):
//      Called when the user moves a run from review → sending.
//      Validates the profile + connection + recipient list and
//      returns the structured failure to surface in the UI so the
//      run never enters the send queue in a non-compliant state.
//
//   2) Per-recipient send check (assertSendOk):
//      Called inside hl-send-one before dispatching a single
//      message. Catches edge cases the launch check can't —
//      connection paused after launch, recipient token went
//      missing, suppression added mid-send. Throws so the send
//      job fails loudly.
//
// We prefer to fail loud + early. Silent fallbacks (e.g. empty
// unsubscribe URL when token is missing) are CAN-SPAM violations
// the agent and AiM can both be liable for; better to error.
// ============================================================

export type ComplianceCode =
  | "missing_physical_address"
  | "missing_license_number"
  | "missing_brokerage"
  | "missing_supervising_broker"
  | "domain_not_verified"
  | "connection_paused"
  | "connection_inactive"
  | "no_unsubscribe_token";

export interface ComplianceIssue {
  code: ComplianceCode;
  message: string;
}

export class ComplianceError extends Error {
  readonly issues: ComplianceIssue[];
  constructor(issues: ComplianceIssue[]) {
    super(
      issues.length === 1
        ? issues[0].message
        : `${issues.length} compliance issues — fix in your profile and email connection settings`
    );
    this.name = "ComplianceError";
    this.issues = issues;
  }
}

interface RecipientForCheck {
  contact_email: string;
  unsubscribe_token: string | null;
}

interface LaunchCheckInput {
  profile: Pick<
    PlatformProfile,
    | "physical_address"
    | "license_number"
    | "brokerage"
    | "license_info"
    | "state"
  >;
  /** is_active + resend_dkim_status come from platform_email_connections;
   *  paused comes from app_email_connection_state. Callers join the two
   *  before passing them in. */
  connection: {
    is_active: boolean;
    paused: boolean;
    resend_dkim_status: "pending" | "verified" | "failed" | null;
  };
  recipients: RecipientForCheck[];
}

/**
 * Validate a run is safe to launch. Surfaces every issue at once so the
 * user sees the full list instead of fixing one and getting blocked again.
 */
export function checkRunLaunchCompliance(
  input: LaunchCheckInput
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const reqs = getStateRequirements(input.profile.state);

  // Profile checks
  if (!nonEmpty(input.profile.physical_address)) {
    issues.push({
      code: "missing_physical_address",
      message:
        "Your profile is missing a physical address. CAN-SPAM requires a valid postal address on every commercial email.",
    });
  }
  if (reqs.requires_license_number && !nonEmpty(input.profile.license_number)) {
    issues.push({
      code: "missing_license_number",
      message: `${reqs.display_name} real estate marketing must include your license number. Add it to your profile under Compliance.`,
    });
  }
  if (reqs.requires_brokerage_disclosure && !nonEmpty(input.profile.brokerage)) {
    issues.push({
      code: "missing_brokerage",
      message: `${reqs.display_name} requires your brokerage to be disclosed in marketing email. Add it to your profile.`,
    });
  }
  if (
    reqs.requires_supervising_broker &&
    !nonEmpty(input.profile.license_info)
  ) {
    issues.push({
      code: "missing_supervising_broker",
      message: `${reqs.display_name} requires your supervising / sponsoring broker info on agent marketing. Add it to the "License info" field on your profile.`,
    });
  }

  // Connection checks
  if (!input.connection.is_active) {
    issues.push({
      code: "connection_inactive",
      message:
        "Your Resend connection is inactive. Re-verify your sending domain under Settings → Email.",
    });
  }
  if (input.connection.paused) {
    issues.push({
      code: "connection_paused",
      message:
        "Your Resend connection is paused after a deliverability threshold trip. Review the connection under Settings → Email and resume it once the underlying issue is resolved.",
    });
  }
  if (input.connection.resend_dkim_status !== "verified") {
    issues.push({
      code: "domain_not_verified",
      message:
        "Your sending domain is not verified. DNS must show DKIM verified before any send can leave the building.",
    });
  }

  // Recipient checks
  const missingTokens = input.recipients.filter(
    (r) => !nonEmpty(r.unsubscribe_token)
  );
  if (missingTokens.length > 0) {
    issues.push({
      code: "no_unsubscribe_token",
      message: `${missingTokens.length} recipient(s) are missing an unsubscribe token. Regenerate the audience before approving.`,
    });
  }

  return issues;
}

/** Throwing variant of {@link checkRunLaunchCompliance}. */
export function assertRunLaunchCompliance(input: LaunchCheckInput): void {
  const issues = checkRunLaunchCompliance(input);
  if (issues.length > 0) throw new ComplianceError(issues);
}

interface PerSendCheckInput {
  /** is_active lives on platform_email_connections; paused on the
   *  per-app app_email_connection_state row. Callers pass the
   *  combined view so this gate doesn't know about the split. */
  connection: { is_active: boolean; paused: boolean };
  recipient: RecipientForCheck;
}

/**
 * Per-recipient gate called inside hl-send-one before dispatching. Throws
 * so the send job goes to status='failed' with a clear last_error rather
 * than silently shipping a non-compliant message.
 */
export function assertSendOk(input: PerSendCheckInput): void {
  const issues: ComplianceIssue[] = [];
  if (!input.connection.is_active) {
    issues.push({
      code: "connection_inactive",
      message: "Resend connection is inactive.",
    });
  }
  if (input.connection.paused) {
    issues.push({
      code: "connection_paused",
      message: "Resend connection is paused — refusing to send.",
    });
  }
  if (!nonEmpty(input.recipient.unsubscribe_token)) {
    issues.push({
      code: "no_unsubscribe_token",
      message: `Recipient ${input.recipient.contact_email} has no unsubscribe token — refusing to send.`,
    });
  }
  if (issues.length > 0) throw new ComplianceError(issues);
}

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}
