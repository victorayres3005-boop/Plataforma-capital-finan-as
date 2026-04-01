/** @type {import('next').NextConfig} */
const nextConfig = {
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
