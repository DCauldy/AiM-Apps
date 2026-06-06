import { CreateTourProjectForm } from "@/components/tours/CreateTourProjectForm";
import { TourProjectsList } from "@/components/tours/TourProjectsList";
import { PageFrame, PageHeader } from "@/components/app-shell/PagePrimitives";

export default function ToursDashboardPage() {
  return (
    <PageFrame>
      <PageHeader
        title="Tours"
        description="Create one-property listing projects and keep active tour work organized."
        actions={<CreateTourProjectForm />}
      />
      <div>
        <TourProjectsList />
      </div>
    </PageFrame>
  );
}
