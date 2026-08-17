/** @type {import('next').NextConfig} */
const nextConfig = {
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
