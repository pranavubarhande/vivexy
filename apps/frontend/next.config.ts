import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const isDesktopBuild = process.env.NEXT_DESKTOP === '1';

const nextConfig: NextConfig = {
  output: isDesktopBuild ? 'export' : 'standalone',
  ...(isDesktopBuild
    ? { trailingSlash: true, images: { unoptimized: true } }
    : { outputFileTracingRoot: path.join(__dirname, '../../') }),
};

export default withSentryConfig(nextConfig, {
  org: 'portfolio-helper',
  project: 'frontend',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: true,
  },
  disableLogger: true,
  automaticVercelMonitors: true,
});
