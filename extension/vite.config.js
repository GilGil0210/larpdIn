import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
export default defineConfig({build:{rollupOptions:{input:{index:'index.html',popup:'popup.html'}}},plugins:[react(),{name:'extension-files',closeBundle(){for(const f of ['manifest.json']) copyFileSync(f,`dist/${f}`)}}]});
