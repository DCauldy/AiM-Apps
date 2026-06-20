export type ToursAccessProject = {
  id: string;
  name?: string;
  status: "open" | "archived";
};

export type ToursAccessUser = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
};

export type ToursAccessInput = {
  user: ToursAccessUser | null;
  isToursEnabled: boolean;
  project?: ToursAccessProject | null;
  projectError?: boolean;
  requireProject?: boolean;
  requireOpenProject?: boolean;
};

export type ToursAccessDenied = {
  ok: false;
  status: 401 | 403 | 404 | 409 | 500;
  error: string;
};

export type ToursAccessAllowed = {
  ok: true;
};

export type ToursAccessResult = ToursAccessAllowed | ToursAccessDenied;

export function evaluateToursAccess(input: ToursAccessInput): ToursAccessResult {
  if (!input.user) {
    return { ok: false, status: 401, error: "Sign in to access Tours." };
  }

  if (!input.isToursEnabled || input.user.app_metadata?.subscription_tier !== "pro") {
    return { ok: false, status: 403, error: "Tours is not available for this account." };
  }

  if (!input.requireProject && !input.requireOpenProject) {
    return { ok: true };
  }

  if (input.projectError) {
    return { ok: false, status: 500, error: "Could not verify Tour Project access." };
  }

  if (!input.project) {
    return { ok: false, status: 404, error: "Tour Project was not found." };
  }

  if (input.requireOpenProject && input.project.status !== "open") {
    return { ok: false, status: 409, error: "Archived Tour Projects cannot be modified." };
  }

  return { ok: true };
}
