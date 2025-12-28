import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "../dist/webview",
		emptyOutDir: true,
		rollupOptions: {
			input: path.resolve(__dirname, "index.html"),
			output: {
				entryFileNames: "assets/[name].js",
				chunkFileNames: "assets/[name].js",
				assetFileNames: "assets/[name].[ext]",
			},
		},
	},
	server: {
		port: 5173,
	},
});
