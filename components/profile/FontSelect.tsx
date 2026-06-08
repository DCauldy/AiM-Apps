"use client";

import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_LABELS,
  GOOGLE_FONTS,
  GOOGLE_FONTS_LINK_HREF,
  findGoogleFont,
  type FontCategory,
  type GoogleFont,
} from "@/lib/fonts/google-fonts";

const CATEGORY_ORDER: FontCategory[] = [
  "sans-serif",
  "serif",
  "slab",
  "display",
  "handwriting",
];

/**
 * Inject the Google Fonts CSS link once per page. Guards against re-injection
 * if multiple FontSelect instances mount (heading + body fields on the
 * profile editor are the obvious case).
 */
function ensureGoogleFontsLink() {
  if (typeof document === "undefined") return;
  const id = "google-fonts-preview-link";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = GOOGLE_FONTS_LINK_HREF;
  document.head.appendChild(link);
}

interface FontSelectProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Google Fonts dropdown — each option is rendered in its own face so the
 * agent can see what they're picking. The stored value is the CSS
 * `font-family` string (with fallback), which is what the email renderer
 * emits directly into style attributes.
 */
export function FontSelect({ value, onChange, placeholder = "Pick a font" }: FontSelectProps) {
  useEffect(() => {
    ensureGoogleFontsLink();
  }, []);

  const current = findGoogleFont(value);
  const byCategory = new Map<FontCategory, GoogleFont[]>();
  for (const f of GOOGLE_FONTS) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category)!.push(f);
  }
  // Sort alphabetically within each category so the picker is scannable.
  for (const list of byCategory.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <Select value={current?.family ?? ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder}>
          {current ? (
            <span style={{ fontFamily: current.family }}>{current.name}</span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[420px]">
        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat);
          if (!items || items.length === 0) return null;
          return (
            <SelectGroup key={cat}>
              <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {CATEGORY_LABELS[cat]}
              </SelectLabel>
              {items.map((f) => (
                <SelectItem key={f.family} value={f.family}>
                  <span style={{ fontFamily: f.family, fontSize: "15px" }}>
                    {f.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
