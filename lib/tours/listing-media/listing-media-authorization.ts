import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  LISTING_MEDIA_ACKNOWLEDGEMENT_COPY,
  recordListingMediaAcknowledgementWithRepository,
  type ListingMediaAuthorizationRepository,
  type ProjectAcknowledgementRow,
  type RecordListingMediaAcknowledgementResult,
  type ToursListingMediaAcknowledgement,
} from "./listing-media-authorization.core";

export { LISTING_MEDIA_ACKNOWLEDGEMENT_COPY };
export type {
  RecordListingMediaAcknowledgementResult,
  ToursListingMediaAcknowledgement,
} from "./listing-media-authorization.core";

const PROJECT_ACKNOWLEDGEMENT_SELECT = "id, listing_media_acknowledged_at";

async function createSupabaseListingMediaAuthorizationRepository(): Promise<ListingMediaAuthorizationRepository> {
  const supabase = await createClient();

  return {
    async getCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      return user ? { id: user.id } : null;
    },
    async getOpenProjectForUser(projectId, userId) {
      const { data, error } = await supabase
        .from("tours_projects")
        .select(PROJECT_ACKNOWLEDGEMENT_SELECT)
        .eq("id", projectId)
        .eq("user_id", userId)
        .eq("status", "open")
        .maybeSingle<ProjectAcknowledgementRow>();

      if (error || !data) {
        return null;
      }

      return data;
    },
    async acknowledgeProjectListingMedia(projectId, userId) {
      const { data, error } = await supabase
        .from("tours_projects")
        .update({ listing_media_acknowledged_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("user_id", userId)
        .eq("status", "open")
        .select(PROJECT_ACKNOWLEDGEMENT_SELECT)
        .single<ProjectAcknowledgementRow>();

      if (error || !data) {
        return null;
      }

      return data;
    },
  };
}

export async function getListingMediaAcknowledgementForProject(
  projectId: string
): Promise<ToursListingMediaAcknowledgement | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tours_projects")
    .select(PROJECT_ACKNOWLEDGEMENT_SELECT)
    .eq("id", projectId)
    .maybeSingle<ProjectAcknowledgementRow>();

  if (error || !data?.listing_media_acknowledged_at) {
    return null;
  }

  return {
    projectId: data.id,
    acknowledgedAt: data.listing_media_acknowledged_at,
  };
}

export async function recordListingMediaAcknowledgement(
  projectId: string
): Promise<RecordListingMediaAcknowledgementResult> {
  const repository = await createSupabaseListingMediaAuthorizationRepository();
  return recordListingMediaAcknowledgementWithRepository(projectId, repository);
}
