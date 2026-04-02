"use client";

interface ContextTabProps {
  context: string;
  onContextChange: (value: string) => void;
}

export function ContextTab({ context, onContextChange }: ContextTabProps) {
  return (
    <div className="p-3 flex flex-col">
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        Additional context
      </label>
      <p className="text-xs text-muted-foreground mb-3">
        Provide any background information, constraints, or examples that should
        inform the refined prompt.
      </p>
      <textarea
        value={context}
        onChange={(e) => onContextChange(e.target.value)}
        placeholder="e.g. Tone should be conversational. Keep the output under 200 words. Avoid technical jargon..."
        className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none min-h-[200px]"
      />
    </div>
  );
}
