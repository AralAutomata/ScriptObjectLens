/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_TELEMETRY_DISABLED: '1',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
  // Disable image optimization to avoid external CDN calls
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
