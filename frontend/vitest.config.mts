import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest runs the pure parts of the frontend: the JSON-LD mappers, the Pod path builders,
 * and anything else that is a function of its inputs. These tests never touch a network
 * or a browser session, which is why they can assert on exact bytes.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    reporters: "default",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
