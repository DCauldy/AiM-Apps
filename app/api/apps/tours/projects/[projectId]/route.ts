import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlag } from "@/lib/admin-config.server";

export const dynamic = "force-dynamic";

const UpdateTourProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120, "Project name is too long"),
  propertyAddress: z.string().trim().min(1, "Property address is required").max(240, "Property address is too long"),
  listingUrl: z
    .string()
    .trim()
    .max(500, "Listing URL is too long")
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().url("Listing URL must be a valid URL").nullable()),
});

async function requireToursAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "Sign in to update tour projects.", status: 401 } as const;
  }

  const isEnabled = await getFeatureFlag("TOURS");
  const subscriptionTier = user.app_metadata?.subscription_tier;
  if (!isEnabled || subscriptionTier !== "pro") {
    return { supabase, user, error: "Tours is not available for this account.", status: 403 } as const;
  }

  return { supabase, user, error: null, status: 200 } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const access = await requireToursAccess();
  if (access.error) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateTourProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Enter valid tour project details." },
      { status: 400 }
    );
  }

  const { projectId } = await params;
  const { data, error } = await access.supabase
    .from("tours_projects")
    .update({
      name: parsed.data.name,
      property_address: parsed.data.propertyAddress,
      listing_url: parsed.data.listingUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", access.user.id)
    .eq("status", "open")
    .select("id, name, property_address, listing_url, status, updated_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Could not update the tour project." }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Tour project was not found or cannot be updated." },
      { status: 404 }
    );
  }

  return Response.json({ project: data });
}
