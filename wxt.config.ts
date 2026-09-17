import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/i18n/module', '@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_, manifest) => {
      delete manifest.side_panel;
    },
  },
  vite: () => ({
    optimizeDeps: {
      include: ['@/shared/schema/jsonresume-v1.validate.cjs'],
    },
  }),
  manifest: {
    default_locale: 'en',
    name: '字段簿 FieldBook',
    description: '用可积累、可编辑的字段字典确定性填充国内校招表单。全部匹配在本地完成，无需 AI。',
    version: '0.1.0',
    manifest_version: 3,
    // NOTE: the toolbar tooltip is NOT set here. WXT overwrites
    // `action.default_title` with the `<title>` of entrypoints/popup/index.html
    // (see wxt/dist/core/utils/manifest.mjs), so edit that HTML instead.
    options_page: 'options.html',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'sidePanel', 'contextMenus', 'tabs'],
    host_permissions: [
      // 「AI 解析」只走 DeepSeek 的 OpenAI 兼容接口。换厂商时改这一行即可。
      // 注意扩展页面的 fetch 不受 CORS 限制，但域名必须在这里声明。
      'https://api.deepseek.com/*',
      'https://*.greenhouse.io/*',
      'https://*.lever.co/*',
      'https://*.myworkdayjobs.com/*',
      'https://*.ashbyhq.com/*',
      'https://*.smartrecruiters.com/*',
      'https://*.workable.com/*',
    ],
    // No web_accessible_resources needed: the pdf.js worker is resolved through
    // Vite's `?worker&url` import inside shared/pdf/extractText.ts and is only
    // used from the extension's own options page, not from content scripts.
  },
});
