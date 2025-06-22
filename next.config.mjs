/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      "localhost"
    ], // Add domains for remote images if needed
    remotePatterns: [],
  },
  async rewrites() {
    return [
      {
        source: '/api/mcp-proxy/:path*',
        destination: '/api/mcp-proxy/:path*', // Keep API routes internal
      },
    ];
  },
  // experimental: {
  //   // Enable any Next.js 15.3.0 experimental features if needed
  //   // serverExternalPackages: [],
  //   optimizeCss: true,
  // },
};

export default nextConfig;
