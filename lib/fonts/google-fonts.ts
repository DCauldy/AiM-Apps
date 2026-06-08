// ============================================================
// Curated Google Fonts list.
//
// 30 fonts in five categories, picked for real-estate brand
// styling. Each entry stores the CSS `font-family` value
// (already including a fallback) so callers can plug it
// straight into a style attribute or our renderer.
//
// Loading: GOOGLE_FONTS_LINK_HREF is a single Google Fonts
// CSS link that pulls just enough weight to preview the
// family in a dropdown — we don't ship variable weights for
// previews to keep the payload small.
// ============================================================

export type FontCategory = "sans-serif" | "serif" | "display" | "slab" | "handwriting";

export interface GoogleFont {
  /** Display name as it appears in dropdowns and is stored on the profile. */
  name: string;
  /** CSS font-family value, fallback included — what the renderer emits. */
  family: string;
  category: FontCategory;
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-serif
  { name: "Inter", family: "Inter, sans-serif", category: "sans-serif" },
  { name: "Roboto", family: "Roboto, sans-serif", category: "sans-serif" },
  { name: "Open Sans", family: "'Open Sans', sans-serif", category: "sans-serif" },
  { name: "Lato", family: "Lato, sans-serif", category: "sans-serif" },
  { name: "Montserrat", family: "Montserrat, sans-serif", category: "sans-serif" },
  { name: "Poppins", family: "Poppins, sans-serif", category: "sans-serif" },
  { name: "Nunito", family: "Nunito, sans-serif", category: "sans-serif" },
  { name: "Work Sans", family: "'Work Sans', sans-serif", category: "sans-serif" },
  { name: "DM Sans", family: "'DM Sans', sans-serif", category: "sans-serif" },
  { name: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif", category: "sans-serif" },
  { name: "Manrope", family: "Manrope, sans-serif", category: "sans-serif" },
  { name: "Outfit", family: "Outfit, sans-serif", category: "sans-serif" },
  { name: "Karla", family: "Karla, sans-serif", category: "sans-serif" },
  { name: "Source Sans 3", family: "'Source Sans 3', sans-serif", category: "sans-serif" },

  // Serif
  { name: "Lora", family: "Lora, serif", category: "serif" },
  { name: "Playfair Display", family: "'Playfair Display', serif", category: "serif" },
  { name: "Merriweather", family: "Merriweather, serif", category: "serif" },
  { name: "Cormorant Garamond", family: "'Cormorant Garamond', serif", category: "serif" },
  { name: "EB Garamond", family: "'EB Garamond', serif", category: "serif" },
  { name: "Crimson Text", family: "'Crimson Text', serif", category: "serif" },
  { name: "Libre Baskerville", family: "'Libre Baskerville', serif", category: "serif" },
  { name: "PT Serif", family: "'PT Serif', serif", category: "serif" },

  // Slab
  { name: "Roboto Slab", family: "'Roboto Slab', serif", category: "slab" },
  { name: "Bitter", family: "Bitter, serif", category: "slab" },
  { name: "Arvo", family: "Arvo, serif", category: "slab" },

  // Display
  { name: "Bebas Neue", family: "'Bebas Neue', sans-serif", category: "display" },
  { name: "Oswald", family: "Oswald, sans-serif", category: "display" },
  { name: "Anton", family: "Anton, sans-serif", category: "display" },

  // Handwriting
  { name: "Dancing Script", family: "'Dancing Script', cursive", category: "handwriting" },
  { name: "Caveat", family: "Caveat, cursive", category: "handwriting" },
];

/**
 * Single Google Fonts CSS link covering every curated font at regular weight.
 * Loading once on the profile editor is enough to preview every dropdown
 * option in its own face.
 */
export const GOOGLE_FONTS_LINK_HREF = (() => {
  const families = GOOGLE_FONTS.map(
    (f) => `family=${f.name.replace(/\s+/g, "+")}:wght@400;600`,
  ).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
})();

/** Look up the GoogleFont entry by either the stored name OR the stored CSS
 *  family value — profiles created before this UI may hold either shape. */
export function findGoogleFont(value: string | null | undefined): GoogleFont | null {
  if (!value) return null;
  const v = value.trim();
  return (
    GOOGLE_FONTS.find((f) => f.name === v) ??
    GOOGLE_FONTS.find((f) => f.family === v) ??
    GOOGLE_FONTS.find((f) => f.family.startsWith(v + ",")) ??
    null
  );
}

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  "sans-serif": "Sans-serif",
  serif: "Serif",
  slab: "Slab serif",
  display: "Display",
  handwriting: "Handwriting",
};

/**
 * Extract just the primary family name from a CSS font-family string —
 * "Inter, sans-serif" → "Inter", "'Plus Jakarta Sans', sans-serif" → "Plus Jakarta Sans".
 * Returns null when the string doesn't match a known Google Font (so we
 * don't generate a broken @import for system fonts).
 */
export function extractGoogleFontName(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  if (!first) return null;
  return GOOGLE_FONTS.find((f) => f.name === first)?.name ?? null;
}

/**
 * Build a single Google Fonts CSS URL for the given font-family strings.
 * Dedupes (heading + body often share a family), filters out non-Google
 * fonts, and returns null when no valid fonts are passed. Output is
 * intended for an email's <head><link rel="stylesheet" ...></head>.
 */
export function googleFontsLinkFor(
  ...families: Array<string | null | undefined>
): string | null {
  const names = Array.from(
    new Set(
      families
        .map((f) => extractGoogleFontName(f))
        .filter((n): n is string => !!n),
    ),
  );
  if (names.length === 0) return null;
  const params = names
    .map((n) => `family=${n.replace(/\s+/g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
