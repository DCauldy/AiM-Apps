/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow MLS uploads up to 50MB through middleware. Default is 10MB and
  // middleware silently truncates larger bodies, breaking multipart parsing.
  experimental: {
    middlewareClientMaxBodySize: "50mb",
  },
  // Suppress Edge Runtime warnings for Supabase SSR compatibility
  // The middleware uses Supabase SSR which may show warnings but works correctly
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;

