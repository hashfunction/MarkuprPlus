import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const distribution = process.env.MARKUPRPLUS_DISTRIBUTION === 'mas' ? 'mas' : 'direct'
const distributionDefine = {
  __MARKUPRPLUS_DISTRIBUTION__: JSON.stringify(distribution)
}

export default defineConfig({
  main: {
    define: distributionDefine,
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      lib: {
        entry: resolve(__dirname, 'src/main/bootstrap.ts'),
        formats: ['es']
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/bootstrap.ts')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs'
        }
      }
    }
  },
  preload: {
    define: distributionDefine,
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    define: distributionDefine,
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      // AudioWorklet modules must remain file-backed so the renderer CSP can
      // load them without allowing data: or blob: script sources.
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})
