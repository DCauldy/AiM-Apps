import { RadarSettingsClient } from "@/components/radar-otterly/SettingsClient";

// /apps/radar/settings — read-only view of the agent's tracking
// config + account quota. Mutating controls (notification prefs,
// alert thresholds, engine selection, pause tracking) require
// schema + partner-API access and land later. For now this is the
// "what is being tracked and how much quota is left" surface.
export default function RadarSettingsPage() {
  return <RadarSettingsClient />;
}
