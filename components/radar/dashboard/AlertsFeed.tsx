"use client";

import {
  TrendingUp,
  TrendingDown,
  Info,
  Eye,
  EyeOff,
  Link2,
  LinkIcon,
  Users,
  Shield,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { RadarAlert, AlertType, AlertSeverity } from "@/types/radar";
import type { LucideIcon } from "lucide-react";

interface AlertsFeedProps {
  alerts: RadarAlert[];
  onMarkAllRead?: () => void;
}

const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; text: string; border: string }> = {
  positive: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/20",
  },
  negative: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/20",
  },
  info: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
  },
};

const ALERT_ICONS: Record<AlertType, LucideIcon> = {
  brand_appeared: Eye,
  brand_disappeared: EyeOff,
  position_improved: TrendingUp,
  position_declined: TrendingDown,
  new_competitor: Users,
  competitor_overtook: Users,
  citation_gained: Link2,
  citation_lost: LinkIcon,
  audit_score_changed: Shield,
};

export function AlertsFeed({ alerts, onMarkAllRead }: AlertsFeedProps) {
  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Alerts
          </h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#e0a458] text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && onMarkAllRead && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <Info className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No alerts yet. Alerts will appear after your first check.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const styles = SEVERITY_STYLES[alert.severity];
            const Icon = ALERT_ICONS[alert.type] || Info;

            return (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                  alert.read
                    ? "border-border bg-transparent opacity-60"
                    : `${styles.border} ${styles.bg}`
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
                    alert.read ? "bg-muted" : styles.bg
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5",
                      alert.read ? "text-muted-foreground" : styles.text
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {alert.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDate(alert.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {alert.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
