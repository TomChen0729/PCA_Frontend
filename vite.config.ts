import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  
  // ----- server 代理設定 -----
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001', // ⚠️ 請記得把這裡改成你實際的後端 Server 網址與 Port
        changeOrigin: true,
        
        // 如果你的後端 API 路徑本身沒有包含 /api，請將下面這行開頭的雙斜線 // 刪掉（取消註解）
        // rewrite: (path) => path.replace(/^\/api/, '')
      },
    },
  },
})
