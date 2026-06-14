export default function RadarSettingsLoading() {
  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
        <div className="h-48 bg-card border border-border rounded-lg animate-pulse" />
      </div>
    </div>
  );
}
