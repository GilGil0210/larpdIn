import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
export default defineConfig({plugins:[react(),{name:'extension-files',closeBundle(){for(const f of ['manifest.json','background.js']) copyFileSync(f,`dist/${f}`)}}]});
