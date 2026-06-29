import { createBrowserClient } from "@supabase/ssr";

// Module-level singleton. The previous implementation returned a fresh
// SupabaseClient on every call — which, when callers passed it through
// useEffect deps, caused render loops (createClient() → new ref → effect
// re-runs → setUser → re-render → createClient() → repeat). Sharing one
// instance also dedupes the underlying auth listener and storage subscribers.
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return browserClient;
}
