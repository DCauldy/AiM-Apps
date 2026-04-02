import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User | null): boolean {
  return user?.app_metadata?.is_admin === true;
}
