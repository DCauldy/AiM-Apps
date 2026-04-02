import { redirect } from "next/navigation";

export default function PromptStudioPage() {
  // Redirect to chat by default
  redirect("/apps/prompt-studio/chat");
}
