"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserPlus,
  Loader2,
  AlertCircle,
  Home,
  Mail,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreatedClient {
  id: string;
}

export function NewClientForm() {
  const router = useRouter();
  const { addToast } = useToast();
  const [draft, setDraft] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailInvalid = draft.email.length > 0 && !VALID_EMAIL.test(draft.email);

  const canSubmit =
    draft.address.trim().length > 0 &&
    draft.email.trim().length > 0 &&
    !emailInvalid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Address and a valid email are both required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/apps/listing-studio/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: draft.first_name.trim() || null,
          last_name: draft.last_name.trim() || null,
          email: draft.email.trim(),
          phone: draft.phone.trim() || null,
          address: draft.address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Create failed (HTTP ${res.status})`);
        return;
      }
      const created = data.client as CreatedClient;
      addToast({
        title: "Client added",
        description: "Review their details, then enroll to start the cadence.",
      });
      router.push(`/apps/cma/clients/${created.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/apps/cma/clients"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>

        <div className="mb-6 flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A35C]/10 text-[#D4A35C] flex-shrink-0">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Add a manual client
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              For past clients who aren&apos;t in your connected CRM yet.
              Once saved, you&apos;ll be able to enroll them on the
              cadence from the detail page.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-lg border border-border bg-card p-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name">
              <input
                type="text"
                value={draft.first_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, first_name: e.target.value }))
                }
                placeholder="Jane"
                className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                value={draft.last_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, last_name: e.target.value }))
                }
                placeholder="Doe"
                className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
              />
            </Field>
          </div>

          <Field
            label="Email *"
            hint={
              emailInvalid
                ? "Doesn't look like a deliverable email address."
                : "Where the CMA delivery lands. Make sure it's the one your client actually reads."
            }
            error={emailInvalid}
          >
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
                placeholder="jane@example.com"
                className={cn(
                  "block w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1",
                  emailInvalid
                    ? "border-destructive/40 focus:ring-destructive/40"
                    : "border-border focus:ring-[#D4A35C]/40",
                )}
              />
            </div>
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={draft.phone}
              onChange={(e) =>
                setDraft((d) => ({ ...d, phone: e.target.value }))
              }
              placeholder="(555) 123-4567"
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
            />
          </Field>

          <Field
            label="Property address *"
            hint="The CMA runs against this property. Include street, city, state, and ZIP for the cleanest property-lookup match."
          >
            <div className="relative">
              <Home className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={draft.address}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, address: e.target.value }))
                }
                placeholder="1234 Main St, Springfield, IL 62701"
                className="block w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#D4A35C]/40"
              />
            </div>
          </Field>

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Link
              href="/apps/cma/clients"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-white px-4 py-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, #1E293B 0%, #D4A35C 100%)",
              }}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Add client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium block mb-1.5">
        {label}
      </label>
      {children}
      {hint && (
        <p
          className={cn(
            "mt-1.5 text-[11px]",
            error ? "text-rose-400" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
