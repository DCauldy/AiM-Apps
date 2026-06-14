"use client";

import {
  Archive,
  CheckCircle2,
  ClipboardList,
  FileVideo,
  Home,
  Images,
} from "lucide-react";

import { ProductWelcome } from "@/components/app-shell/ProductWelcome";

const FEATURES = [
  {
    icon: Home,
    title: "Listing Workspace",
    description:
      "Start each tour from a single property record with the address, listing link, and project status in one place.",
  },
  {
    icon: ClipboardList,
    title: "Project Planning",
    description:
      "Keep the project shell ready for scene planning, media tasks, narration, approvals, and exports as Tours expands.",
  },
  {
    icon: Images,
    title: "Media Readiness",
    description:
      "Prepare an organized workspace for the listing photos, video assets, and future tour media workflow.",
  },
  {
    icon: FileVideo,
    title: "TourScenes",
    description:
      "Lay the foundation for future room-by-room scene planning and media sequencing.",
  },
  {
    icon: CheckCircle2,
    title: "Approval Flow",
    description:
      "Keep project status visible so active listing work can move toward review and delivery.",
  },
  {
    icon: Archive,
    title: "Project History",
    description:
      "Archive completed or paused listing projects without deleting the durable project record.",
  },
];

const STATS = [
  {
    value: "1",
    label: "focused workspace per listing",
    source: "Tours",
  },
  {
    value: "5",
    label: "future workflow stages prepared",
    source: "Tours",
  },
  {
    value: "0",
    label: "project history deleted when archived",
    source: "Tours",
  },
];

export function WelcomeScreen() {
  return (
    <ProductWelcome
      badgeText="AiM Pro"
      title="Launch listing tours faster."
      description="Tours gives each active listing a focused project workspace for property details, future scene planning, media workflow, approvals, and export readiness."
      stats={STATS}
      features={FEATURES}
      ctaLabel="Set Up Tours"
      ctaHref="/apps/tours/dashboard"
      ctaHelpText="Create your first project in under a minute."
      accentClassName="text-primary"
      accentBgClassName="bg-primary/10"
      ctaClassName="bg-primary text-primary-foreground hover:bg-primary/90"
      ctaShadowClassName="shadow-primary/20"
      sourceHoverClassName="hover:text-primary"
    />
  );
}
