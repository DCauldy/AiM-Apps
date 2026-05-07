"use client";

import { useState } from "react";
import { Check, Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardData {
  section: string;
  title: string;
  fields: Record<string, string | string[]>;
}

interface ConfirmationCardProps {
  data: CardData;
  onConfirm: (section: string, fields: Record<string, unknown>) => void;
  onEdit: (section: string) => void;
  isConfirmed: boolean;
  isLoading?: boolean;
}

export function ConfirmationCard({
  data,
  onConfirm,
  onEdit,
  isConfirmed,
  isLoading,
}: ConfirmationCardProps) {
  const [confirmed, setConfirmed] = useState(isConfirmed);

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm(data.section, data.fields);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4 my-3 transition-colors",
        confirmed
          ? "border-[#31DBA5]/30 bg-[#31DBA5]/5"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-sans text-sm font-semibold text-foreground">{data.title}</h4>
        {confirmed && (
          <span className="flex items-center gap-1 text-xs text-[#31DBA5]">
            <Check className="h-3 w-3" />
            Confirmed
          </span>
        )}
      </div>

      <div className="space-y-2">
        {Object.entries(data.fields).map(([key, value]) => (
          <div key={key} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{key}</span>
            <span className="text-sm text-foreground">
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </span>
          </div>
        ))}
      </div>

      {!confirmed && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Confirm
          </button>
          <button
            onClick={() => onEdit(data.section)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Parse :::card blocks from AI response text.
 * Returns the text with cards extracted and the card data objects.
 */
export function parseCards(text: string): {
  textWithoutCards: string;
  cards: CardData[];
} {
  const cardRegex = /:::card\n([\s\S]*?)\n:::/g;
  const cards: CardData[] = [];
  let textWithoutCards = text;

  let match;
  while ((match = cardRegex.exec(text)) !== null) {
    try {
      const cardData = JSON.parse(match[1]);
      cards.push(cardData);
    } catch {
      // Skip malformed card JSON
    }
    textWithoutCards = textWithoutCards.replace(match[0], "");
  }

  return { textWithoutCards: textWithoutCards.trim(), cards };
}
