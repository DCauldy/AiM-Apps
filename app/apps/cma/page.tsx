import Link from "next/link";
import { Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CmaPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-2xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A35C]/10 text-[#D4A35C]">
            <Wrench className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">CMA</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Automated quarterly CMAs for your past clients — connect your
            CRM and the system handles the rest.
          </p>
          <p className="mt-6 inline-flex rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-400">
            Rebuilding for v2 — back online in a few days
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              href="/apps/cma/settings"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Settings
            </Link>
            <Link
              href="/apps"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Back to apps
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
