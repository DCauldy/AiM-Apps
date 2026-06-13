import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/hyperlocal/encryption";
import type {
  AppCrmConnection,
  AppCrmConnectionState,
  AppEmailConnection,
  AppEmailConnectionState,
  AppEmailConnectionStatePublic,
  AppSlug,
  CmaCrmFilterConfig,
  CmaEmailAppMetadata,
  HlCrmFilterConfig,
  HlEmailAppMetadata,
  PlatformCrmConnection,
  PlatformCrmConnectionPublic,
  PlatformEmailConnection,
  PlatformEmailConnectionPublic,
} from "@/types/platform-connections";
import type { CrmPlatform, EmailProvider } from "@/types/hyperlocal";

// ============================================================
// Shared helpers for platform_*_connections + app_*_connection_state.
//
// Both Hyperlocal and CMA call into these — the join, the auth-strip,
// the insert/upsert pairs all live here so route handlers stay short
// and the schema invariants stay in one place.
// ============================================================

const PLATFORM_CRM_PUBLIC = `
  id, user_id, profile_id, platform, label, base_url,
  is_active, created_at, updated_at
`;

const PLATFORM_EMAIL_PUBLIC = `
  id, user_id, profile_id, provider, email_address, display_name,
  resend_domain, resend_domain_id, resend_dkim_status,
  is_active, created_at, updated_at
`;

const APP_CRM_STATE_FIELDS = `
  id, connection_id, app, filter_config,
  last_synced_at, last_error, created_at, updated_at
`;

const APP_EMAIL_STATE_FIELDS = `
  id, connection_id, app, webhook_id, webhook_secret_encrypted,
  is_default, provider_metadata,
  last_send_at, last_error, paused, paused_reason, paused_at,
  created_at, updated_at
`;

// ---------------------------------------------------------------------------
// CRM — list / get / create / update / delete
// ---------------------------------------------------------------------------

/** List all CRM connections + per-app state for the given user/app.
 *  Profile-scoped when profileId is non-null. */
export async function listAppCrmConnections<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  profileId: string | null,
  app: App,
): Promise<AppCrmConnection<App>[]> {
  let q = service
    .from("app_crm_connection_state")
    .select(
      `${APP_CRM_STATE_FIELDS},
       platform_crm_connections!inner(${PLATFORM_CRM_PUBLIC})`,
    )
    .eq("app", app)
    .eq("platform_crm_connections.user_id", userId);
  if (profileId) q = q.eq("platform_crm_connections.profile_id", profileId);
  q = q.order("created_at", { ascending: false, referencedTable: "platform_crm_connections" });

  const { data } = await q;
  return mapJoinedCrmRows<App>((data ?? []) as RawJoinedCrm[], app);
}

/** Load one CRM connection + per-app state by connection id. Returns
 *  null when the row doesn't exist or doesn't belong to the user. */
