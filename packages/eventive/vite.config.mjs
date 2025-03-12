import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    server: {
      deps: {
        fallbackCJS: true,
      },
    },
  },
});
