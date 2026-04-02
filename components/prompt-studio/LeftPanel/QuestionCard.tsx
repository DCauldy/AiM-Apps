"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUp, Pencil, Check, ChevronRight } from "lucide-react";

export interface Question {
  id: string;
  priority: "Critical" | "Important";
  question: string;
  description: string;
  options?: string[];
}

export interface Answer {
  questionId: string;
  question: string;
  answer: string;
}

interface CustomEntry {
  id: string;
  text: string;
}

interface QuestionCardProps {
  question: Question;
  answer: Answer | undefined;
  onAnswer: (answer: Answer) => void;
  onClose?: () => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function QuestionCard({ question, answer, onAnswer, onClose }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMounted(true), []);

  const predefined = question.options ?? [];

  const selectedOptions: string[] = answer?.answer
    ? answer.answer.split("|||").map((s) => s.trim()).filter(Boolean)
    : [];

  const [customEntries, setCustomEntries] = useState<CustomEntry[]>(() =>
    selectedOptions
      .filter((o) => !predefined.includes(o))
      .map((o) => ({ id: uid(), text: o }))
  );

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [expanded]);

  const handleClose = () => {
    setExpanded(false);
    onClose?.();
  };

  // Close on Escape key
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const emit = (predefinedSelected: string[], entries: CustomEntry[], checkedIds: Set<string>) => {
    const customSelected = entries
      .filter((e) => checkedIds.has(e.id))
      .map((e) => e.text);
    const combined = [...predefinedSelected, ...customSelected].filter(Boolean);
    onAnswer({
      questionId: question.id,
      question: question.question,
      answer: combined.join(" ||| "),
    });
  };

  const checkedCustomIds = new Set(
    customEntries.filter((e) => selectedOptions.includes(e.text)).map((e) => e.id)
  );

  const predefinedSelected = selectedOptions.filter((o) => predefined.includes(o));

  const handlePredefinedToggle = (option: string) => {
    const isSelecting = !predefinedSelected.includes(option);
    const next = isSelecting
      ? [...predefinedSelected, option]
      : predefinedSelected.filter((o) => o !== option);
    emit(next, customEntries, checkedCustomIds);
    if (isSelecting) {
      setTimeout(() => handleClose(), 150);
    }
  };

  const handleCustomToggle = (entry: CustomEntry) => {
    const isSelecting = !checkedCustomIds.has(entry.id);
    const next = new Set(checkedCustomIds);
    isSelecting ? next.add(entry.id) : next.delete(entry.id);
    emit(predefinedSelected, customEntries, next);
    if (isSelecting) {
      setTimeout(() => handleClose(), 150);
    }
  };

  const handleCustomDelete = (entry: CustomEntry) => {
    const remaining = customEntries.filter((e) => e.id !== entry.id);
    setCustomEntries(remaining);
    const nextChecked = new Set(checkedCustomIds);
    nextChecked.delete(entry.id);
    emit(predefinedSelected, remaining, nextChecked);
  };

  const handleCustomEditSave = (entry: CustomEntry) => {
    const trimmed = editingText.trim();
    if (!trimmed || trimmed === entry.text) { setEditingId(null); return; }
    const updated = customEntries.map((e) => e.id === entry.id ? { ...e, text: trimmed } : e);
    setCustomEntries(updated);
    emit(predefinedSelected, updated, checkedCustomIds);
    setEditingId(null);
  };

  const handleTextSubmit = () => {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    const alreadyExists =
      predefined.includes(trimmed) ||
      customEntries.some((e) => e.text.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyExists) {
      const newEntry: CustomEntry = { id: uid(), text: trimmed };
      const nextEntries = [...customEntries, newEntry];
      setCustomEntries(nextEntries);
      const nextChecked = new Set([...checkedCustomIds, newEntry.id]);
      emit(predefinedSelected, nextEntries, nextChecked);
    }
    setTextValue("");
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const totalAnswered = predefinedSelected.length + customEntries.filter((e) => checkedCustomIds.has(e.id)).length;
  const hasAnswer = totalAnswered > 0;

  const floatingPanel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={handleClose}
      />

      {/* Floating panel */}
      <div
        className="fixed bottom-4 sm:bottom-6 left-1/2 z-50 w-[calc(100vw-24px)] sm:w-[560px] rounded-2xl border bg-background shadow-2xl overflow-hidden"
        style={{
          transform: "translateX(-50%)",
          borderColor: "rgba(49,219,165,0.3)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(49,219,165,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-sm">↳</span>
          <span className="flex-1 text-sm font-semibold text-foreground">
            {question.question}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options */}
        {(predefined.length > 0 || customEntries.length > 0) && (
          <div className="max-h-60 overflow-y-auto">
            {predefined.map((option) => (
              <label
                key={option}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={predefinedSelected.includes(option)}
                  onChange={() => handlePredefinedToggle(option)}
                  className="h-4 w-4 rounded border-border accent-[#31DBA5] cursor-pointer shrink-0"
                />
                <span className="text-sm text-foreground">{option}</span>
              </label>
            ))}

            {customEntries.length > 0 && (
              <div className={predefined.length > 0 ? "border-t border-border/50" : ""}>
                {customEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={checkedCustomIds.has(entry.id)}
                      onChange={() => handleCustomToggle(entry)}
                      className="h-4 w-4 rounded border-border accent-[#31DBA5] cursor-pointer shrink-0"
                    />
                    {editingId === entry.id ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <input
                          ref={editInputRef}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCustomEditSave(entry);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => handleCustomEditSave(entry)}
                          className="flex-1 text-sm bg-transparent border-b border-[#31DBA5] focus:outline-none text-foreground pb-0.5"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleCustomEditSave(entry); }}
                          className="shrink-0 text-[#31DBA5] hover:text-[#31DBA5]/80 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-foreground">{entry.text}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => { setEditingId(entry.id); setEditingText(entry.text); }}
                            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCustomDelete(entry)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Description when no options */}
        {predefined.length === 0 && customEntries.length === 0 && question.description && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {question.description}
          </p>
        )}

        {/* Text input */}
        <div className="border-t border-border">
          <textarea
            ref={textareaRef}
            placeholder={predefined.length > 0 ? "Add a custom option..." : "Type your answer..."}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={handleTextKeyDown}
            rows={2}
            className="w-full text-sm px-4 pt-3 pb-1 placeholder:text-muted-foreground focus:outline-none resize-none bg-transparent"
          />
          <div className="flex items-center justify-end px-3 pb-3 pt-1">
            <button
              type="button"
              onClick={handleTextSubmit}
              disabled={!textValue.trim()}
              className="h-7 w-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ backgroundColor: textValue.trim() ? "#31DBA5" : undefined }}
              title="Add as option"
            >
              <ArrowUp
                className={`h-3.5 w-3.5 ${textValue.trim() ? "text-white" : "text-muted-foreground"}`}
              />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Collapsed card — always in the left panel */}
      <div
        className={`rounded-xl border transition-all duration-200 cursor-pointer ${
          expanded
            ? "border-[rgba(49,219,165,0.5)] bg-[rgba(49,219,165,0.04)] shadow-sm"
            : hasAnswer
            ? "border-[rgba(49,219,165,0.3)] bg-[rgba(49,219,165,0.04)]"
            : "border-border bg-card hover:border-border/80"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-full flex items-start gap-2.5 px-3.5 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  question.priority === "Critical"
                    ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                }`}
              >
                {question.priority}
              </span>
              {hasAnswer && (
                <span className="text-[10px] font-medium text-[#31DBA5]">
                  ✓ {totalAnswered} answered
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">
              {question.question}
            </p>
            {question.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                {question.description}
              </p>
            )}
          </div>
          <span
            className="mt-1 shrink-0 text-muted-foreground transition-transform duration-200"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* Portal — floating panel at bottom center of viewport */}
      {expanded && mounted && createPortal(floatingPanel, document.body)}
    </>
  );
}
