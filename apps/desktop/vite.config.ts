import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { studioPlugin } from "./server/studio";
import { companyMemoryPlugin } from "./server/company-memory";
import { engineInventoryPlugin } from "./server/engine-inventory";
import { projectDirectoriesPlugin } from "./server/project-directories";

export default defineConfig({
  plugins: [react(), studioPlugin(), companyMemoryPlugin(), engineInventoryPlugin(), projectDirectoriesPlugin()],
  server: { host: "127.0.0.1", port: 4173, strictPort: true, watch: { usePolling: true, interval: 500 } },
  clearScreen: false
});
