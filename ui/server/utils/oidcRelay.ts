// oidcRelay.ts — Relays browser-facing OIDC hop to Express (factory-api)
import type { H3Event } from 'h3'

export async function relayOidcHop(event: H3Event, apiPath: string) {
  const config = useRuntimeConfig(event)
  const apiInternal = config.factoryApiInternal || config.public.apiBase || 'http://localhost:3001'
  const target = new URL(apiPath, `${apiInternal.replace(/\/$/, '')}/`)
  target.search = getRequestURL(event).search
  const cookie = getHeader(event, 'cookie')

  const r = await $fetch.raw(target.toString(), {
    method: 'GET',
    headers: cookie ? { cookie } : undefined,
    timeout: 8000,
    redirect: 'manual',
    ignoreResponseError: true,
  })

  const setCookie = r.headers.get('set-cookie')
  if (setCookie) appendResponseHeader(event, 'set-cookie', setCookie)

  const location = r.headers.get('location')
  if (location && r.status >= 300 && r.status < 400) {
    return sendRedirect(event, location, r.status as 301 | 302 | 303 | 307 | 308)
  }

  setResponseStatus(event, r.status || 502)
  return r._data
}
