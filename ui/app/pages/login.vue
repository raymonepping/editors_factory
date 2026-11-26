<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand">
        <svg class="brand-icon" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="var(--ink)" />
          <path d="M6 22 L6 16 L12 16 L12 19 L20 19 L20 13 L26 13 L26 22 Z" fill="#7dd3fc" />
          <circle cx="23" cy="10" r="2.4" fill="#fbbf24" />
        </svg>
        <span class="login-name">The Factory</span>
      </div>
      <p class="login-sub">Delegated-Authority Security Control Room</p>

      <p v-if="error" class="inline-notice error" role="alert">{{ error }}</p>

      <button class="btn btn-primary login-button" :disabled="busy" @click="signIn">
        {{ busy ? 'Redirecting to Identity Provider…' : 'Sign in with Keycloak' }}
      </button>

      <div class="login-users">
        <p class="login-users-title">Demo Accounts (OpenLDAP / Keycloak):</p>
        <ul class="login-users-list">
          <li><strong>raymon</strong> (Raymon Epping) — <em>factory-operator</em></li>
          <li><strong>barend</strong> (Barend Demo) — <em>factory-operator</em></li>
          <li><strong>claire</strong> (Claire Viewer) — <em>factory-viewer</em></li>
        </ul>
      </div>

      <p class="login-note">
        Human authentication is governed by OpenLDAP federated through Keycloak OIDC.
        Sessions and control operations are protected with role-based authorization.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDemoApi } from '~/composables/useDemoApi'

definePageMeta({ layout: false })
useHead({ title: 'Sign in — The Factory' })

const route = useRoute()
const router = useRouter()
const { getMe } = useDemoApi()

const busy = ref(false)
const error = ref('')

onMounted(async () => {
  if (route.query.error) {
    error.value = 'Sign-in was rejected or cancelled. Please try again.'
  }
  try {
    const m = await getMe()
    if (m.enabled === false || m.user) router.replace(String(route.query.next || '/'))
  } catch {
    // not signed in
  }
})

function signIn() {
  busy.value = true
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  window.location.href = `/gateway/api/v1/auth/login?next=${encodeURIComponent(next)}`
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
/* Same glass recipe as every other pane; larger radius for a larger surface. */
.login-card {
  width: min(420px, 100%);
  background: var(--color-bg-panel);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border: var(--border-width) solid var(--glass-border);
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-lift), var(--shadow-inset-steel);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}
.login-name {
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
}
.login-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 8px 0 20px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.login-button {
  width: 100%;
}
.login-users {
  margin-top: 20px;
  padding: 12px 14px;
  border-radius: var(--radius-control);
  background: var(--well);
  border: var(--border-width) solid var(--color-border-subtle);
}
.login-users-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}
.login-users-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-muted);
}
.login-users-list strong { color: var(--color-text-primary); }
.login-note {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 16px 0 0;
}
.inline-notice.error {
  margin: 0 0 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--hue-red) 10%, transparent);
  border: var(--border-width) solid color-mix(in srgb, var(--hue-red) 25%, transparent);
  border-radius: var(--radius-control);
  color: var(--color-state-critical);
  font-size: 12px;
}
</style>
