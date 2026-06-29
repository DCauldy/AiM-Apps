"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // "Redirecting" persists the loading state through the post-login
  // navigation so the button doesn't briefly snap back to "Sign In"
  // while /apps is loading — which felt like a stall.
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sign in");
      }

      // Switch from "Signing in" → "Redirecting" so the button keeps
      // showing progress while /apps loads. Don't setLoading(false)
      // on the success path — the form unmounts on navigation.
      setRedirecting(true);
      router.push("/apps");
      router.refresh();
    } catch (error: any) {
      addToast({
        title: "Error",
        description: error.message || "Failed to sign in",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const busy = loading || redirecting;

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="login-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={busy}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="login-password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="login-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={busy}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {redirecting
          ? "Redirecting…"
          : loading
            ? "Signing in…"
            : "Sign In"}
      </Button>
    </form>
  );
}
