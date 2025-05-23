import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';
import os from 'os';

// Calculate optimal worker count based on CPU cores
const cpuCount = os.cpus().length;
const workerCount = Math.max(2, cpuCount - 1); // Leave one core free for system

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/electron/main.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: false,
            minify: 'esbuild',
            rollupOptions: {
              external: ['electron']
            },
            target: 'esnext',
            reportCompressedSize: false
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  // Add server configuration with CORS proxy
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api-proxy': {
        target: 'https://cryptovertx.com/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('Proxy error:', err);
          });
        },
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: mode === 'production',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    target: 'esnext',
    reportCompressedSize: false,
    cssMinify: true,
    cssCodeSplit: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui': ['@mui/material', '@emotion/react', '@emotion/styled', 'styled-components'],
          'charts': ['recharts'],
        },
        compact: true
      }
    },
    terserOptions: mode === 'production' ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    } : undefined
  },
  esbuild: {
    target: 'esnext',
    legalComments: 'none',
    treeShaking: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true
  }
})); 