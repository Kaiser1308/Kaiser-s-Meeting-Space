import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { fileURLToPath } from 'node:url';

const desktopRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Main-process entrypoint
        entry: 'src/main/main.ts',
        onstart({ startup }) {
          return startup(
            undefined,
            { cwd: desktopRoot },
            new URL('./node_modules/electron/index.js', import.meta.url).href,
          );
        },
      },
      preload: {
        // Preload-script entrypoint
        input: 'src/main/preload.ts',
      },
    }),
  ],
});
