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
    name: 'Fillo',
    description: 'Turn your resume into effortless job applications. Fillo keeps your experience at your fingertips and lands applications in just a few clicks.',
    version: '0.1.0',
    manifest_version: 3,
    action: {
      default_title: 'Fillo',
    },
    options_page: 'options.html',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'sidePanel', 'contextMenus', 'tabs'],
    host_permissions: [
      'https://api.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
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
