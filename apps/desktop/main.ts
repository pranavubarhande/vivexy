/**
 * Electron main process for Vivexy. All behaviour lives in @vivexy/desktop;
 * createDesktopApp must run at the top level (it registers the app:// scheme
 * before the app is ready).
 */

import * as path from 'path';
import { createDesktopApp } from '@vivexy/desktop';

createDesktopApp({
    productName: 'Vivexy',
    window: { width: 1400, height: 900, minWidth: 800, minHeight: 600 },
    scheme: 'app',
    dataNamespace: 'vivexy',
    preloadPath: path.join(__dirname, 'preload.js'),
});
