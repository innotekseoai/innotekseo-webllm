import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  webpack: (config) => {
    // Resolve .js imports to .ts files (ESM compatibility)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };

    // Fix "Unable to snapshot resolve dependencies" on Termux/Android filesystem
    config.snapshot = {
      ...config.snapshot,
      managedPaths: [/^(.+?[\\/]node_modules[\\/])/],
      immutablePaths: [],
      buildDependencies: { hash: true, timestamp: true },
      module: { timestamp: true },
      resolve: { timestamp: true },
    };

    return config;
  },
};

export default nextConfig;
