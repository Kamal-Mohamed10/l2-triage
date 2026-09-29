import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so a production build can also be opened directly
  // from the filesystem (file://) for offline demos and smoke testing.
  base: './',
})
