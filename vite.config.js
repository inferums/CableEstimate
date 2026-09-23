import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /*
     * exceljs весит около 940 КБ и не помещается в порог по умолчанию, но
     * дробить его незачем: он грузится отдельным куском только при выгрузке
     * в Excel, а не при открытии приложения. Порог поднят, чтобы
     * предупреждение осталось сигналом о действительно разросшемся коде.
     */
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
