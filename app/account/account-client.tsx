"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, ExternalLink, User } from "lucide-react";

interface Props {
  email: string;
  fullName: string;
  subscriptionTier: string;
  slotCount: number;
  activeProfileCount: number;
  slotGraceUntil: string | null;
  isAdmin: boolean;
}

export function AccountClient({
  email,
  fullName,
  subscriptionTier,
  slotCount,
  activeProfileCount,
  slotGraceUntil,
  isAdmin,
}: Props) {
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Account &amp; Billing</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your sign-in, subscription, and profile slots.
            </p>
          </div>
          <Link href="/apps">
            <Button variant="outline" size="sm">Back to apps</Button>
          </Link>
        </header>

        <Section title="Sign-in">
          <Row label="Name">{fullName || <span className="text-muted-foreground">Not set</span>}</Row>
          <Row label="Email">{email}</Row>
        </Section>

        <Section
          title="Subscription"
          description="Your AiM Automations plan and included resources."
        >
          <Row label="Plan">
            <span className="capitalize">{subscriptionTier}</span>
          </Row>
          <Row label="Status">
            {subscriptionTier === "pro" ? (
              <span className="inline-flex items-center gap-1 text-emerald-500 text-sm">Active</span>
            ) : (
              <span className="text-muted-foreground text-sm">Not subscribed</span>
            )}
          </Row>
        </Section>

        <Section
          title="Profile slots"
          description="Each slot can hold one company identity. Archive or delete a profile any time to free up its slot for a new one — your slot stays yours."
        >
          <Row label="Slots in use">
            <span className="font-mono text-sm">
              {activeProfileCount} / {slotCount}
            </span>
          </Row>
          <Row label="Available">
            <span className="font-mono text-sm">
              {Math.max(0, slotCount - activeProfileCount)}
            </span>
          </Row>
          {slotGraceUntil && new Date(slotGraceUntil) > new Date() && (
            <Row label="Grace period ends">
              <span className="text-amber-500 text-sm">
                {new Date(slotGraceUntil).toLocaleDateString()}
              </span>
            </Row>
          )}
          <div className="pt-2 flex items-center gap-3">
            <Link href="/apps/profile">
              <Button variant="outline" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                Manage profiles
              </Button>
            </Link>
            <Button variant="outline" size="sm" disabled className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Buy more slots (coming soon)
            </Button>
          </div>
        </Section>

        {isAdmin && (
          <Section title="Admin">
            <Link href="/admin">
              <Button variant="outline" size="sm" className="gap-2">
                <Shield className="h-4 w-4" />
                Admin dashboard
              </Button>
            </Link>
          </Section>
        )}

        <Section title="Sign out">
          <Button variant="destructive" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border rounded-lg p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
