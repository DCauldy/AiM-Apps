"use client";

import { useState, useEffect } from "react";
import { QuestionCard, Question, Answer } from "./QuestionCard";
import { Sparkles, Loader2, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface InputsTabProps {
  lazyPrompt: string;
  onLazyPromptChange: (value: string) => void;
  questions: Question[];
  answers: Answer[];
  onAnswer: (answer: Answer) => void;
  onImprove: () => void;
  onRegenerateQuestions: () => void;
  isGeneratingQuestions: boolean;
  isRefining: boolean;
  versionsExist?: boolean;
}

export function InputsTab({
  lazyPrompt,
  onLazyPromptChange,
  questions,
  answers,
  onAnswer,
  onImprove,
  onRegenerateQuestions,
  isGeneratingQuestions,
  isRefining,
  versionsExist = false,
}: InputsTabProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset to first question whenever the question set changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [questions]);

  const answeredCount = answers.filter((a) => a.answer.trim().length > 0).length;
  const isLoading = isGeneratingQuestions || isRefining;
  const currentQuestion = questions[currentIndex];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isLoading && lazyPrompt.trim()) {
        onImprove();
      }
    }
  };

  return (
    <div className="flex flex-col">
      {/* Lazy prompt textarea */}
      <div className="p-3 border-b border-border">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Lazy prompt
        </label>
        <textarea
          value={lazyPrompt}
          onChange={(e) => onLazyPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want your prompt to do..."
          rows={4}
          className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          ⌘+Enter to improve
        </p>
      </div>

      {/* Single question at a time */}
      {(questions.length > 0 || isGeneratingQuestions) && (
        <div className="p-3 space-y-3">
          {/* Header row: label + prev/next arrows */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              {questions.length > 0
                ? `Question ${currentIndex + 1} of ${questions.length}`
                : "Generating questions…"}
            </span>
            {questions.length > 1 && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  disabled={currentIndex === questions.length - 1}
                  className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Question card skeleton */}
          {isGeneratingQuestions && questions.length === 0 && (
            <div className="rounded-xl border border-border bg-card animate-pulse px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-14 bg-muted rounded" />
                  </div>
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-3 w-4/5 bg-muted rounded" />
                  <div className="h-3 w-3/5 bg-muted rounded" />
                </div>
                <div className="h-4 w-4 bg-muted rounded mt-1 shrink-0" />
              </div>
            </div>
          )}

          {/* Current question card */}
          {currentQuestion && (
            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              answer={answers.find((a) => a.questionId === currentQuestion.id)}
              onAnswer={onAnswer}
              onClose={() => {
                // Auto-advance if the question was answered and there's a next one
                const wasAnswered = answers.some(
                  (a) => a.questionId === currentQuestion.id && a.answer.trim()
                );
                if (wasAnswered && currentIndex < questions.length - 1) {
                  setCurrentIndex((i) => i + 1);
                }
              }}
            />
          )}

          {/* Progress dots */}
          {questions.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {questions.map((q, i) => {
                const isAnswered = answers.some((a) => a.questionId === q.id && a.answer.trim());
                const isActive = i === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(i)}
                    className="rounded-full transition-all"
                    style={{
                      width: isActive ? 16 : 6,
                      height: 6,
                      backgroundColor: isAnswered
                        ? "#31DBA5"
                        : isActive
                        ? "hsl(var(--foreground))"
                        : "hsl(var(--muted-foreground) / 0.3)",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Improve button */}
      <div className="p-3 border-t border-border flex gap-2">
        {questions.length > 0 && (
          <button
            type="button"
            onClick={onRegenerateQuestions}
            disabled={isLoading || !lazyPrompt.trim()}
            title="Regenerate questions"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isGeneratingQuestions ? "animate-spin" : ""}`} />
          </button>
        )}
        <button
          type="button"
          onClick={onImprove}
          disabled={isLoading || !lazyPrompt.trim() || (questions.length > 0 && answeredCount === 0 && !versionsExist)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isGeneratingQuestions ? "Generating questions..." : "Refining prompt..."}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {questions.length === 0 ? "Generate Questions" : "Improve Prompt"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
