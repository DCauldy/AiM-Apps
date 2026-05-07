"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface Admin {
  id: string;
  email: string;
  name: string | null;
}

export function AdminAccessTab() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetchAdmins();
  }, []);

  async function fetchAdmins() {
    try {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) throw new Error("Failed to fetch admins");
      const data = await res.json();
      setAdmins(data);
    } catch {
      addToast({ title: "Error", description: "Failed to load admins", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setAdding(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add admin");
      }

      setEmail("");
      addToast({ title: "Admin added", description: email.trim() });
      fetchAdmins();
    } catch (err) {
      addToast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to add admin",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function removeAdmin(userId: string) {
    setRemoving(userId);
    try {
      const res = await fetch(`/api/admin/admins/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove admin");
      }

      addToast({ title: "Admin removed" });
      fetchAdmins();
    } catch (err) {
      addToast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to remove admin",
        variant: "destructive",
      });
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading admins...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Current admins */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Current Admins</h2>
        <div className="space-y-2">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <p className="text-sm font-medium">{admin.email}</p>
                {admin.name && (
                  <p className="text-xs text-muted-foreground">{admin.name}</p>
                )}
              </div>
              <button
                onClick={() => removeAdmin(admin.id)}
                disabled={removing === admin.id}
                className="text-sm text-destructive hover:text-destructive/80 disabled:opacity-50"
              >
                {removing === admin.id ? "Removing..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add admin */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Add Admin</h2>
        <form onSubmit={addAdmin} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adding || !email.trim()}
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </form>
      </div>
    </div>
  );
}
