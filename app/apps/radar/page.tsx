import { redirect } from "next/navigation";

// /apps/radar lands on the Dashboard tab. All five tabs (Dashboard,
// Monitor, Research, Optimize, Settings) live at /apps/radar/<tab>.
export default function RadarIndexPage() {
  redirect("/apps/radar/dashboard");
}
