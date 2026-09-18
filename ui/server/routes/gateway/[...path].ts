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
    throw createError({
      statusCode: code,
      statusMessage: code === 401 ? 'Authentication required' : code === 403 ? 'Permission denied' : 'Factory API unavailable',
      data,
    })
  }
})
