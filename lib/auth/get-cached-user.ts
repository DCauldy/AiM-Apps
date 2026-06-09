import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

// `auth.getUser()` makes a network call to Supabase to validate the JWT.
// In a single SSR render, the layout + page + any data-fetcher each call it
// independently — that's 3+ Supabase round-trips for one navigation.
//
// React's `cache()` memoizes by argument identity per render. Wrapping this
// once collapses all of those to a single round-trip.
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