export async function getAppCrmConnection<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  app: App,
  connectionId: string,
): Promise<AppCrmConnection<App> | null> {
  const { data } = await service
    .from("app_crm_connection_state")
    .select(
      `${APP_CRM_STATE_FIELDS},
       platform_crm_connections!inner(${PLATFORM_CRM_PUBLIC})`,
    )
    .eq("connection_id", connectionId)
    .eq("app", app)
    .eq("platform_crm_connections.user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return mapJoinedCrmRows<App>([data as RawJoinedCrm], app)[0] ?? null;
}

/** Load the underlying PlatformCrmConnection (auth blobs included) by
 *  id. Service-role only — used by the connector layer where the
 *  api_key needs to be decrypted. */
export async function getPlatformCrmConnection(
  service: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<PlatformCrmConnection | null> {
  const { data } = await service
    .from("platform_crm_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as PlatformCrmConnection | null;
}

export interface CreateAppCrmInput<App extends AppSlug> {
  userId: string;
  profileId: string;
  platform: CrmPlatform;
  label?: string | null;
  /** Raw API key — encrypted before insert. */
  apiKey?: string | null;
  baseUrl?: string | null;
  filterConfig: App extends "hyperlocal"
    ? HlCrmFilterConfig
    : CmaCrmFilterConfig;
}

/**
 * Create a fresh platform_crm_connections row + paired app_state row
 * in one round trip. Both inserts succeed or the platform row gets
 * cleaned up — Postgres doesn't give us a true transaction over
 * PostgREST, so the rollback is best-effort.
 */
export async function createAppCrmConnection<App extends AppSlug>(
  service: SupabaseClient,
  app: App,
  input: CreateAppCrmInput<App>,
): Promise<AppCrmConnection<App>> {
  const connInsert: Record<string, unknown> = {
    user_id: input.userId,
    profile_id: input.profileId,
    platform: input.platform,
    label: input.label ?? null,
    base_url: input.baseUrl ?? null,
  };
  if (input.apiKey && input.apiKey.trim().length > 0) {
    connInsert.api_key_encrypted = encrypt(input.apiKey.trim());
  }

  const { data: conn, error: connErr } = await service
    .from("platform_crm_connections")
    .insert(connInsert)
    .select("*")
    .single();
  if (connErr || !conn) {
    throw new Error(
      `Failed to create platform_crm_connection: ${connErr?.message}`,
    );
  }

  const { data: state, error: stateErr } = await service
    .from("app_crm_connection_state")
    .insert({
      connection_id: (conn as PlatformCrmConnection).id,
      app,
      filter_config: input.filterConfig as object,
    })
    .select(APP_CRM_STATE_FIELDS)
    .single();

  if (stateErr || !state) {
    // Best-effort rollback so a retry isn't stuck on the orphan.
    await service
      .from("platform_crm_connections")
      .delete()
      .eq("id", (conn as PlatformCrmConnection).id);
    throw new Error(`Failed to create app_crm_connection_state: ${stateErr?.message}`);
  }

  return mapJoinedCrmRows<App>(
    [
      {
        ...(state as Omit<RawJoinedCrm, "platform_crm_connections">),
        platform_crm_connections: stripCrmAuth(conn as PlatformCrmConnection),
      } as RawJoinedCrm,
    ],
    app,
  )[0];
}

export interface UpdateAppCrmInput<App extends AppSlug> {
  label?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  isActive?: boolean;
  filterConfig?: App extends "hyperlocal"
    ? HlCrmFilterConfig
    : CmaCrmFilterConfig;
}

/** Patch either the platform row, the app_state row, or both. Re-encrypts
 *  the api_key only when a non-empty value is provided. */
export async function updateAppCrmConnection<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  app: App,
  connectionId: string,
  input: UpdateAppCrmInput<App>,
): Promise<AppCrmConnection<App> | null> {
  const platformUpdate: Record<string, unknown> = {};
  if (input.label !== undefined) platformUpdate.label = input.label;
  if (input.baseUrl !== undefined) platformUpdate.base_url = input.baseUrl;
  if (input.isActive !== undefined) platformUpdate.is_active = input.isActive;
  if (input.apiKey && input.apiKey.trim().length > 0) {
    platformUpdate.api_key_encrypted = encrypt(input.apiKey.trim());
  }
  if (Object.keys(platformUpdate).length > 0) {
    platformUpdate.updated_at = new Date().toISOString();
    await service
      .from("platform_crm_connections")
      .update(platformUpdate)
      .eq("id", connectionId)
      .eq("user_id", userId);
  }

  if (input.filterConfig !== undefined) {
    await service
      .from("app_crm_connection_state")
      .update({
        filter_config: input.filterConfig as object,
        updated_at: new Date().toISOString(),
      })
      .eq("connection_id", connectionId)
      .eq("app", app);
  }

  return getAppCrmConnection(service, userId, app, connectionId);
}

/** Patch the app_state row's last_synced_at / last_error. The
 *  connector test/sync routes hit this. */
export async function setAppCrmSyncState(
  service: SupabaseClient,
  app: AppSlug,
  connectionId: string,
  input: { last_synced_at?: string | null; last_error?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.last_synced_at !== undefined)
    update.last_synced_at = input.last_synced_at;
  if (input.last_error !== undefined) update.last_error = input.last_error;
  await service
    .from("app_crm_connection_state")
    .update(update)
    .eq("connection_id", connectionId)
    .eq("app", app);
}

/** Drop the entire connection (both platform row + all app_state rows).
 *  Cascade is via the platform_crm_connections delete (state rows are
 *  ON DELETE CASCADE). */
export async function deletePlatformCrmConnection(
  service: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<void> {
  await service
    .from("platform_crm_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/** Detach one app from a connection without dropping the shared
 *  identity row — keeps it available to other apps. */
export async function detachAppCrmConnection(
  service: SupabaseClient,
  app: AppSlug,
  connectionId: string,
): Promise<void> {
  await service
    .from("app_crm_connection_state")
    .delete()
    .eq("connection_id", connectionId)
    .eq("app", app);
}

// ---------------------------------------------------------------------------
// Email — list / get / create / update / delete
// ---------------------------------------------------------------------------

export async function listAppEmailConnections<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  profileId: string | null,
  app: App,
): Promise<AppEmailConnection<App>[]> {
  let q = service
    .from("app_email_connection_state")
    .select(
      `${APP_EMAIL_STATE_FIELDS},
       platform_email_connections!inner(${PLATFORM_EMAIL_PUBLIC})`,
    )
    .eq("app", app)
    .eq("platform_email_connections.user_id", userId);
  if (profileId) q = q.eq("platform_email_connections.profile_id", profileId);
  q = q
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false, referencedTable: "platform_email_connections" });

  const { data } = await q;
  return mapJoinedEmailRows<App>((data ?? []) as RawJoinedEmail[], app);
}

export async function getAppEmailConnection<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  app: App,
  connectionId: string,
): Promise<AppEmailConnection<App> | null> {
  const { data } = await service
    .from("app_email_connection_state")
    .select(
      `${APP_EMAIL_STATE_FIELDS},
       platform_email_connections!inner(${PLATFORM_EMAIL_PUBLIC})`,
    )
    .eq("connection_id", connectionId)
    .eq("app", app)
    .eq("platform_email_connections.user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return mapJoinedEmailRows<App>([data as RawJoinedEmail], app)[0] ?? null;
}

/** Load the underlying PlatformEmailConnection (auth included) — used
 *  by the adapter layer where the encrypted api_key is decrypted. */
export async function getPlatformEmailConnection(
  service: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<PlatformEmailConnection | null> {
  const { data } = await service
    .from("platform_email_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as PlatformEmailConnection | null;
}

/** Load the per-app webhook secret (decrypted at call site). Used by
 *  the webhook ingesters. Includes the encrypted blob. */
export async function getAppEmailConnectionStateInternal(
  service: SupabaseClient,
  app: AppSlug,
  connectionId: string,
): Promise<AppEmailConnectionState | null> {
  const { data } = await service
    .from("app_email_connection_state")
    .select("*")
    .eq("connection_id", connectionId)
    .eq("app", app)
    .maybeSingle();
  return (data ?? null) as AppEmailConnectionState | null;
}

export interface CreateAppEmailInput<App extends AppSlug> {
  userId: string;
  profileId: string;
  provider: EmailProvider;
  emailAddress: string;
  displayName?: string | null;
  /** Resend-specific. */
  resendApiKey?: string | null;
  resendDomain?: string | null;
  resendDomainId?: string | null;
  resendDkimStatus?: "pending" | "verified" | "failed" | null;
  /** Generic provider key — non-Resend providers. */
  providerApiKey?: string | null;
  /** App-state fields. */
  isActive?: boolean;
  isDefault?: boolean;
  webhookId?: string | null;
  webhookSecret?: string | null;
  providerMetadata?: App extends "hyperlocal"
    ? HlEmailAppMetadata
    : CmaEmailAppMetadata;
}

export async function createAppEmailConnection<App extends AppSlug>(
  service: SupabaseClient,
  app: App,
  input: CreateAppEmailInput<App>,
): Promise<AppEmailConnection<App>> {
  const connInsert: Record<string, unknown> = {
    user_id: input.userId,
    profile_id: input.profileId,
    provider: input.provider,
    email_address: input.emailAddress,
    display_name: input.displayName ?? null,
    resend_domain: input.resendDomain ?? null,
    resend_domain_id: input.resendDomainId ?? null,
    resend_dkim_status: input.resendDkimStatus ?? null,
    is_active: input.isActive ?? false,
  };
  if (input.resendApiKey && input.resendApiKey.trim().length > 0) {
    connInsert.resend_api_key_encrypted = encrypt(input.resendApiKey.trim());
  }
  if (input.providerApiKey && input.providerApiKey.trim().length > 0) {
    connInsert.provider_api_key_encrypted = encrypt(input.providerApiKey.trim());
  }

  const { data: conn, error: connErr } = await service
    .from("platform_email_connections")
    .insert(connInsert)
    .select("*")
    .single();
  if (connErr || !conn) {
    throw new Error(
      `Failed to create platform_email_connection: ${connErr?.message}`,
    );
  }

  const stateInsert: Record<string, unknown> = {
    connection_id: (conn as PlatformEmailConnection).id,
    app,
    is_default: input.isDefault ?? false,
    webhook_id: input.webhookId ?? null,
    provider_metadata: input.providerMetadata ?? {},
  };
  if (input.webhookSecret && input.webhookSecret.trim().length > 0) {
    stateInsert.webhook_secret_encrypted = encrypt(input.webhookSecret.trim());
  }

  const { data: state, error: stateErr } = await service
    .from("app_email_connection_state")
    .insert(stateInsert)
    .select(APP_EMAIL_STATE_FIELDS)
    .single();

  if (stateErr || !state) {
    await service
      .from("platform_email_connections")
      .delete()
      .eq("id", (conn as PlatformEmailConnection).id);
    throw new Error(`Failed to create app_email_connection_state: ${stateErr?.message}`);
  }

  return mapJoinedEmailRows<App>(
    [
      {
        ...(state as Omit<RawJoinedEmail, "platform_email_connections">),
        platform_email_connections: stripEmailAuth(conn as PlatformEmailConnection),
      } as RawJoinedEmail,
    ],
    app,
  )[0];
}

export interface UpdateAppEmailStateInput<App extends AppSlug> {
  isDefault?: boolean;
  isActive?: boolean;
  paused?: boolean;
  pausedReason?: string | null;
  pausedAt?: string | null;
  lastSendAt?: string | null;
  lastError?: string | null;
  webhookId?: string | null;
  webhookSecret?: string | null;
  providerMetadata?: App extends "hyperlocal"
    ? HlEmailAppMetadata
    : CmaEmailAppMetadata;
}

/** Patch the per-app state row. is_default = true demotes sibling
 *  defaults under the same app for the connection's owning user. */
export async function updateAppEmailState<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  app: App,
  connectionId: string,
  input: UpdateAppEmailStateInput<App>,
): Promise<AppEmailConnection<App> | null> {
  if (input.isDefault === true) {
    // Demote any sibling defaults under this user + app. Cross-table
    // filter goes through a subselect since PostgREST can't apply a
    // .eq on a joined col in an UPDATE.
    const { data: siblings } = await service
      .from("app_email_connection_state")
      .select(
        `id, connection_id,
         platform_email_connections!inner(user_id)`,
      )
      .eq("app", app)
      .eq("is_default", true)
      .neq("connection_id", connectionId)
      .eq("platform_email_connections.user_id", userId);
    const siblingIds = (siblings ?? []).map((s) => (s as { id: string }).id);
    if (siblingIds.length > 0) {
      await service
        .from("app_email_connection_state")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .in("id", siblingIds);
    }
  }

  const stateUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.isDefault !== undefined) stateUpdate.is_default = input.isDefault;
  if (input.paused !== undefined) stateUpdate.paused = input.paused;
  if (input.pausedReason !== undefined)
    stateUpdate.paused_reason = input.pausedReason;
  if (input.pausedAt !== undefined) stateUpdate.paused_at = input.pausedAt;
  if (input.lastSendAt !== undefined)
    stateUpdate.last_send_at = input.lastSendAt;
  if (input.lastError !== undefined) stateUpdate.last_error = input.lastError;
  if (input.webhookId !== undefined) stateUpdate.webhook_id = input.webhookId;
  if (input.webhookSecret !== undefined) {
    stateUpdate.webhook_secret_encrypted = input.webhookSecret
      ? encrypt(input.webhookSecret)
      : null;
  }
  if (input.providerMetadata !== undefined)
    stateUpdate.provider_metadata = input.providerMetadata;

  await service
    .from("app_email_connection_state")
    .update(stateUpdate)
    .eq("connection_id", connectionId)
    .eq("app", app);

  // Connection-level is_active flip when the state is_active changes.
  // We don't model an app-level is_active on the state row; the
  // is_active on the platform table gates send across all apps.
  if (input.isActive !== undefined) {
    await service
      .from("platform_email_connections")
      .update({
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("user_id", userId);
  }

  return getAppEmailConnection(service, userId, app, connectionId);
}

/** Drop the whole email connection (cascades app_state). */
export async function deletePlatformEmailConnection(
  service: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<void> {
  await service
    .from("platform_email_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);
}

export async function detachAppEmailConnection(
  service: SupabaseClient,
  app: AppSlug,
  connectionId: string,
): Promise<void> {
  await service
    .from("app_email_connection_state")
    .delete()
    .eq("connection_id", connectionId)
    .eq("app", app);
}

/** Get the default email connection for an app — the cadence
 *  scheduler / send paths call this when no explicit connection is
 *  specified on the run. */
export async function getDefaultAppEmailConnection<App extends AppSlug>(
  service: SupabaseClient,
  userId: string,
  profileId: string | null,
  app: App,
): Promise<AppEmailConnection<App> | null> {
  let q = service
    .from("app_email_connection_state")
    .select(
      `${APP_EMAIL_STATE_FIELDS},
       platform_email_connections!inner(${PLATFORM_EMAIL_PUBLIC})`,
    )
    .eq("app", app)
    .eq("is_default", true)
    .eq("platform_email_connections.is_active", true)
    .eq("platform_email_connections.user_id", userId)
    .limit(1);
  if (profileId) q = q.eq("platform_email_connections.profile_id", profileId);

  const { data } = await q;
  const rows = mapJoinedEmailRows<App>((data ?? []) as RawJoinedEmail[], app);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Internal — row mappers
// ---------------------------------------------------------------------------

type RawJoinedCrm = {
  id: string;
  connection_id: string;
  app: AppSlug;
  filter_config: Record<string, unknown>;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  platform_crm_connections:
    | PlatformCrmConnectionPublic
    | PlatformCrmConnectionPublic[];
};

type RawJoinedEmail = {
  id: string;
  connection_id: string;
  app: AppSlug;
  webhook_id: string | null;
  webhook_secret_encrypted: string | null;
  is_default: boolean;
  provider_metadata: Record<string, unknown>;
  last_send_at: string | null;
  last_error: string | null;
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
  platform_email_connections:
    | PlatformEmailConnectionPublic
    | PlatformEmailConnectionPublic[];
};

function mapJoinedCrmRows<App extends AppSlug>(
  rows: RawJoinedCrm[],
  app: App,
): AppCrmConnection<App>[] {
  return rows.map((r) => {
    const conn = Array.isArray(r.platform_crm_connections)
      ? r.platform_crm_connections[0]
      : r.platform_crm_connections;
    // Cast through unknown — the filter_config shape is App-specific
    // and the DB returns the raw JSONB. Application code refines after
    // checking the app discriminator.
    const state = {
      id: r.id,
      connection_id: r.connection_id,
      app,
      filter_config: r.filter_config,
      last_synced_at: r.last_synced_at,
      last_error: r.last_error,
      created_at: r.created_at,
      updated_at: r.updated_at,
    } as unknown as Extract<AppCrmConnectionState, { app: App }>;
    return { connection: conn, state };
  });
}

function mapJoinedEmailRows<App extends AppSlug>(
  rows: RawJoinedEmail[],
  app: App,
): AppEmailConnection<App>[] {
  return rows.map((r) => {
    const conn = Array.isArray(r.platform_email_connections)
      ? r.platform_email_connections[0]
      : r.platform_email_connections;
    const state: AppEmailConnectionStatePublic = {
      id: r.id,
      connection_id: r.connection_id,
      app,
      webhook_id: r.webhook_id,
      webhook_secret_set: !!r.webhook_secret_encrypted,
      is_default: r.is_default,
      provider_metadata: r.provider_metadata,
      last_send_at: r.last_send_at,
      last_error: r.last_error,
      paused: r.paused,
      paused_reason: r.paused_reason,
      paused_at: r.paused_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    } as AppEmailConnectionStatePublic;
    return {
      connection: conn,
      state: state as Extract<AppEmailConnectionStatePublic, { app: App }>,
    };
  });
}

function stripCrmAuth(
  conn: PlatformCrmConnection,
): PlatformCrmConnectionPublic {
  // Avoid the unused-binding lint by using `void` on each field
  // we deliberately drop. Compiles to a no-op.
  const {
    api_key_encrypted: _k,
    oauth_access_token_encrypted: _a,
    oauth_refresh_token_encrypted: _r,
    ...rest
  } = conn;
  void _k;
  void _a;
  void _r;
  return rest;
}

function stripEmailAuth(
  conn: PlatformEmailConnection,
): PlatformEmailConnectionPublic {
  const {
    resend_api_key_encrypted: _r,
    provider_api_key_encrypted: _p,
    provider_oauth_access_token_encrypted: _a,
    provider_oauth_refresh_token_encrypted: _f,
    ...rest
  } = conn;
  void _r;
  void _p;
  void _a;
  void _f;
  return rest;
}
