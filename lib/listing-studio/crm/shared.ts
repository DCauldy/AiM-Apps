import type { HlCrmConnection, NormalizedContact } from "@/types/hyperlocal";
import type { CmaClientCandidate, CmaCrmConnection } from "@/types/cma";

// ============================================================
// Shared helpers for the CMA CRM connector wrappers.
//
// The Hyperlocal CRM connectors take HlCrmConnection. The CMA app
// stores its own CmaCrmConnection rows that don't carry Hyperlocal's
// search_area_* fields. `toHlShim` synthesizes the minimum HlCrmConnection
// shape needed by the Hyperlocal connector so we can reuse all the
// pagination + auth + HTTP code without duplicating it.
//
// `pastClientFilter` applies the agent's stage-or-tag rule from the
// CmaCrmConnection. `toCandidate` reshapes the surviving
// NormalizedContact into a CmaClientCandidate ready for cma_clients
// upsert — drops anyone without a usable address.
// ============================================================

/**
 * Adapt a CmaCrmConnection to the HlCrmConnection shape that the
 * Hyperlocal connector expects. We pass through every field the
 * connector might read: auth blobs, base_url, the boilerplate metadata
 * fields. `search_area_*` go to "none" since the CMA app doesn't use
 * search areas — those are a Hyperlocal-only concept.
 */
export function toHlShim(c: CmaCrmConnection): HlCrmConnection {
  return {
    id: c.id,
    user_id: c.user_id,
    platform: c.platform,
    label: c.label ?? null,
    api_key_encrypted: c.api_key_encrypted ?? null,
    oauth_access_token_encrypted: c.oauth_access_token_encrypted ?? null,
    oauth_refresh_token_encrypted: c.oauth_refresh_token_encrypted ?? null,
    oauth_expires_at: c.oauth_expires_at ?? null,
    base_url: c.base_url ?? null,
    column_mapping: null,
    search_area_source: "none",
    search_area_column: null,
    search_area_tag_pattern: null,
    is_active: c.is_active,
    last_synced_at: c.last_synced_at,
    last_error: c.last_error,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

/**
 * Test whether a contact matches the agent's past-client filter.
 *
 * `source = "all"` — every contact qualifies
 * `source = "tag"` — value must appear in the contact's tag list
 *                    (case-insensitive)
 * `source = "stage"` — contact's raw_stage must equal the value
 *                      (case-insensitive). Drops contacts the provider
 *                      didn't expose a stage for.
 * `source = null` — be conservative; nothing qualifies until configured
 */
export function pastClientFilter(
  source: CmaCrmConnection["past_client_source"],
  value: CmaCrmConnection["past_client_value"],
): (c: NormalizedContact) => boolean {
  if (source === "all") return () => true;
  if (!source || !value) return () => false;
  const v = value.trim().toLowerCase();
  if (source === "tag") {
    return (c) => c.tags.some((t) => t.trim().toLowerCase() === v);
  }
  // source === "stage"
  return (c) => (c.raw_stage ?? "").trim().toLowerCase() === v;
}

/**
 * Build a single-line address string from the CRM's component parts.
 * Returns null when the address is too sparse to be useful (no street
 * AND no city = nothing to look up).
 */
function composeAddress(
  parts: NonNullable<NormalizedContact["home_address"]>,
): { display: string; normalized: string } | null {
  const street = parts.street?.trim() ?? "";
  const city = parts.city?.trim() ?? "";
  const state = parts.state?.trim() ?? "";
  const zip = parts.zip?.trim() ?? "";

  if (!street && !city) return null;

  const pieces: string[] = [];
  if (street) pieces.push(street);
  if (city) pieces.push(city);
  if (state || zip) pieces.push([state, zip].filter(Boolean).join(" "));

  const display = pieces.join(", ");
  const normalized = display.toLowerCase().replace(/\s+/g, " ").trim();
  return { display, normalized };
}

/**
 * Reshape a Hyperlocal NormalizedContact into a CMA candidate. Returns
 * null when the contact lacks a usable address — the CMA product
 * fundamentally requires a property to run a CMA against.
 */
export function toCandidate(c: NormalizedContact): CmaClientCandidate | null {
  if (!c.home_address) return null;
  const addr = composeAddress(c.home_address);
  if (!addr) return null;

  return {
    crm_contact_id: c.external_id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    address: addr.display,
    address_normalized: addr.normalized,
    address_parts: {
      street: c.home_address.street,
      city: c.home_address.city,
      state: c.home_address.state,
      zip: c.home_address.zip,
    },
    raw_stage: c.raw_stage,
    tags: c.tags,
  };
}
