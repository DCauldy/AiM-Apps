export type TourRenderDevToolEnvironment = {
  nodeEnv?: string;
  vercelEnv?: string;
};

export function isTourRenderDevToolAvailable({
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
}: TourRenderDevToolEnvironment = {}) {
  if (vercelEnv === "production") {
    return false;
  }

  return nodeEnv === "development" || vercelEnv === "preview";
}
