/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Keep the Next.js workspace scoped to the frontend in this monorepo.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Redirect legacy /auth path to /login
  async redirects() {
    return [
      {
        source: '/auth',
        destination: '/login',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
