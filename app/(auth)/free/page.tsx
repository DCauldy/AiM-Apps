import { redirect } from "next/navigation";

export default function FreePage() {
  return redirect("/login?signup=true");
}
