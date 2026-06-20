import { createHash } from "node:crypto";

export function hashJsonFingerprint(fingerprint: unknown): string {
  return createHash("sha256").update(stableStringify(fingerprint)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}
