export {};

declare global {
  interface Window {
    /** Present only inside the packaged Electron app (see electron/preload.cjs). */
    letterReader?: {
      openOutputFile: () => Promise<{ ok: boolean; error?: string }>;
      openOutputFolder: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
