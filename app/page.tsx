import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/apps/prompt-studio/chat");
}
