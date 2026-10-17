'use client';

import { createContext, useContext } from 'react';

const PlatformAccessContext = createContext({ canManage: false });

export const PlatformAccessProvider = PlatformAccessContext.Provider;

export const usePlatformAccess = () => useContext(PlatformAccessContext);
