export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  return relayOidcHop(event, 'api/v1/auth/callback')
})
