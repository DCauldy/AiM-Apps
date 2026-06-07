"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { CheckSquare, EllipsisVertical, ImagePlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type { TourScene, TourSceneFact } from "@/lib/tours/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TourScenePhoto = TourScene["sourcePhotos"][number];

export function SceneDetailsPanel({
  activeScene,
  sceneIndex,
  isSubmittingFact = false,
  isUpdatingFact = false,
  isDeletingFact = false,
  factError = null,
  factActionError = null,
  onAddScene,
  onCreateFact,
  onUpdateFact,
  onDeleteFact,
}: {
  activeScene: TourScene | null;
  displayPhoto: TourScenePhoto | null;
  sceneIndex: number;
  isSubmittingFact?: boolean;
  isUpdatingFact?: boolean;
  isDeletingFact?: boolean;
  factError?: Error | null;
  factActionError?: Error | null;
  onAddScene: () => void;
  onCreateFact?: (text: string) => Promise<void> | void;
  onUpdateFact?: (factId: string, text: string) => Promise<void> | void;
  onDeleteFact?: (factId: string) => Promise<void> | void;
}) {
  const [factText, setFactText] = useState("");
  const [editingFact, setEditingFact] = useState<TourSceneFact | null>(null);
  const [editFactText, setEditFactText] = useState("");
  const [deletingFact, setDeletingFact] = useState<TourSceneFact | null>(null);
  const trimmedFactText = factText.trim();
  const canSubmitFact = Boolean(activeScene && trimmedFactText && !isSubmittingFact);
  const canSubmitFactEdit = Boolean(editingFact && editFactText.trim() && !isUpdatingFact);

  async function handleFactSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmitFact || !onCreateFact) {
      return;
    }

    await onCreateFact(trimmedFactText);
    setFactText("");
  }

  function handleFactKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    handleFactSubmit();
  }

  async function handleFactEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFact || !canSubmitFactEdit || !onUpdateFact) {
      return;
    }

    try {
      await onUpdateFact(editingFact.id, editFactText.trim());
      setEditingFact(null);
      setEditFactText("");
    } catch {
      // The mutation error is rendered in the dialog.
    }
  }

  async function handleFactDeleteConfirm() {
    if (!deletingFact || !onDeleteFact) {
      return;
    }

    try {
      await onDeleteFact(deletingFact.id);
      setDeletingFact(null);
    } catch {
      // The mutation error is rendered in the dialog.
    }
  }

  return (
    <section className="min-h-48 rounded-md border border-border bg-background p-4 lg:min-h-[420px]">
      {activeScene ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{activeScene.title}</h2>
            <p className="mt-1 text-xs uppercase text-muted-foreground">
              Scene {sceneIndex + 1} · {activeScene.cameraMotion.replace("_", " ")}
            </p>
          </div>

          <form className="space-y-2" onSubmit={handleFactSubmit}>
            <label htmlFor="scene-fact-text" className="block text-sm font-medium text-foreground">
              Proofed scene facts
            </label>
            <textarea
              id="scene-fact-text"
              rows={2}
              value={factText}
              onChange={(event) => setFactText(event.target.value)}
              onKeyDown={handleFactKeyDown}
              placeholder="Add a short room, feature, or selling-point fact..."
              disabled={isSubmittingFact}
              className="block max-h-24 min-h-16 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:cursor-wait disabled:opacity-70"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!canSubmitFact}>
                {isSubmittingFact ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Adding
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add fact
                  </>
                )}
              </Button>
            </div>
            {factError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {factError.message}
              </p>
            ) : null}
          </form>

          <SceneFactList
            facts={activeScene.facts}
            onEditFact={(fact) => {
              setEditingFact(fact);
              setEditFactText(fact.text);
            }}
            onDeleteFact={setDeletingFact}
          />
          <FactEditDialog
            open={Boolean(editingFact)}
            text={editFactText}
            error={factActionError}
            isSaving={isUpdatingFact}
            canSave={canSubmitFactEdit}
            onOpenChange={(open) => {
              if (!open) {
                setEditingFact(null);
                setEditFactText("");
              }
            }}
            onTextChange={setEditFactText}
            onSubmit={handleFactEditSubmit}
          />
          <FactDeleteDialog
            fact={deletingFact}
            error={factActionError}
            isDeleting={isDeletingFact}
            onOpenChange={(open) => {
              if (!open) {
                setDeletingFact(null);
              }
            }}
            onConfirm={handleFactDeleteConfirm}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onAddScene}
          className="flex min-h-40 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50 lg:min-h-[360px]"
        >
          <ImagePlus className="h-8 w-8 text-primary" />
          <span className="mt-3 text-sm font-semibold text-foreground">Add first scene</span>
        </button>
      )}
    </section>
  );
}

function SceneFactList({
  facts,
  onEditFact,
  onDeleteFact,
}: {
  facts: TourSceneFact[];
  onEditFact: (fact: TourSceneFact) => void;
  onDeleteFact: (fact: TourSceneFact) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Approved context</h3>
        <span className="text-xs text-muted-foreground">{facts.length} facts</span>
      </div>
      <div
        className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/20"
        data-testid="scene-fact-list"
      >
        {facts.length > 0 ? (
          <TooltipProvider>
            <ul className="divide-y divide-border">
              {facts.map((fact) => (
                <li key={fact.id} className="relative px-3 py-2 pr-10 text-sm text-foreground">
                  <div className="flex items-start gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="mt-0.5 inline-flex shrink-0 text-muted-foreground" aria-label="Approved fact">
                          <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Approved fact</p>
                      </TooltipContent>
                    </Tooltip>
                    <p>{fact.text}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Open actions for ${fact.text}`}
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => onEditFact(fact)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive hover:text-destructive" onClick={() => onDeleteFact(fact)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </TooltipProvider>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No scene facts yet.</p>
        )}
      </div>
    </div>
  );
}

function FactEditDialog({
  open,
  text,
  error,
  isSaving,
  canSave,
  onOpenChange,
  onTextChange,
  onSubmit,
}: {
  open: boolean;
  text: string;
  error: Error | null;
  isSaving: boolean;
  canSave: boolean;
  onOpenChange: (open: boolean) => void;
  onTextChange: (text: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit approved fact</DialogTitle>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="block text-sm font-medium text-foreground">
              Fact
              <textarea
                rows={3}
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                className="mt-1 block min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
            </label>
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error.message}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {isSaving ? "Saving..." : "Save fact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FactDeleteDialog({
  fact,
  error,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  fact: TourSceneFact | null;
  error: Error | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(fact)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete approved fact?</DialogTitle>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This removes the fact from approved context for this scene.
          </p>
          {fact ? <p className="rounded-md bg-muted/40 p-3 text-sm text-foreground">{fact.text}</p> : null}
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? "Deleting..." : "Delete fact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
