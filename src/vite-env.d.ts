/// <reference types="vite/client" />

import type { StudioHostApi } from '@infrastructure/electron/studio-host-api';

declare global {
  interface Window {
    studioHost?: StudioHostApi;
  }
}

export {};
