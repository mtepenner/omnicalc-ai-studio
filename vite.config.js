import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      port: 5173,
      open: true,
    },
    define: {
      __app_id: JSON.stringify(env.VITE_APP_ID || 'omnicalc-ai-studio'),
      __firebase_config: JSON.stringify(env.VITE_FIREBASE_CONFIG || '{}'),
      __initial_auth_token: JSON.stringify(env.VITE_INITIAL_AUTH_TOKEN || ''),
    },
  };
});
