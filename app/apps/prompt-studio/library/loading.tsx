import { LibraryPageSkeleton } from "@/components/prompt-studio/LibraryPageSkeleton";

export default function CommunityPromptsLoading() {
  // Community Prompts has the "Submit Prompt" CTA in its toolbar
  // (AiM Library + Bookmarked don't), so flag it on here.
  return <LibraryPageSkeleton showSubmitButton />;
}
