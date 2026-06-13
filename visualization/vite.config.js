import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/influx": {
                target: "http://localhost:8086",
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/influx/, ""); },
            },
        },
    },
});
