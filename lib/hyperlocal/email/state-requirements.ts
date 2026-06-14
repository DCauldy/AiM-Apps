// ============================================================
// State-aware real estate marketing disclosure requirements.
//
// Each US state regulates what an agent must include on outbound
// marketing email. These are the load-bearing fields for *email*
// specifically — sign / yard / print marketing has its own rules.
//
// References:
//   - TX (TREC): TREC Advertisement Rule §535.155
//   - FL (DBPR): F.S. § 475.25(1)(c), 61J2-10.025
//   - CA (DRE):  B&P Code § 10140.6
//   - NY (DOS):  19 NYCRR § 175.25
//   - IL (IDFPR): 68 Ill Admin Code § 1450.760
//   - WA (DOL):  RCW 18.85.301
//   - + a baseline conservative posture for unlisted states
//
// We err on the side of "include more than required" because the
// downside of a missing disclosure is real (license violation,
// brokerage discipline) and the cost of adding extra info to a
// footer is zero.
// ============================================================

export interface StateDisclosureRequirements {
  /** ISO 3166-2 subdivision code without the US- prefix, e.g. "TX". */
  code: string;
  display_name: string;
  /** Agent license number must appear in email marketing. */
  requires_license_number: boolean;
  /** Brokerage name must appear in email marketing. */
  requires_brokerage_disclosure: boolean;
  /** Supervising broker / sponsoring broker license must appear. */
  requires_supervising_broker: boolean;
  /** Equal Housing Opportunity notice must appear in agent marketing. */
  requires_fair_housing_notice: boolean;
  /**
   * Default footer disclaimer text the renderer falls back to when the
   * profile leaves `legal_disclaimer` blank. Empty string = no default.
   */
  default_disclaimer: string;
}

const BASELINE: Omit<StateDisclosureRequirements, "code" | "display_name"> = {
  // Default posture for states without an explicit override below:
  // assume license number is required (true in the majority of states)
  // and fair housing notice is industry-standard. Brokerage is widely
  // expected too.
  requires_license_number: true,
  requires_brokerage_disclosure: true,
  requires_supervising_broker: false,
  requires_fair_housing_notice: true,
  default_disclaimer: "",
};

