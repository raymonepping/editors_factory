export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path') || ''
  const config = useRuntimeConfig(event)
  const apiInternal = config.factoryApiInternal || config.public.apiBase || 'http://localhost:3001'
  const target = new URL(path, `${apiInternal.replace(/\/$/, '')}/`)
  target.search = getRequestURL(event).search
  setHeader(event, 'cache-control', 'no-store')
  const cookie = getHeader(event, 'cookie')

  try {
    const r = await $fetch.raw(target.toString(), {
      method: event.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      body: ['POST', 'PUT', 'PATCH'].includes(event.method) ? await readBody(event) : undefined,
      headers: cookie ? { cookie } : undefined,
      timeout: 8000,
    })
    const setCookie = r.headers.get('set-cookie')
    if (setCookie) appendResponseHeader(event, 'set-cookie', setCookie)
    return r._data
  } catch (error: unknown) {
    const code = (error as { statusCode?: number }).statusCode || 502
    const data = (error as { data?: unknown }).data
    // Found live: this used to discard factory-api's own response body for
    // every status other than 401/403, replacing it with a fixed generic
    // "Factory API unavailable" — even when factory-api responded with a
    // real, specific, actionable reason (e.g. POST /api/dag/runs's own
    // 409 "workflow_mode is X, not Y — switch it first via ..."). That
    // real reason was silently swallowed everywhere in the dashboard,
    // visible only by opening devtools and reading the raw network
    // response. Prefer factory-api's own `error` field when it sent one;
    // only fall back to a generic message for a genuine gateway-level
    // failure (factory-api unreachable, timed out, or returned something
    // with no body at all) where there is no real reason to surface.
    const backendMessage = (data as { error?: string } | undefined)?.error
    throw createError({
      statusCode: code,
      statusMessage:
        backendMessage ||
        (code === 401 ? 'Authentication required' : code === 403 ? 'Permission denied' : 'Factory API unavailable'),
      data,
    })
  }
})
