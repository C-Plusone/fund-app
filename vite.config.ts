import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { VarletImportResolver } from '@varlet/import-resolver'
import { fileURLToPath, URL } from 'node:url'

// [WHY] 配置 Vite 构建工具，支持 Vue3、Vant 和 Varlet 组件自动导入
// [WHAT] 使用 unplugin-vue-components 自动导入组件，无需手动 import
// [NOTE] 迁移期间同时支持 Vant 和 Varlet
export default defineConfig({
  plugins: [
    vue(),
    // [HOW] 同时支持 Vant 和 Varlet 的自动导入
    Components({
      resolvers: [VantResolver(), VarletImportResolver()],
    }),
    AutoImport({
      resolvers: [VarletImportResolver({ autoImport: true })],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // [WHAT] 定义全局常量，构建时注入
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
