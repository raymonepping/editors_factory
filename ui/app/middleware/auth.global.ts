// app/middleware/auth.global.ts — Enforces authentication for The Factory UI.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return
  if (to.path.startsWith('/gateway/')) return

  if (import.meta.server) {
    const requestFetch = useRequestFetch()
    try {
      const me = await requestFetch<{ enabled: boolean; user?: string }>('/gateway/api/v1/auth/me')
      if (me?.enabled === false) return
      if (!me?.user) {
        return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
      }
    } catch (e: any) {
      return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
    }
    return
  }

  try {
    const me = await $fetch<{ enabled: boolean; user?: string }>('/gateway/api/v1/auth/me')
    if (me?.enabled === false) return
    if (!me?.user) {
      return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
    }
  } catch (e: any) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }
})
