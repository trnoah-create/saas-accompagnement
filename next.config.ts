import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // better-sqlite3 est un module natif : il ne doit pas être empaqueté
  // par le bundler, mais chargé directement par Node.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
