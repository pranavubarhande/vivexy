/**
 * Preload script: exposes `window.electronAPI`. Bundled with esbuild because
 * sandboxed preload scripts can only require 'electron'.
 */

import { exposeElectronAPI } from '@vivexy/desktop/preload';

exposeElectronAPI();
