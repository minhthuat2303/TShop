/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'xlsx'],
  reactStrictMode: true,
};

export default nextConfig;
