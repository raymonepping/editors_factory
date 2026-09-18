<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-brand">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none">
          <path d="M3 21h18M5 21V7l8-4v18M13 11l6-3v13" stroke="#f97316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="9" cy="11" r="1" fill="#f97316"/>
          <circle cx="9" cy="15" r="1" fill="#f97316"/>
        </svg>
        <span class="font-bold text-lg text-neutral-100">The Factory</span>
      </div>
      <p class="login-sub">Delegated-Authority Security Control Room</p>

      <p v-if="error" class="inline-notice error">{{ error }}</p>

      <button class="primary-button" :disabled="busy" style="width:100%;justify-content:center" @click="signIn">
        {{ busy ? 'Redirecting to Identity Provider…' : 'Sign in with Keycloak' }}
      </button>

      <div class="login-users">
        <p class="text-xs font-semibold text-neutral-400 mb-1">Demo Accounts (OpenLDAP / Keycloak):</p>
        <ul class="text-xs text-neutral-500 space-y-1 list-disc list-inside">
          <li><strong class="text-neutral-300">raymon</strong> (Raymon Epping) — <em>factory-operator</em></li>
          <li><strong class="text-neutral-300">barend</strong> (Barend Demo) — <em>factory-operator</em></li>
          <li><strong class="text-neutral-300">claire</strong> (Claire Viewer) — <em>factory-viewer</em></li>
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
import { useRoute, useRouter } from 'vue-router'
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
  background: radial-gradient(900px 520px at 78% -8%, rgba(249, 115, 22, 0.15), transparent 60%), #0d0e12;
}
.login-card {
  width: min(420px, 100%);
  background: rgba(23, 24, 30, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(14px);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-icon {
  width: 28px;
  height: 28px;
}
.login-sub {
  font-size: 11px;
  color: #a3a3a3;
  margin: 6px 0 20px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.primary-button {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: #f97316;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  border-radius: 8px;
  transition: all 0.2s;
  border: none;
  cursor: pointer;
}
.primary-button:hover:not(:disabled) {
  background: #ea580c;
}
.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.login-users {
  margin-top: 20px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.login-note {
  font-size: 11px;
  color: #737373;
  line-height: 1.5;
  margin: 16px 0 0;
}
.inline-notice.error {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-size: 12px;
}
</style>
