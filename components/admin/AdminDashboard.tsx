"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppAvailabilityTab } from "./tabs/AppAvailabilityTab";
import { PackConfigTab } from "./tabs/PackConfigTab";
import { AdminAccessTab } from "./tabs/AdminAccessTab";
import { UserOverviewTab } from "./tabs/UserOverviewTab";
import { StripeProductsTab } from "./tabs/StripeProductsTab";

const TABS = [
  { id: "availability", label: "App Availability" },
  { id: "packs", label: "App Packs" },
  { id: "stripe", label: "Global Products" },
  { id: "admins", label: "Admin Access" },
  { id: "users", label: "User Overview" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("availability");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      {/* Tab buttons */}
      <div className="flex gap-1 border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "availability" && <AppAvailabilityTab />}
      {activeTab === "packs" && <PackConfigTab />}
      {activeTab === "stripe" && <StripeProductsTab />}
      {activeTab === "admins" && <AdminAccessTab />}
      {activeTab === "users" && <UserOverviewTab />}
    </div>
  );
}
