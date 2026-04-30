"use client";

import { useState } from "react";
import { InputsTab } from "./InputsTab";
import { ContextTab } from "./ContextTab";
import { VersionsTab, PromptVersion } from "./VersionsTab";
import { Question, Answer } from "./QuestionCard";

type Tab = "inputs" | "context" | "versions";

interface LeftPanelProps {
  lazyPrompt: string;
  onLazyPromptChange: (value: string) => void;
  questions: Question[];
  answers: Answer[];
  onAnswer: (answer: Answer) => void;
  onImprove: () => void;
  onRegenerateQuestions: () => void;
  isGeneratingQuestions: boolean;
  isRefining: boolean;
  context: string;
  onContextChange: (value: string) => void;
  versions: PromptVersion[];
  activeVersionId: string | null;
  onSelectVersion: (version: PromptVersion) => void;
  versionsExist?: boolean;
  limitReached?: boolean;
  onShowUpgrade?: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "inputs", label: "Inputs" },
  { id: "context", label: "Context" },
  { id: "versions", label: "Versions" },
];

export function LeftPanel({
  lazyPrompt,
  onLazyPromptChange,
  questions,
  answers,
  onAnswer,
  onImprove,
  onRegenerateQuestions,
  isGeneratingQuestions,
  isRefining,
  context,
  onContextChange,
  versions,
  activeVersionId,
  onSelectVersion,
  versionsExist = false,
  limitReached = false,
  onShowUpgrade,
}: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("inputs");

  return (
    <div className="flex flex-col self-start w-full md:w-[300px] lg:w-[380px] md:shrink-0 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.id === "versions" && versions.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5">
                {versions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="overflow-hidden">
        {activeTab === "inputs" && (
          <InputsTab
            lazyPrompt={lazyPrompt}
            onLazyPromptChange={onLazyPromptChange}
            questions={questions}
            answers={answers}
            onAnswer={onAnswer}
            onImprove={onImprove}
            onRegenerateQuestions={onRegenerateQuestions}
            isGeneratingQuestions={isGeneratingQuestions}
            isRefining={isRefining}
            versionsExist={versionsExist}
            limitReached={limitReached}
            onShowUpgrade={onShowUpgrade}
          />
        )}
        {activeTab === "context" && (
          <ContextTab context={context} onContextChange={onContextChange} />
        )}
        {activeTab === "versions" && (
          <VersionsTab
            versions={versions}
            activeVersionId={activeVersionId}
            onSelectVersion={onSelectVersion}
          />
        )}
      </div>
    </div>
  );
}
