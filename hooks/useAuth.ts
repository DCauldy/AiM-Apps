"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    const accountType = user?.app_metadata?.account_type;
    await supabase.auth.signOut();

    if (accountType === "standalone") {
      window.location.href = "/login";
    } else {
      // AiM members redirect to WordPress dashboard
      window.location.href = process.env.NEXT_PUBLIC_AIM_BASE_URL
        ? `${process.env.NEXT_PUBLIC_AIM_BASE_URL}/dashboard/`
        : "https://aimarketingacademy.com/dashboard/";
    }
  };

  return { user, loading, signOut };
}
