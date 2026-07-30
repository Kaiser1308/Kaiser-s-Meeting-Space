import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main-process entrypoint
        entry: 'src/main/main.ts',
      },
      {
        // Preload-script entrypoint
        entry: 'src/main/preload.ts',
      },
    ]),
  ],
});
