'use client';

import { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_APP_CONFIG,
  resolveAppConfig,
  type AppConfig,
  type AppConfigOverrides,
} from '@vivexy/core/configs/app-config';

const AppConfigContext = createContext<AppConfig>(DEFAULT_APP_CONFIG);

/**
 * Lets a product rebrand and extend the shared UI. The config holds React
 * components (icons), so render this from a 'use client' module in the
 * product, not directly from a server layout.
 */
export const AppConfigProvider = ({
  config,
  children,
}: {
  config?: AppConfigOverrides;
  children: React.ReactNode;
}) => {
  const resolvedConfig = useMemo(() => resolveAppConfig(config), [config]);
  return (
    <AppConfigContext.Provider value={resolvedConfig}>
      {children}
    </AppConfigContext.Provider>
  );
};

export const useAppConfig = () => useContext(AppConfigContext);
