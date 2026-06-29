import "server-only";

import {
  escapeHtml,
  getPlatformAppUrl,
  renderBrandedEmail,
} from "@/lib/platform/email/branded-template";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  createServiceRoleTourRenderRepository,
  type TourRenderRepository,
  type TourRenderRun,
} from "@/lib/tours/rendering/repositories/tour-render.repository";
import { Resend } from "resend";

const DEFAULT_FROM_EMAIL = "AiM Tours <tours@aimarketingacademy.com>";

let cachedClient: Resend | null = null;

function getFromEmail(): string {
  return process.env.PLATFORM_RESEND_FROM ?? DEFAULT_FROM_EMAIL;
}

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const key = process.env.PLATFORM_RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "PLATFORM_RESEND_API_KEY not configured. Set it in .env.local to enable Tours render emails."
    );
  }
  cachedClient = new Resend(key);
  return cachedClient;
}

export type TourRenderReadyEmailPayload = {
  userId: string;
  projectId: string;
  renderRunId: string;
  resultAssetId: string;
};

export type TourRenderReadyProject = {
  id: string;
  userId: string;
  name: string;
  propertyAddress: string;
};

export type TourRenderReadyRecipient = {
  email: string | null;
  name: string | null;
};

export type TourRenderReadyEmailMessage = {
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
};

export type TourRenderReadyEmailSendResult =
  | { sent: true; toEmail: string }
  | { sent: false; skippedReason: string };

type LoggerLike = {
  error(message: string, details?: Record<string, unknown>): void;
};

export function renderTourRenderReadyEmail(args: {
  projectId: string;
  projectName: string;
  propertyAddress: string;
}): TourRenderReadyEmailMessage {
  const appUrl = getPlatformAppUrl();
  const ctaUrl = `${appUrl}/apps/tours/projects/${args.projectId}/rendering`;
  const subject = "Your tour video is ready";
  const preheader = `${args.projectName} is ready to download from your Tours render screen.`;
  const html = renderBrandedEmail({
    preheader,
    eyebrow: "AiM Tours",
    title: "Your tour video is ready",
    body: `
      <p style="margin:0 0 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#1A2A3A;">
        Your finished tour video for <strong style="color:#1A2A3A;">${escapeHtml(args.projectName)}</strong> is ready.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border-collapse:separate;border-spacing:0;border:1px solid #E5EBEC;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background:#F5F9F9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;width:130px;border-bottom:1px solid #E5EBEC;">Project</td>
          <td style="padding:12px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#1A2A3A;border-bottom:1px solid #E5EBEC;"><strong>${escapeHtml(args.projectName)}</strong></td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#F5F9F9;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0F7A6F;">Address</td>
          <td style="padding:12px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#3D4E5C;">${escapeHtml(args.propertyAddress)}</td>
        </tr>
      </table>
      <p style="margin:0 0 20px;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.65;color:#3D4E5C;">
        Open the render screen to preview the final video and grab a fresh download link.
      </p>
    `,
    ctaLabel: "Open render screen",
    ctaUrl,
    appUrl,
  });

  const text = [
    "Your tour video is ready",
    "",
    `Project: ${args.projectName}`,
    `Address: ${args.propertyAddress}`,
    "",
    "Open the render screen to preview the final video and grab a fresh download link:",
    ctaUrl,
  ].join("\n");

  return { subject, html, text, ctaUrl };
}

export async function sendTourRenderReadyEmail(args: {
  toEmail: string;
  userId: string;
  projectId: string;
  renderRunId: string;
  projectName: string;
  propertyAddress: string;
}): Promise<void> {
  const message = renderTourRenderReadyEmail({
    projectId: args.projectId,
    projectName: args.projectName,
    propertyAddress: args.propertyAddress,
  });

  const result = await getClient().emails.send(
    {
      from: getFromEmail(),
      to: args.toEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
    },
    {
      idempotencyKey: `tour-render-ready:${args.renderRunId}:${args.userId}`,
    }
  );

  if (result.error) {
    throw new Error(`Resend failed to send tour render email: ${result.error.message}`);
  }
}

export async function loadTourRenderReadyProject(input: {
  projectId: string;
  userId: string;
}): Promise<TourRenderReadyProject | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("tours_projects")
    .select("id,user_id,name,property_address")
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .maybeSingle<{
      id: string;
      user_id: string;
      name: string;
      property_address: string;
    }>();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    propertyAddress: data.property_address,
  };
}

