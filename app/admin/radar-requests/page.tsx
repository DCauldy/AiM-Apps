import { RadarRequestsClient } from "@/components/admin/RadarRequestsClient";

export const dynamic = "force-dynamic";

export default function AdminRadarRequestsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Radar setup queue</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Customer-submitted setup requests waiting to be provisioned in the
        Otterly dashboard. Auto-research suggests competitors; provision in
        Otterly, paste the brand report ID, mark ready — customer gets
        notified by email and dashboard auto-flips.
      </p>
      <RadarRequestsClient />
    </div>
  );
}
