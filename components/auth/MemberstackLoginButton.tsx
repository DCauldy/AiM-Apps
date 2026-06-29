"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const MEMBERSTACK_APP_ID = process.env.NEXT_PUBLIC_MEMBERSTACK_APP_ID;

export function MemberstackLoginButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const memberstackRef = useRef<any>(null);
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    if (!MEMBERSTACK_APP_ID) return;

    let mounted = true;
    import("@memberstack/dom").then((mod) => {
      if (!mounted) return;
      const memberstackDOM = mod.default;
      memberstackRef.current = memberstackDOM.init({
        publicKey: MEMBERSTACK_APP_ID,
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const memberstack = memberstackRef.current;
    if (!memberstack || loading) return;

    setLoading(true);
    try {
      const result = await memberstack.loginMemberEmailPassword({
        email,
        password,
      });

      if (!result?.data?.member) {
        throw new Error("Login failed");
      }

      const member = result.data.member;

      // Send member data to our API to create a Supabase session
      const res = await fetch("/api/auth/memberstack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberstackId: member.id,
          email: member.auth?.email,
          name: member.customFields?.name || member.metaData?.name || member.auth?.email?.split("@")[0],
          planConnections: member.planConnections,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to sign in");
      }

      // Log out of Memberstack client (we use Supabase sessions)
      try {
        await memberstack.logout();
      } catch {
        // Ignore
      }

      router.push("/apps/prompt-studio/chat");
      router.refresh();
    } catch (error: any) {
      const msg = error?.message || "";
      addToast({
        title: "Sign in failed",
        description: msg.includes("Invalid")
          ? "Invalid email or password"
          : msg || "Could not sign in. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEmail("");
    setPassword("");
  };

  if (!MEMBERSTACK_APP_ID) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
      >
        Sign in with AiM
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="relative w-full max-w-sm rounded-2xl border bg-background shadow-2xl overflow-hidden pointer-events-auto">
              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Header with gradient background */}
              <div
                className="px-6 pt-8 pb-6 text-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(28,76,138,0.08) 0%, rgba(49,219,165,0.08) 100%)",
                }}
              >
                <div className="flex justify-center mb-3">
                  <Image
                    src="/logo.svg"
                    alt="AiM Academy"
                    width={160}
                    height={45}
                    className="h-10 w-auto dark:hidden"
                  />
                  <Image
                    src="/logo-dark.svg"
                    alt="AiM Academy"
                    width={160}
                    height={45}
                    className="h-10 w-auto hidden dark:block"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Sign in with your AiM membership
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="aim-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="aim-email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="aim-password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="aim-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #1C4C8A 0%, #31DBA5 100%)" }}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
