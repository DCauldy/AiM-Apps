"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  account_type: string | null;
  subscription_tier: string | null;
  created_at: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  totalPages: number;
}

export function UserOverviewTab() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [accountType, setAccountType] = useState("");
  const { addToast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, [page, accountType]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (accountType) params.set("accountType", accountType);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const json = await res.json();
      setData(json);
    } catch {
      addToast({ title: "Error", description: "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(value: string) {
    setAccountType(value);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Account Type:</label>
        <select
          value={accountType}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="standalone">Standalone</option>
          <option value="aim_member">AiM Member</option>
        </select>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} user{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-muted-foreground">Loading users...</div>
      ) : data && data.users.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Account Type</th>
                <th className="text-left px-4 py-2 font-medium">Tier</th>
                <th className="text-left px-4 py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 truncate max-w-[200px]">
                    {user.email}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {user.full_name || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        user.account_type === "aim_member"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {user.account_type ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {user.subscription_tier ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-muted-foreground">No users found.</div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-muted transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-muted transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
