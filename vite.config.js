import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cloudflare Pages 배포를 위해 상대경로(base: './') 사용
export default defineConfig({
  plugins: [react()],
  base: './',
});
