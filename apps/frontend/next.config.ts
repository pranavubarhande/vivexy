import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
