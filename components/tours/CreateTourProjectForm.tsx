"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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

type CreateTourProjectInput = {
  name: string;
  propertyAddress: string;
  listingUrl: string;
};

async function createTourProject(input: CreateTourProjectInput) {
  const response = await fetch("/api/apps/tours/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not create the tour project.");
  }
  return payload as { projectId: string };
}

export function CreateTourProjectForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [listingUrl, setListingUrl] = useState("");

  const mutation = useMutation({
    mutationFn: createTourProject,
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["tours", "projects", "open"] });
      router.push(`/apps/tours/projects/${projectId}`);
    },
  });

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Start property
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a property</DialogTitle>
            <DialogClose onClose={() => setOpen(false)} />
          </DialogHeader>
          <DialogBody>
            <form
              id="create-tour-project-form"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({ name, propertyAddress, listingUrl });
              }}
            >
              <p className="text-sm text-muted-foreground">
                Add the listing identity to start a lightweight workspace.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Project name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="123 Main Street Tour"
                    className="rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Property address
                  <input
                    value={propertyAddress}
                    onChange={(event) => setPropertyAddress(event.target.value)}
                    required
                    maxLength={240}
                    placeholder="123 Main Street, Austin, TX"
                    className="rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Listing URL <span className="font-normal text-muted-foreground">optional</span>
                  <input
                    value={listingUrl}
                    onChange={(event) => setListingUrl(event.target.value)}
                    maxLength={500}
                    placeholder="https://example.com/listing/123-main-street"
                    className="rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              {mutation.error && (
                <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-tour-project-form" disabled={mutation.isPending}>
              <Plus className="h-4 w-4" />
              {mutation.isPending ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