const STATES: Record<string, StateDisclosureRequirements> = {
  AL: { code: "AL", display_name: "Alabama", ...BASELINE },
  AK: { code: "AK", display_name: "Alaska", ...BASELINE },
  AZ: { code: "AZ", display_name: "Arizona", ...BASELINE },
  AR: { code: "AR", display_name: "Arkansas", ...BASELINE },
  CA: {
    code: "CA",
    display_name: "California",
    requires_license_number: true,
    requires_brokerage_disclosure: true,
    requires_supervising_broker: true,
    requires_fair_housing_notice: true,
    default_disclaimer:
      "Licensed by the California Department of Real Estate (DRE).",
  },
  CO: { code: "CO", display_name: "Colorado", ...BASELINE },
  CT: { code: "CT", display_name: "Connecticut", ...BASELINE },
  DE: { code: "DE", display_name: "Delaware", ...BASELINE },
  FL: {
    code: "FL",
    display_name: "Florida",
    requires_license_number: true,
    requires_brokerage_disclosure: true,
    requires_supervising_broker: false,
    requires_fair_housing_notice: true,
    default_disclaimer: "Licensed Florida Real Estate Professional.",
  },
  GA: { code: "GA", display_name: "Georgia", ...BASELINE },
  HI: { code: "HI", display_name: "Hawaii", ...BASELINE },
  ID: { code: "ID", display_name: "Idaho", ...BASELINE },
  IL: {
    code: "IL",
    display_name: "Illinois",
    requires_license_number: true,
    requires_brokerage_disclosure: true,
    requires_supervising_broker: true,
    requires_fair_housing_notice: true,
    default_disclaimer: "",
  },
  IN: { code: "IN", display_name: "Indiana", ...BASELINE },
  IA: { code: "IA", display_name: "Iowa", ...BASELINE },
  KS: { code: "KS", display_name: "Kansas", ...BASELINE },
  KY: { code: "KY", display_name: "Kentucky", ...BASELINE },
  LA: { code: "LA", display_name: "Louisiana", ...BASELINE },
  ME: { code: "ME", display_name: "Maine", ...BASELINE },
  MD: { code: "MD", display_name: "Maryland", ...BASELINE },
  MA: { code: "MA", display_name: "Massachusetts", ...BASELINE },
  MI: { code: "MI", display_name: "Michigan", ...BASELINE },
  MN: { code: "MN", display_name: "Minnesota", ...BASELINE },
  MS: { code: "MS", display_name: "Mississippi", ...BASELINE },
  MO: { code: "MO", display_name: "Missouri", ...BASELINE },
  MT: { code: "MT", display_name: "Montana", ...BASELINE },
  NE: { code: "NE", display_name: "Nebraska", ...BASELINE },
  NV: { code: "NV", display_name: "Nevada", ...BASELINE },
  NH: { code: "NH", display_name: "New Hampshire", ...BASELINE },
  NJ: { code: "NJ", display_name: "New Jersey", ...BASELINE },
  NM: { code: "NM", display_name: "New Mexico", ...BASELINE },
  NY: {
    code: "NY",
    display_name: "New York",
    requires_license_number: true,
    requires_brokerage_disclosure: true,
    requires_supervising_broker: false,
    requires_fair_housing_notice: true,
    default_disclaimer: "",
  },
  NC: { code: "NC", display_name: "North Carolina", ...BASELINE },
  ND: { code: "ND", display_name: "North Dakota", ...BASELINE },
  OH: { code: "OH", display_name: "Ohio", ...BASELINE },
  OK: { code: "OK", display_name: "Oklahoma", ...BASELINE },
  OR: { code: "OR", display_name: "Oregon", ...BASELINE },
  PA: { code: "PA", display_name: "Pennsylvania", ...BASELINE },
  RI: { code: "RI", display_name: "Rhode Island", ...BASELINE },
  SC: { code: "SC", display_name: "South Carolina", ...BASELINE },
  SD: { code: "SD", display_name: "South Dakota", ...BASELINE },
  TN: { code: "TN", display_name: "Tennessee", ...BASELINE },
  TX: {
    code: "TX",
    display_name: "Texas",
    requires_license_number: true,
    requires_brokerage_disclosure: true,
    requires_supervising_broker: true,
    requires_fair_housing_notice: true,
    default_disclaimer:
      "Texas Real Estate Commission Information About Brokerage Services: trec.texas.gov/forms/information-about-brokerage-services. TREC Consumer Protection Notice: trec.texas.gov/forms/consumer-protection-notice.",
  },
  UT: { code: "UT", display_name: "Utah", ...BASELINE },
  VT: { code: "VT", display_name: "Vermont", ...BASELINE },
  VA: { code: "VA", display_name: "Virginia", ...BASELINE },
  WA: {
    code: "WA",
    display_name: "Washington",
    requires_license_number: true,
    requires_brokerage_disclosure: true,
    requires_supervising_broker: false,
    requires_fair_housing_notice: true,
    default_disclaimer: "",
  },
  WV: { code: "WV", display_name: "West Virginia", ...BASELINE },
  WI: { code: "WI", display_name: "Wisconsin", ...BASELINE },
  WY: { code: "WY", display_name: "Wyoming", ...BASELINE },
  DC: { code: "DC", display_name: "District of Columbia", ...BASELINE },
};

/**
 * Look up the disclosure requirements for the given US state. Accepts the
 * 2-letter ISO code, the full state name, or null/undefined. Returns the
 * conservative BASELINE fallback if no match — never returns null so
 * callers can rely on a non-null requirements object.
 */
export function getStateRequirements(
  state: string | null | undefined
): StateDisclosureRequirements {
  if (!state) return { code: "??", display_name: "Unknown", ...BASELINE };
  const trimmed = state.trim();

  // Two-letter code match (case-insensitive)
  const codeMatch = STATES[trimmed.toUpperCase()];
  if (codeMatch) return codeMatch;

  // Full name match (case-insensitive)
  const nameLower = trimmed.toLowerCase();
  for (const s of Object.values(STATES)) {
    if (s.display_name.toLowerCase() === nameLower) return s;
  }

  return { code: "??", display_name: trimmed, ...BASELINE };
}

/** Equal Housing Opportunity text used in footers. */
export const FAIR_HOUSING_NOTICE =
  "We are committed to providing equal housing opportunities. Equal Housing Opportunity.";
