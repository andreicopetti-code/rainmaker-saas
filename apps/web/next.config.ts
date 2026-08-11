import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@ceo-brain/shared'],
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'rainmaker.ia.br' }],
        destination: 'https://www.rainmaker.ia.br/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
