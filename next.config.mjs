/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  compiler: {
    // logs preservados em prod p/ debug operacional (Victor olha DevTools/Vercel direto)
    removeConsole: false,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse tries to load test files; mark them as external to avoid issues
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("canvas");
      }
    }
    return config;
  },
};

export default nextConfig;
