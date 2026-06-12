import { redirect } from "next/navigation";

export default function CmaIndexPage() {
  redirect("/apps/cma/dashboard");
}
