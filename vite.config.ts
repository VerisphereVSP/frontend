import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // In Docker: protocol is at /protocol (copied by Dockerfile Stage 1)
      // Locally: protocol is at ../../protocol relative to frontend/
      // The PROTOCOL_PATH env var lets Docker override this.
      "@verisphere/protocol": process.env.PROTOCOL_PATH
        ? path.resolve(process.env.PROTOCOL_PATH, "dist")
        : path.resolve(__dirname, "../protocol/dist"),
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["test.verisphere.co"],

    proxy: {
      "/api": {
        target: "http://app:8070",
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            console.log(
              "[Vite Proxy] →",
              req.method,
              req.url,
              "→",
              proxyReq.path,
            );
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            console.log("[Vite Proxy] ←", proxyRes.statusCode, req.url);
          });
          proxy.on("error", (err) => {
            console.error("[Vite Proxy] ERROR:", err.message);
          });
        },
      },
    },

    hmr: { overlay: true },

    // patch_vite_link_v2: never traverse .git/ in HMR file-watcher.
    // Without this, accidental presence of .git inside the container
    // (e.g. baked in by COPY frontend/ . during image build) causes
    // vite to try to import-analyze .git/index as JS, throwing.
    watch: {
      ignored: ["**/.git/**", "**/node_modules/**"],
    },

    // patch_vite_fs_deny_v3: refuse to serve .git or other sensitive paths,
    // regardless of how they end up in vite's request pipeline.
    // server.fs.deny is checked at request time, not file-watch time.
    fs: {
      deny: [".git", ".git/**", "**/.env", "**/.env.*"],
    },
  },
});
