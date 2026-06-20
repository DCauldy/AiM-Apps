"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TourProjectWorkspaceViewModel } from "@/lib/tours/workspace";
import {
  acknowledgeListingMediaAuthorization,
  archiveTourProject,
  fetchTourProjectWorkspace,
  tourQueryKeys,
  updateTourProjectDetails,
} from "@/components/tours/tours-api-client";
import type { ProjectDetailsForm } from "./WorkspacePresentation";

type TourProjectWorkspaceContextValue = {
  viewModel: TourProjectWorkspaceViewModel;
  isProjectDetailsOpen: boolean;
  setIsProjectDetailsOpen: (open: boolean) => void;
  isProjectDeleteOpen: boolean;
  setIsProjectDeleteOpen: (open: boolean) => void;
  projectDetails: ProjectDetailsForm;
  setProjectDetails: (details: ProjectDetailsForm) => void;
  updateProjectMutation: ReturnType<typeof useUpdateTourProjectMutation>;
  archiveProjectMutation: ReturnType<typeof useArchiveTourProjectMutation>;
  acknowledgementMutation: ReturnType<typeof useAcknowledgeListingMediaAuthorizationMutation>;
  invalidateWorkspace: () => void;
  handleProjectDetailsSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const TourProjectWorkspaceContext = createContext<TourProjectWorkspaceContextValue | null>(null);

export function tourWorkspaceQueryKey(projectId: string) {
  return tourQueryKeys.workspace(projectId);
}

export function useTourProjectWorkspaceQuery(
  projectId: string,
  initialViewModel: TourProjectWorkspaceViewModel
) {
  return useQuery({
    queryKey: tourQueryKeys.workspace(projectId),
    queryFn: () => fetchTourProjectWorkspace(projectId),
    initialData: initialViewModel,
    refetchOnWindowFocus: false,
  });
}

function useAcknowledgeListingMediaAuthorizationMutation({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => acknowledgeListingMediaAuthorization(projectId),
    onMutate: async () => {
      const queryKey = tourWorkspaceQueryKey(projectId);
      await queryClient.cancelQueries({ queryKey });
      const previousWorkspace =
        queryClient.getQueryData<TourProjectWorkspaceViewModel>(queryKey);

      queryClient.setQueryData<TourProjectWorkspaceViewModel>(queryKey, (workspace) =>
        workspace
          ? {
              ...workspace,
              listingMediaAuthorization: {
                ...workspace.listingMediaAuthorization,
                hasAcknowledged: true,
                acknowledgedAt: new Date().toISOString(),
              },
            }
          : workspace
      );

      return { previousWorkspace };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousWorkspace) {
        queryClient.setQueryData(
          tourWorkspaceQueryKey(projectId),
          context.previousWorkspace
        );
      }
    },
    onSuccess,
  });
}

function useUpdateTourProjectMutation({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: () => void;
}) {
  return useMutation({
    mutationFn: (details: ProjectDetailsForm) => updateTourProjectDetails(projectId, details),
    onSuccess,
  });
}

function useArchiveTourProjectMutation(projectId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => archiveTourProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tourQueryKeys.openProjects() });
      router.push("/apps/tours/dashboard");
    },
  });
}

export function TourProjectWorkspaceProvider({
  initialViewModel,
  children,
}: {
  initialViewModel: TourProjectWorkspaceViewModel;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const workspaceQuery = useTourProjectWorkspaceQuery(initialViewModel.project.id, initialViewModel);
  const viewModel = workspaceQuery.data;
  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState(false);
  const [isProjectDeleteOpen, setIsProjectDeleteOpen] = useState(false);
  const [projectDetails, setProjectDetails] = useState<ProjectDetailsForm>({
    name: viewModel.project.name,
    propertyAddress: viewModel.listing.address,
    listingUrl: viewModel.listing.listingUrl ?? "",
    elevenLabsVoiceId: viewModel.project.elevenLabsVoiceId ?? "",
    heyGenAvatarId: viewModel.project.heyGenAvatarId ?? "",
    heyGenAvatarPlacement: viewModel.project.heyGenAvatarPlacement,
  });

  useEffect(() => {
    if (isProjectDetailsOpen) {
      return;
    }

    setProjectDetails({
      name: viewModel.project.name,
      propertyAddress: viewModel.listing.address,
      listingUrl: viewModel.listing.listingUrl ?? "",
      elevenLabsVoiceId: viewModel.project.elevenLabsVoiceId ?? "",
      heyGenAvatarId: viewModel.project.heyGenAvatarId ?? "",
      heyGenAvatarPlacement: viewModel.project.heyGenAvatarPlacement,
    });
  }, [
    isProjectDetailsOpen,
    viewModel.listing.address,
    viewModel.listing.listingUrl,
    viewModel.project.elevenLabsVoiceId,
    viewModel.project.heyGenAvatarId,
    viewModel.project.heyGenAvatarPlacement,
    viewModel.project.name,
  ]);

  const invalidateWorkspace = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: tourWorkspaceQueryKey(viewModel.project.id),
    });
    router.refresh();
  }, [queryClient, router, viewModel.project.id]);

  const acknowledgementMutation = useAcknowledgeListingMediaAuthorizationMutation({
    projectId: viewModel.project.id,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tourWorkspaceQueryKey(viewModel.project.id),
      });
    },
  });
  const updateProjectMutation = useUpdateTourProjectMutation({
    projectId: viewModel.project.id,
    onSuccess: () => {
      setIsProjectDetailsOpen(false);
      invalidateWorkspace();
    },
  });
  const archiveProjectMutation = useArchiveTourProjectMutation(viewModel.project.id);

  const handleProjectDetailsSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      updateProjectMutation.mutate(projectDetails);
    },
    [projectDetails, updateProjectMutation]
  );

  return (
    <TourProjectWorkspaceContext.Provider
      value={{
        viewModel,
        isProjectDetailsOpen,
        setIsProjectDetailsOpen,
        isProjectDeleteOpen,
        setIsProjectDeleteOpen,
        projectDetails,
        setProjectDetails,
        updateProjectMutation,
        archiveProjectMutation,
        acknowledgementMutation,
        invalidateWorkspace,
        handleProjectDetailsSubmit,
      }}
    >
      {children}
    </TourProjectWorkspaceContext.Provider>
  );
}

export function useTourProjectWorkspace() {
  const context = useContext(TourProjectWorkspaceContext);
  if (!context) {
    throw new Error("useTourProjectWorkspace must be used within TourProjectWorkspaceProvider.");
  }
  return context;
}
