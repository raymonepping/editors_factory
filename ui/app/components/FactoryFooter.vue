<script setup lang="ts">
const year = new Date().getFullYear()

// prompts/frontend/01_02_dashboard_navigation_and_sidebar.md, Finding 2:
// this used to be `position: fixed` to the viewport bottom, which
// permanently consumed ~110-140px of every screen's height (confirmed via
// Playwright at both target demo resolutions) and produced a full-page
// screenshot stitching artifact on narrow viewports (Finding 6 — a fixed
// element gets captured at a fixed offset from the top of each expanded
// capture pass, so it appeared to render "inside" whatever content
// happened to occupy that offset). Now a normal in-flow footer, once per
// page via the shared dashboard layout — it sits at the true end of the
// document, never overlays content, and needs no reserved padding hack.

// Folded by default — keeps the footer compact; the legend is one click
// away, not gone.
const legendOpen = ref(false)
if (import.meta.client) {
  try {
    legendOpen.value = localStorage.getItem('factory-footer:legend') === '1'
  } catch {
    // Private browsing / storage disabled — stays folded.
  }
}
function toggleLegend() {
  legendOpen.value = !legendOpen.value
  if (import.meta.client) {
    try { localStorage.setItem('factory-footer:legend', legendOpen.value ? '1' : '0') } catch {}
  }
}

// Reinforces 01_00's own rule ("status never depends on color alone") —
// the footer legend is functional, not decorative: every state color used
// anywhere in the dashboard is named here once.
const legend = [
  { swatch: 'var(--color-accent-primary)', label: 'Active / energy' },
  { swatch: 'var(--color-border-info)', label: 'Information / contained' },
  { swatch: 'var(--color-state-warning)', label: 'Warning / elevated' },
  { swatch: 'var(--color-state-critical)', label: 'Critical / destructive' },
] as const

const words = ['Delegate', 'Amplify', 'Contain', 'Learn'] as const

const links = [
  {
    label: 'GitHub',
    href: 'https://github.com/raymonepping',
    path: 'M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z',
  },
  {
    label: 'X',
    href: 'https://x.com/doctor_nosql',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L2.25 2.25h6.988l4.26 5.637zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/raymonepping/',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    label: 'Medium',
    href: 'https://medium.com/@raymonepping',
    path: 'M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z',
  },
] as const
</script>

<template>
  <footer class="factory-footer">
    <div class="footer-rail" aria-hidden="true" />

    <div class="footer-legend" :class="{ 'is-open': legendOpen }">
      <button
        type="button"
        class="footer-legend-toggle"
        :aria-expanded="legendOpen"
        aria-controls="footer-legend-body"
        @click="toggleLegend"
      >
        <svg viewBox="0 0 12 12" class="footer-legend-chevron" aria-hidden="true">
          <path d="M3 4.5 6 8l3-3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Signal key
      </button>
      <div v-show="legendOpen" id="footer-legend-body" class="footer-legend-body">
        <span v-for="item in legend" :key="item.label" class="footer-legend-item">
          <span class="footer-swatch" :style="{ background: item.swatch }" aria-hidden="true" />
          {{ item.label }}
        </span>
      </div>
    </div>

    <div class="footer-main">
      <p class="footer-tagline">Break the factory. Learn from it. Reset. Repeat. No regrets.</p>

      <div class="footer-signature">
        <span class="footer-sig-text">
          <span>© {{ year }} <span class="footer-sig-name" data-name="Raymon Epping" tabindex="0">Raymon Epping</span></span>
          <span v-for="word in words" :key="word" class="footer-word">
            <i aria-hidden="true">·</i>{{ word }}
          </span>
        </span>

        <nav class="footer-links" aria-label="Raymon Epping on social media">
          <a
            v-for="link in links"
            :key="link.label"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="link.label"
            class="footer-icon"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path :d="link.path" />
            </svg>
          </a>
        </nav>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.factory-footer {
  margin-top: auto;
  border-top: var(--border-width) solid var(--color-border-subtle);
  background: var(--color-bg-shell);
  overflow: hidden;
}

.footer-rail {
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--color-accent-primary) 20%, var(--factory-gold-glow) 50%, var(--color-accent-primary) 80%, transparent);
  opacity: 0.55;
}

.footer-legend {
  max-width: var(--dashboard-max-width);
  margin: 0 auto;
  border-bottom: var(--border-width) solid var(--color-border-subtle);
  font-size: 11px;
  color: var(--color-text-muted);
}
.footer-legend-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font: inherit;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
}
.footer-legend-toggle:hover { color: var(--color-accent-primary); }
.footer-legend-chevron {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  transition: transform 160ms ease;
}
.footer-legend.is-open .footer-legend-chevron { transform: rotate(90deg); }

.footer-legend-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  padding: 0 20px 14px;
}
.footer-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.footer-swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  flex-shrink: 0;
}

.footer-main {
  max-width: var(--dashboard-max-width);
  margin: 0 auto;
  padding: 18px 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.footer-tagline {
  margin: 0;
  text-align: center;
  font-size: 13px;
  font-style: italic;
  color: var(--color-text-secondary);
  letter-spacing: 0.01em;
}

.footer-signature {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.footer-sig-text {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  font-size: 11px;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.footer-sig-name {
  position: relative;
  display: inline-block;
  cursor: default;
  border-radius: 3px;
  transition: color 0.2s ease;
}
.footer-sig-name:hover,
.footer-sig-name:focus-visible {
  outline: none;
  color: var(--color-accent-primary);
}
.footer-sig-name::after {
  content: attr(data-name);
  position: absolute;
  inset: 0;
  color: transparent;
  background: linear-gradient(100deg, transparent 42%, rgba(255, 255, 255, 0.9) 50%, transparent 58%);
  background-size: 260% 100%;
  background-position: 130% 0;
  -webkit-background-clip: text;
  background-clip: text;
  opacity: 0;
  pointer-events: none;
}
.footer-sig-name:hover::after,
.footer-sig-name:focus-visible::after {
  animation: sig-shine 0.9s ease-out;
}
@keyframes sig-shine {
  0% { background-position: 130% 0; opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { background-position: -30% 0; opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .footer-sig-name::after { display: none; }
}

.footer-word {
  display: inline-flex;
  align-items: center;
  cursor: default;
  transition: color 0.2s, text-shadow 0.2s, transform 0.2s;
}
.footer-word:hover {
  color: var(--color-accent-primary);
  text-shadow: var(--glow-active);
  transform: translateY(-1px);
}
.footer-word i {
  margin: 0 6px;
  font-style: normal;
  color: var(--color-border-strong);
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 14px;
}
.footer-icon {
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  transition: color 0.15s;
  text-decoration: none;
}
.footer-icon:hover { color: var(--color-accent-primary); }
.footer-icon svg { width: 14px; height: 14px; }

@media (max-width: 640px) {
  .footer-signature { flex-direction: column; align-items: center; text-align: center; }
}
</style>
