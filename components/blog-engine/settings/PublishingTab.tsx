"use client";

import { useState } from "react";
import {
  Loader2,
  Globe,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Webhook,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm";
import type { BofuCmsConnection, CmsPlatform } from "@/types/blog-engine";

const SEO_PLUGIN_LABELS: Record<string, string> = {
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
  none: "None",
};

export function PublishingTab({
  initialConnections,
}: {
  initialConnections: BofuCmsConnection[];
}) {
  const [connections, setConnections] = useState(initialConnections);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; siteName?: string; error?: string }>
  >({});
  const [removingId, setRemovingId] = useState<string | null>(null);
  const confirm = useConfirm();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPlatform, setAddPlatform] = useState<CmsPlatform | null>(null);
  const [addingConnection, setAddingConnection] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newWpConnection, setNewWpConnection] = useState({
    wp_site_url: "",
    wp_username: "",
    wp_app_password: "",
    wp_default_status: "draft" as "draft" | "publish",
    wp_seo_plugin: "none" as "yoast" | "rankmath" | "none",
  });
  const [newWebhookConnection, setNewWebhookConnection] = useState({
    webhook_url: "",
    webhook_secret: "",
  });

  const handleTestConnection = async (connectionId: string) => {
    setTestingId(connectionId);
    setTestResults((prev) => ({ ...prev, [connectionId]: undefined! }));
    try {
      const res = await fetch("/api/apps/blog-engine/cms-connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [connectionId]: {
          success: data.success,
          siteName: data.siteName,
          error: data.error,
        },
      }));
      if (data.success) {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === connectionId ? { ...c, last_error: undefined } : c,
          ),
        );
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [connectionId]: { success: false, error: "Network error" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleRemoveConnection = async (connectionId: string) => {
    const ok = await confirm({
      title: "Remove this CMS connection?",
      description: "Future publishes from this site will stop.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setRemovingId(connectionId);
    try {
      const res = await fetch("/api/apps/blog-engine/cms-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[connectionId];
          return next;
        });
      }
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddConnection = async () => {
    if (!addPlatform) return;

    let payload: Record<string, unknown>;
    if (addPlatform === "wordpress") {
      if (
        !newWpConnection.wp_site_url ||
        !newWpConnection.wp_username ||
        !newWpConnection.wp_app_password
      )
        return;
      payload = { platform: "wordpress", ...newWpConnection };
    } else {
      if (!newWebhookConnection.webhook_url) return;
      payload = { platform: "webhook", ...newWebhookConnection };
    }

    setAddingConnection(true);
    setAddError(null);
    try {
      const res = await fetch("/api/apps/blog-engine/cms-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.connection) {
        setConnections((prev) => [...prev, data.connection]);
        setNewWpConnection({
          wp_site_url: "",
          wp_username: "",
          wp_app_password: "",
          wp_default_status: "draft",
          wp_seo_plugin: "none",
        });
        setNewWebhookConnection({ webhook_url: "", webhook_secret: "" });
        setShowAddForm(false);
        setAddPlatform(null);
      } else {
        setAddError(data.error || "Failed to add connection");
      }
    } catch {
      setAddError("Network error — could not reach server");
    } finally {
      setAddingConnection(false);
    }
  };

  return (
    <div className="space-y-4">
      {connections.length === 0 && !showAddForm ? (
        <div className="rounded-md border border-dashed p-6 text-center">
          <Globe className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            No publishing destinations configured.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Connection
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <CmsConnectionCard
              key={conn.id}
              connection={conn}
              testResult={testResults[conn.id]}
              testing={testingId === conn.id}
              removing={removingId === conn.id}
              onTest={() => handleTestConnection(conn.id)}
              onRemove={() => handleRemoveConnection(conn.id)}
            />
          ))}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another connection
            </button>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="rounded-md border p-4 space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {addPlatform === "wordpress"
                ? "Add WordPress Connection"
                : addPlatform === "webhook"
                  ? "Add Webhook Connection"
                  : "Add Connection"}
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                setAddPlatform(null);
                setAddError(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {!addPlatform && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAddPlatform("wordpress")}
                className="flex flex-col items-center gap-2 rounded-md border border-border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
              >
                <Globe className="h-6 w-6 text-foreground" />
                <span className="text-sm font-medium text-foreground">
                  WordPress
                </span>
                <span className="text-[10px] text-muted-foreground text-center">
                  Publish directly via REST API
                </span>
              </button>
              <button
                onClick={() => setAddPlatform("webhook")}
                className="flex flex-col items-center gap-2 rounded-md border border-border p-4 hover:border-primary hover:bg-accent/50 transition-colors"
              >
                <Webhook className="h-6 w-6 text-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Webhook
                </span>
                <span className="text-[10px] text-muted-foreground text-center">
                  Zapier, Make, or custom endpoint
                </span>
              </button>
            </div>
          )}

          {addPlatform === "wordpress" && (
            <>
              <Field label="Site URL">
                <input
                  type="url"
                  value={newWpConnection.wp_site_url}
                  onChange={(e) =>
                    setNewWpConnection({
                      ...newWpConnection,
                      wp_site_url: e.target.value,
                    })
                  }
                  placeholder="https://yourblog.com"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Username">
                <input
                  type="text"
                  value={newWpConnection.wp_username}
                  onChange={(e) =>
                    setNewWpConnection({
                      ...newWpConnection,
                      wp_username: e.target.value,
                    })
                  }
                  placeholder="WordPress username"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Application Password">
                <input
                  type="password"
                  value={newWpConnection.wp_app_password}
                  onChange={(e) =>
                    setNewWpConnection({
                      ...newWpConnection,
                      wp_app_password: e.target.value,
                    })
                  }
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Default Post Status">
                  <select
                    value={newWpConnection.wp_default_status}
                    onChange={(e) =>
                      setNewWpConnection({
                        ...newWpConnection,
                        wp_default_status: e.target.value as
                          | "draft"
                          | "publish",
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="publish">Publish</option>
                  </select>
                </Field>
                <Field label="SEO Plugin">
                  <select
                    value={newWpConnection.wp_seo_plugin}
                    onChange={(e) =>
                      setNewWpConnection({
                        ...newWpConnection,
                        wp_seo_plugin: e.target.value as
                          | "yoast"
                          | "rankmath"
                          | "none",
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="yoast">Yoast SEO</option>
                    <option value="rankmath">Rank Math</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {addPlatform === "webhook" && (
            <>
              <Field label="Webhook URL">
                <input
                  type="url"
                  value={newWebhookConnection.webhook_url}
                  onChange={(e) =>
                    setNewWebhookConnection({
                      ...newWebhookConnection,
                      webhook_url: e.target.value,
                    })
                  }
                  placeholder="https://hooks.zapier.com/... or your endpoint"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Signing Secret (optional)">
                <input
                  type="password"
                  value={newWebhookConnection.webhook_secret}
                  onChange={(e) =>
                    setNewWebhookConnection({
                      ...newWebhookConnection,
                      webhook_secret: e.target.value,
                    })
                  }
                  placeholder="HMAC-SHA256 secret for payload verification"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <p className="text-[10px] text-muted-foreground">
                Blog data will be POSTed as JSON with an{" "}
                <code className="text-[10px]">X-AiM-Signature</code> header if a
                secret is set. Works with Zapier, Make, n8n, or any custom
                endpoint.
              </p>
            </>
          )}

          {addError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{addError}</p>
            </div>
          )}
          {addPlatform && (
            <button
              onClick={handleAddConnection}
              disabled={
                addingConnection ||
                (addPlatform === "wordpress" &&
                  (!newWpConnection.wp_site_url ||
                    !newWpConnection.wp_username ||
                    !newWpConnection.wp_app_password)) ||
                (addPlatform === "webhook" && !newWebhookConnection.webhook_url)
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {addingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add Connection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function CmsConnectionCard({
  connection,
  testResult,
  testing,
  removing,
  onTest,
  onRemove,
}: {
  connection: BofuCmsConnection;
  testResult?: { success: boolean; siteName?: string; error?: string };
  testing: boolean;
  removing: boolean;
  onTest: () => void;
  onRemove: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
            <Globe className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground capitalize">
                {connection.platform}
              </p>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full",
                  connection.is_active
                    ? "border border-[#31DBA5]/40 text-[#31DBA5]"
                    : "border border-border text-muted-foreground",
                )}
              >
                {connection.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {connection.wp_site_url || connection.webhook_url || "Connected"}
            </p>
          </div>
        </div>
      </div>

      {connection.platform === "wordpress" && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {connection.wp_username && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Username</span>
              <span className="text-foreground">{connection.wp_username}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Password</span>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="flex items-center gap-1 text-foreground hover:text-primary transition-colors"
            >
              ••••••••
              {showPassword ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Default status</span>
            <span className="text-foreground capitalize">
              {connection.wp_default_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SEO plugin</span>
            <span className="text-foreground">
              {SEO_PLUGIN_LABELS[connection.wp_seo_plugin] ||
                connection.wp_seo_plugin}
            </span>
          </div>
          {connection.last_publish_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last published</span>
              <span className="text-foreground">
                {new Date(connection.last_publish_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}

      {connection.platform === "webhook" && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Endpoint</span>
            <span className="text-foreground truncate max-w-[240px]">
              {connection.webhook_url}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Signing secret</span>
            <span className="text-foreground">
              {connection.webhook_secret ? "Configured" : "None"}
            </span>
          </div>
          {connection.last_publish_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last published</span>
              <span className="text-foreground">
                {new Date(connection.last_publish_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}

      {connection.last_error && !testResult && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{connection.last_error}</p>
        </div>
      )}

      {testResult && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2",
            testResult.success ? "bg-[#31DBA5]/5" : "bg-destructive/5",
          )}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[#31DBA5] mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          )}
          <p
            className={cn(
              "text-xs",
              testResult.success ? "text-[#31DBA5]" : "text-destructive",
            )}
          >
            {testResult.success
              ? `Connected${testResult.siteName ? ` to ${testResult.siteName}` : ""}`
              : testResult.error || "Connection failed"}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Globe className="h-3.5 w-3.5" />
          )}
          Test Connection
        </button>
        <button
          onClick={onRemove}
          disabled={removing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
        >
          {removing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Remove
        </button>
      </div>
    </div>
  );
}