export async function loadTourRenderReadyRecipient(input: {
  userId: string;
}): Promise<TourRenderReadyRecipient | null> {
  const supabase = createServiceRoleClient();
  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(input.userId);

  if (authError || !authData.user) return null;

  const email = authData.user.email?.trim() ?? "";
  if (!email) {
    return {
      email: null,
      name: null,
    };
  }

  const metadataName = getAuthUserDisplayName(authData.user.user_metadata);
  if (metadataName) {
    return {
      email,
      name: metadataName,
    };
  }

  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", input.userId)
    .maybeSingle<{ full_name: string | null }>();

  return {
    email,
    name: data?.full_name ?? null,
  };
}

function getAuthUserDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const values = metadata as Record<string, unknown>;
  const displayName = values.full_name ?? values.name;
  if (typeof displayName !== "string") return null;
  return displayName.trim() || null;
}

export async function sendTourRenderReadyEmailForCompletedRun(
  payload: TourRenderReadyEmailPayload,
  deps: {
    repository?: Pick<TourRenderRepository, "getRenderRun">;
    loadProject?: (input: {
      projectId: string;
      userId: string;
    }) => Promise<TourRenderReadyProject | null>;
    loadRecipient?: (input: {
      userId: string;
    }) => Promise<TourRenderReadyRecipient | null>;
    sendEmail?: typeof sendTourRenderReadyEmail;
  } = {}
): Promise<TourRenderReadyEmailSendResult> {
  const repository = deps.repository ?? createServiceRoleTourRenderRepository();
  const run = await repository.getRenderRun({
    runId: payload.renderRunId,
    projectId: payload.projectId,
    userId: payload.userId,
  });

  const skipReason = getRenderReadyEmailSkipReason(run, payload);
  if (skipReason) {
    return { sent: false, skippedReason: skipReason };
  }

  const loadProject = deps.loadProject ?? loadTourRenderReadyProject;
  const project = await loadProject({
    projectId: payload.projectId,
    userId: payload.userId,
  });
  if (!project) {
    return { sent: false, skippedReason: "project_missing" };
  }

  const loadRecipient = deps.loadRecipient ?? loadTourRenderReadyRecipient;
  const recipient = await loadRecipient({ userId: payload.userId });
  const toEmail = recipient?.email?.trim() ?? "";
  if (!toEmail) {
    return { sent: false, skippedReason: "missing_profile_email" };
  }

  const sendEmail = deps.sendEmail ?? sendTourRenderReadyEmail;
  await sendEmail({
    toEmail,
    userId: payload.userId,
    projectId: payload.projectId,
    renderRunId: payload.renderRunId,
    projectName: project.name,
    propertyAddress: project.propertyAddress,
  });

  return { sent: true, toEmail };
}

export async function enqueueTourRenderReadyEmailAfterCompletion(args: {
  run: Pick<TourRenderRun, "status" | "resultAssetId"> | null | undefined;
  payload: TourRenderReadyEmailPayload;
  triggerEmailTask: (
    payload: TourRenderReadyEmailPayload,
    options: {
      idempotencyKey: string;
      concurrencyKey: string;
      tags: string[];
    }
  ) => Promise<unknown>;
  logger?: LoggerLike;
  logContext?: Record<string, unknown>;
}): Promise<{ enqueued: boolean; skippedReason?: string }> {
  const skipReason = getRenderReadyEmailSkipReason(args.run, args.payload);
  if (skipReason) {
    return { enqueued: false, skippedReason: skipReason };
  }

  try {
    await args.triggerEmailTask(args.payload, {
      idempotencyKey: `tour-render-ready-email:${args.payload.renderRunId}`,
      concurrencyKey: `tour-render-ready-email:${args.payload.userId}`,
      tags: [
        `user:${args.payload.userId}`,
        `tour-project:${args.payload.projectId}`,
        `tour-render:${args.payload.renderRunId}`,
        "tour-render-ready-email",
      ],
    });
    return { enqueued: true };
  } catch (error) {
    args.logger?.error("Tours render-ready email enqueue failed.", {
      ...args.logContext,
      projectId: args.payload.projectId,
      renderRunId: args.payload.renderRunId,
      userId: args.payload.userId,
      error,
    });
    return { enqueued: false, skippedReason: "enqueue_failed" };
  }
}

function getRenderReadyEmailSkipReason(
  run: Pick<TourRenderRun, "status" | "resultAssetId"> | null | undefined,
  payload: TourRenderReadyEmailPayload
): string | null {
  if (!run) {
    return "render_run_missing";
  }
  if (run.status !== "completed") {
    return `render_${run.status}`;
  }
  if (!run.resultAssetId) {
    return "missing_result_asset";
  }
  if (run.resultAssetId !== payload.resultAssetId) {
    return "result_asset_mismatch";
  }
  return null;
}
