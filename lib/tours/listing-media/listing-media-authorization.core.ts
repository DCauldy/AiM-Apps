export const LISTING_MEDIA_ACKNOWLEDGEMENT_COPY =
  "I confirm I am authorized to use the listing media I submit for this Tour Project.";

export type ToursListingMediaAcknowledgement = {
  projectId: string;
  acknowledgedAt: string;
};

export type ProjectAcknowledgementRow = {
  id: string;
  listing_media_acknowledged_at: string | null;
};

export type RecordListingMediaAcknowledgementResult =
  | { ok: true; acknowledgement: ToursListingMediaAcknowledgement }
  | { ok: false; status: 401 | 403 | 404 | 500; error: string };

export type ListingMediaAuthorizationRepository = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getOpenProjectForUser(projectId: string, userId: string): Promise<ProjectAcknowledgementRow | null>;
  acknowledgeProjectListingMedia(projectId: string, userId: string): Promise<ProjectAcknowledgementRow | null>;
};

function mapProjectAcknowledgement(row: ProjectAcknowledgementRow): ToursListingMediaAcknowledgement | null {
  if (!row.listing_media_acknowledged_at) {
    return null;
  }

  return {
    projectId: row.id,
    acknowledgedAt: row.listing_media_acknowledged_at,
  };
}

export async function recordListingMediaAcknowledgementWithRepository(
  projectId: string,
  repository: ListingMediaAuthorizationRepository
): Promise<RecordListingMediaAcknowledgementResult> {
  const user = await repository.getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, error: "Sign in to acknowledge listing-media authorization." };
  }

  const project = await repository.getOpenProjectForUser(projectId, user.id);
  if (!project) {
    return { ok: false, status: 404, error: "Tour Project was not found or cannot be acknowledged." };
  }

  const existing = mapProjectAcknowledgement(project);
  if (existing) {
    return { ok: true, acknowledgement: existing };
  }

  const updated = await repository.acknowledgeProjectListingMedia(project.id, user.id);
  const acknowledgement = updated ? mapProjectAcknowledgement(updated) : null;
  if (!acknowledgement) {
    return { ok: false, status: 500, error: "Could not record listing-media authorization." };
  }

  return { ok: true, acknowledgement };
}
