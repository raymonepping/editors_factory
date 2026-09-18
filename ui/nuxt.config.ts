import tailwindcss from '@tailwindcss/vite'

// prompts/frontend/01_01_factory_dashboard_ui.md — the dashboard talks
// directly to factory-api (no server-side gateway/proxy, unlike
// arcanium's own UI): this is a local, single-operator demo tool with no
// login (01_01's own non-goal), so there is no session/cookie to protect
// behind a same-origin proxy. The browser's own SSE connection goes
// straight to factory-api's published port (backend/src/index.js's own
// CORS comment has the full account of why that's the deliberate design
// here, not an oversight).
export default defineNuxtConfig({
  compatibilityDate: '2026-09-18',
  future: { compatibilityVersion: 4 },

  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  runtimeConfig: {
    public: {
      // Overridden at runtime by NUXT_PUBLIC_API_BASE (compose/ui/compose.yaml)
      apiBase: 'http://localhost:3001',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  app: {
    head: {
      title: 'The Factory',
      meta: [
        { name: 'description', content: 'The Factory — delegated-authority AI agent demo control room' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },
})
