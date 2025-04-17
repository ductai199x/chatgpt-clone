/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [], // Add domains for remote images if needed
    remotePatterns: [],
  },
  // experimental: {
  //   // Enable any Next.js 15.3.0 experimental features if needed
  //   // serverExternalPackages: [],
  //   optimizeCss: true,
  // },
};

export default nextConfig;
