# Theme and Design Tokens

## Compact token summary

- Product shell: dark translucent Electron popover with layered navy/blue gradients, fine cool-gray borders, and a blue primary accent.
- Portrait viewport: the primary idle surface is 460 × 680 px; all secondary views should use that same viewport and provide internal vertical scrolling.
- Font stack: SF Pro Text / SF Pro Display, then Apple system and Helvetica/Arial fallbacks. Monospace content uses SF Mono / Menlo / Monaco.
- Type scale: 10, 11, 12, 13, 14, 16, 18, 20, 24, 30, 36, 48 px utilities; the main title is 24 px and secondary-view titles are 18 px.
- Dark palette: background #0a0f1a; surfaces #111827, #1f2937, #1a2332; primary text #f9fafb; secondary text #9ca3af; default accent #3b82f6; link #60a5fa.
- Light palette: background #ffffff; surfaces #f9fafb, #f3f4f6; primary text #111827; secondary text #4b5563; default accent/link #2563eb.
- Main-shell tokens: primary text #eef3ff; secondary #c6d0e3; muted #8f9db5; accent #0a84ff; success #34c759; live/error #ff3b30.
- Spacing rhythm: 4, 6, 8, 10, 12, 14, 16, 20, 24, and 32 px; portrait shell outer padding 12 px and card padding 16 px.
- Radius: 4, 6, 8, 9, 10, 12, 14, 16, 18 px plus pill radii.
- Shadows: deep black elevation with subtle inset highlights; no shadow in compact HUD mode.
- Motion: 120–300 ms interaction transitions and an 180 ms shell entrance; respect `prefers-reduced-motion`.
- Responsive breakpoint: 520 px in the app shell; settings currently treats widths below 760 px as compact.
- No Tailwind configuration exists. Utility class names used by legacy components are implemented in `globals.css`.

## Raw source dumps

### `src/renderer/styles/globals.css`

```css
/**
 * markuprx Global Styles
 *
 * Premium, Apple/Linear quality design system.
 * Uses CSS custom properties for runtime theme switching.
 */

/* ============================================================================
   CSS Reset & Base
   ============================================================================ */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  /* Prevent font size inflation on mobile */
  -moz-text-size-adjust: none;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;

  /* Smooth scrolling */
  scroll-behavior: smooth;
}

body {
  min-height: 100vh;
  font-family: 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';

  /* Theme colors via CSS custom properties */
  background-color: var(--bg-primary);
  color: var(--text-primary);

  /* Smooth theme transitions */
  transition: background-color 0.2s ease, color 0.2s ease;
}

body.markuprx-hud-mode {
  background-color: transparent !important;
}

html.markuprx-hud-mode,
html.markuprx-hud-mode body,
html.markuprx-hud-mode #root {
  background: transparent !important;
}

/* Remove default button styling */
button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

/* Remove default input styling */
input,
textarea,
select {
  font: inherit;
  color: inherit;
}

/* Remove list styles */
ul,
ol {
  list-style: none;
}

/* Remove anchor styling */
a {
  color: inherit;
  text-decoration: none;
}

/* Images */
img,
picture,
video,
canvas,
svg {
  display: block;
  max-width: 100%;
}

/* Inherit fonts for form elements */
input,
button,
textarea,
select {
  font: inherit;
}

/* Avoid text overflows */
p,
h1,
h2,
h3,
h4,
h5,
h6 {
  overflow-wrap: break-word;
}

/* ============================================================================
   Typography Utilities
   ============================================================================ */

.text-2xs { font-size: 0.625rem; }
.text-xs { font-size: 0.75rem; }
.text-sm { font-size: 0.875rem; }
.text-base { font-size: 1rem; }
.text-lg { font-size: 1.125rem; }
.text-xl { font-size: 1.25rem; }
.text-2xl { font-size: 1.5rem; }
.text-3xl { font-size: 1.875rem; }
.text-4xl { font-size: 2.25rem; }
.text-5xl { font-size: 3rem; }

.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }

.leading-none { line-height: 1; }
.leading-tight { line-height: 1.25; }
.leading-snug { line-height: 1.375; }
.leading-normal { line-height: 1.5; }
.leading-relaxed { line-height: 1.625; }

.tracking-tighter { letter-spacing: -0.05em; }
.tracking-tight { letter-spacing: -0.025em; }
.tracking-normal { letter-spacing: 0; }
.tracking-wide { letter-spacing: 0.025em; }
.tracking-wider { letter-spacing: 0.05em; }

.font-mono {
  font-family: 'SF Mono', Menlo, Monaco, monospace;
}

/* ============================================================================
   Color Utilities
   ============================================================================ */

/* Text colors */
.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-tertiary { color: var(--text-tertiary); }
.text-inverse { color: var(--text-inverse); }
.text-link { color: var(--text-link); }
.text-accent { color: var(--accent-default); }

/* Background colors */
.bg-primary { background-color: var(--bg-primary); }
.bg-secondary { background-color: var(--bg-secondary); }
.bg-tertiary { background-color: var(--bg-tertiary); }
.bg-elevated { background-color: var(--bg-elevated); }
.bg-subtle { background-color: var(--bg-subtle); }
.bg-accent { background-color: var(--accent-default); }
.bg-accent-subtle { background-color: var(--accent-subtle); }

/* Border colors */
.border-default { border-color: var(--border-default); }
.border-subtle { border-color: var(--border-subtle); }
.border-strong { border-color: var(--border-strong); }
.border-focus { border-color: var(--border-focus); }
.border-accent { border-color: var(--accent-default); }

/* Status colors */
.text-success { color: var(--status-success); }
.text-warning { color: var(--status-warning); }
.text-error { color: var(--status-error); }
.text-info { color: var(--status-info); }

.bg-success { background-color: var(--status-success); }
.bg-success-subtle { background-color: var(--status-success-subtle); }
.bg-warning { background-color: var(--status-warning); }
.bg-warning-subtle { background-color: var(--status-warning-subtle); }
.bg-error { background-color: var(--status-error); }
.bg-error-subtle { background-color: var(--status-error-subtle); }
.bg-info { background-color: var(--status-info); }
.bg-info-subtle { background-color: var(--status-info-subtle); }

/* ============================================================================
   Glass Morphism
   ============================================================================ */

.glass {
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--surface-glass-border);
}

.glass-subtle {
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--surface-glass-border);
}

.glass-strong {
  background: var(--surface-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--surface-glass-border);
}

/* ============================================================================
   Focus States
   ============================================================================ */

/* Default focus outline - remove for mouse users */
:focus {
  outline: none;
}

/* Focus visible - show for keyboard users */
:focus-visible {
  outline: 2px solid var(--accent-default);
  outline-offset: 2px;
}

/* Custom focus ring class */
.focus-ring:focus-visible {
  box-shadow: 0 0 0 3px var(--border-focus);
}

/* ============================================================================
   Interactive States
   ============================================================================ */

/* Hover background */
.hover-bg:hover {
  background-color: var(--bg-subtle);
}

/* Active state */
.active-scale:active {
  transform: scale(0.98);
}

/* Disabled state */
.disabled,
[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* ============================================================================
   Scrollbar Styling
   ============================================================================ */

/* Thin scrollbar for all scrollable elements */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border-default) transparent;
}

/* Webkit scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

/* Hide scrollbar but keep functionality */
.scrollbar-hidden {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-hidden::-webkit-scrollbar {
  display: none;
}

/* ============================================================================
   Selection
   ============================================================================ */

::selection {
  background-color: var(--accent-muted);
  color: var(--text-primary);
}

/* ============================================================================
   Premium Elevation (Box Shadows)
   ============================================================================ */

.shadow-xs {
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.shadow-sm {
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

.shadow-md {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
}

.shadow-lg {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
}

.shadow-xl {
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}

.shadow-2xl {
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.shadow-inner {
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05);
}

/* Accent glow */
.shadow-glow {
  box-shadow: 0 0 20px var(--accent-muted);
}

.shadow-glow-lg {
  box-shadow: 0 0 40px var(--accent-muted);
}

/* ============================================================================
   Border Radius
   ============================================================================ */

.rounded-none { border-radius: 0; }
.rounded-sm { border-radius: 0.25rem; }
.rounded { border-radius: 0.375rem; }
.rounded-md { border-radius: 0.5rem; }
.rounded-lg { border-radius: 0.75rem; }
.rounded-xl { border-radius: 1rem; }
.rounded-2xl { border-radius: 1.5rem; }
.rounded-3xl { border-radius: 2rem; }
.rounded-full { border-radius: 9999px; }

/* ============================================================================
   Transitions
   ============================================================================ */

.transition-none { transition: none; }
.transition-all { transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1); }
.transition-colors {
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease;
}
.transition-opacity { transition: opacity 200ms ease; }
.transition-transform { transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1); }
.transition-shadow { transition: box-shadow 200ms ease; }

/* Durations */
.duration-75 { transition-duration: 75ms; }
.duration-100 { transition-duration: 100ms; }
.duration-150 { transition-duration: 150ms; }
.duration-200 { transition-duration: 200ms; }
.duration-300 { transition-duration: 300ms; }
.duration-500 { transition-duration: 500ms; }

/* Easings */
.ease-linear { transition-timing-function: linear; }
.ease-in { transition-timing-function: ease-in; }
.ease-out { transition-timing-function: ease-out; }
.ease-in-out { transition-timing-function: ease-in-out; }
.ease-spring { transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.ease-bounce { transition-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55); }

/* ============================================================================
   Z-Index Scale
   ============================================================================ */

.z-behind { z-index: -1; }
.z-base { z-index: 0; }
.z-dropdown { z-index: 10; }
.z-sticky { z-index: 20; }
.z-fixed { z-index: 30; }
.z-overlay { z-index: 40; }
.z-modal { z-index: 50; }
.z-popover { z-index: 60; }
.z-tooltip { z-index: 70; }
.z-toast { z-index: 80; }
.z-max { z-index: 9999; }

/* ============================================================================
   Common Components
   ============================================================================ */

/* Card */
.card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 0.75rem;
  padding: 1rem;
}

.card-elevated {
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 0.75rem;
  padding: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 9999px;
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
}

.badge-accent {
  background-color: var(--accent-subtle);
  color: var(--accent-default);
}

.badge-success {
  background-color: var(--status-success-subtle);
  color: var(--status-success);
}

.badge-warning {
  background-color: var(--status-warning-subtle);
  color: var(--status-warning);
}

.badge-error {
  background-color: var(--status-error-subtle);
  color: var(--status-error);
}

/* Divider */
.divider {
  height: 1px;
  background-color: var(--border-default);
  margin: 1rem 0;
}

.divider-vertical {
  width: 1px;
  height: 100%;
  background-color: var(--border-default);
  margin: 0 0.5rem;
}

/* ============================================================================
   Electron-Specific Styles
   ============================================================================ */

/* Drag region for title bar */
.drag-region {
  -webkit-app-region: drag;
  app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

/* Prevent text selection in UI */
.select-none {
  user-select: none;
  -webkit-user-select: none;
}

/* Allow text selection */
.select-text {
  user-select: text;
  -webkit-user-select: text;
}

/* ============================================================================
   Reduced Motion
   ============================================================================ */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### `src/renderer/styles/app-shell.css`

```css
:root {
  --ff-shell-bg:
    radial-gradient(circle at 10% -18%, rgba(10, 132, 255, 0.16), transparent 46%),
    radial-gradient(circle at 90% -16%, rgba(94, 106, 240, 0.12), transparent 44%),
    linear-gradient(180deg, #090c14 0%, #0c1018 60%, #0b0f16 100%);
  --ff-surface: rgba(22, 28, 39, 0.82);
  --ff-surface-strong: rgba(26, 33, 45, 0.9);
  --ff-border: rgba(150, 162, 183, 0.22);
  --ff-border-strong: rgba(167, 178, 198, 0.34);
  --ff-text-primary: #eef3ff;
  --ff-text-secondary: #c6d0e3;
  --ff-text-muted: #8f9db5;
  --ff-live: #ff3b30;
  --ff-live-soft: rgba(255, 59, 48, 0.24);
  --ff-accent: #0a84ff;
  --ff-accent-soft: rgba(10, 132, 255, 0.22);
  --ff-success: #34c759;
  --ff-error: #ff3b30;
}

.ff-shell {
  width: 100%;
  min-height: 100%;
  padding: 12px;
  background: var(--ff-shell-bg);
  color: var(--ff-text-primary);
  font-family: 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue',
    Arial, sans-serif;
}

.ff-shell--hud {
  padding: 0;
  background: transparent;
}

.ff-shell__card {
  border: 1px solid var(--ff-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--ff-surface-strong) 0%, var(--ff-surface) 100%);
  box-shadow:
    0 12px 32px rgba(3, 6, 12, 0.5),
    inset 0 1px 0 rgba(217, 224, 236, 0.11);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: ffShellIn 180ms ease-out;
}

.ff-shell__card--hud {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
  gap: 0;
  overflow: visible;
  max-height: none;
  animation: none;
}

.ff-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.ff-shell__eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ff-text-muted);
  font-weight: 600;
}

.ff-shell__title {
  margin-top: 2px;
  font-size: 24px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--ff-text-primary);
}

.ff-shell__quiet-btn {
  font-size: 12px;
  color: var(--ff-text-secondary);
  background: rgba(138, 149, 171, 0.14);
  border: 1px solid rgba(138, 149, 171, 0.26);
  border-radius: 999px;
  padding: 7px 11px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.ff-shell__quiet-btn:hover {
  background: rgba(138, 149, 171, 0.24);
  border-color: rgba(164, 176, 199, 0.45);
  color: var(--ff-text-primary);
}

.ff-shell__subtitle {
  color: var(--ff-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.ff-shell__controls {
  display: grid;
  gap: 8px;
}

.ff-shell__primary-btn,
.ff-shell__secondary-btn {
  width: 100%;
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 11px 14px;
  font-size: 14px;
  font-weight: 600;
  transition: transform 120ms ease, opacity 120ms ease, border-color 140ms ease, background 140ms ease;
}

.ff-shell__primary-btn {
  color: #ffffff;
  background: linear-gradient(180deg, #0a84ff 0%, #0077ed 100%);
  box-shadow: 0 6px 14px rgba(10, 132, 255, 0.26);
}

.ff-shell__primary-btn.is-live {
  background: linear-gradient(180deg, #ff453a 0%, #d92f25 100%);
  box-shadow: 0 6px 14px rgba(255, 69, 58, 0.25);
}

.ff-shell__primary-btn:hover:not(:disabled) {
  filter: brightness(1.03);
}

.ff-shell__secondary-btn {
  color: var(--ff-text-secondary);
  background: rgba(124, 137, 160, 0.12);
  border-color: rgba(124, 137, 160, 0.24);
}

.ff-shell__secondary-btn:hover:not(:disabled) {
  background: rgba(124, 137, 160, 0.22);
  border-color: rgba(124, 137, 160, 0.38);
  color: var(--ff-text-primary);
}

.ff-shell__primary-btn:disabled,
.ff-shell__secondary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ff-shell__primary-btn:not(:disabled):active,
.ff-shell__secondary-btn:not(:disabled):active {
  transform: translateY(1px);
}

.ff-shell__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ff-shell__meta span {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(131, 144, 168, 0.26);
  background: rgba(131, 144, 168, 0.12);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--ff-text-secondary);
}

.ff-shell__meta span.is-ready {
  border-color: rgba(52, 199, 89, 0.42);
  background: rgba(52, 199, 89, 0.14);
  color: #7de0a0;
}

.ff-shell__meta span.is-optional {
  border-color: rgba(255, 159, 10, 0.35);
  background: rgba(255, 159, 10, 0.14);
  color: #f2bd66;
}

.ff-shell__meta-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(131, 144, 168, 0.25);
  background: rgba(131, 144, 168, 0.12);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--ff-text-secondary);
}

.ff-shell__byok-cta {
  border-radius: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 159, 10, 0.35);
  background: rgba(255, 159, 10, 0.1);
  display: grid;
  gap: 6px;
}

.ff-shell__byok-title {
  font-size: 13px;
  font-weight: 600;
  color: #f2bd66;
}

.ff-shell__byok-detail {
  font-size: 12px;
  color: #ddb46f;
}

.ff-shell__byok-btn {
  justify-self: start;
  min-height: 30px;
  border-radius: 9px;
  border: 1px solid rgba(255, 159, 10, 0.44);
  background: rgba(255, 159, 10, 0.16);
  color: #ffe0ad;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
}

.ff-shell__transcript {
  border-radius: 12px;
  padding: 11px;
  border: 1px solid rgba(10, 132, 255, 0.28);
  background: rgba(10, 132, 255, 0.08);
}

.ff-shell__transcript-label {
  font-size: 11px;
  color: var(--ff-text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ff-shell__transcript p {
  font-size: 13px;
  line-height: 1.4;
}

.ff-shell__transcript-scroll {
  max-height: 190px;
  overflow-y: auto;
  display: grid;
  gap: 7px;
  padding-right: 4px;
}

.ff-shell__transcript-line {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ff-text-primary);
}

.ff-shell__transcript-interim {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ff-text-secondary);
  font-style: italic;
  opacity: 0.92;
}

.ff-shell__transcript-placeholder {
  font-size: 12px;
  color: var(--ff-text-muted);
}

.ff-shell__report {
  border-radius: 14px;
  border: 1px solid rgba(70, 160, 255, 0.34);
  background: rgba(70, 160, 255, 0.1);
  padding: 12px;
  display: grid;
  gap: 8px;
}

.ff-shell__report-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #98c2ff;
}

.ff-shell__path {
  font-family: 'SF Mono', Menlo, Monaco, 'Cascadia Mono', monospace;
  font-size: 11px;
  color: var(--ff-text-primary);
  overflow-wrap: anywhere;
  background: rgba(11, 15, 24, 0.72);
  border: 1px solid rgba(130, 142, 165, 0.28);
  border-radius: 9px;
  padding: 9px;
}

.ff-shell__report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ff-shell__report-actions button {
  flex: 1 1 140px;
  min-height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(130, 142, 165, 0.28);
  background: rgba(25, 31, 42, 0.84);
  color: var(--ff-text-secondary);
  font-size: 12px;
  padding: 8px 10px;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.ff-shell__report-actions button:hover {
  background: rgba(34, 41, 54, 0.95);
  border-color: rgba(153, 166, 189, 0.42);
  color: var(--ff-text-primary);
}

.ff-shell__error {
  border-radius: 12px;
  border: 1px solid rgba(255, 59, 48, 0.35);
  background: rgba(255, 59, 48, 0.14);
  color: #ff9a92;
  padding: 10px 11px;
  font-size: 12px;
}

.ff-shell__recent {
  border: 1px solid rgba(130, 142, 165, 0.24);
  border-radius: 14px;
  background: rgba(19, 25, 35, 0.78);
  padding: 11px;
  display: grid;
  gap: 10px;
}

.ff-shell__recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ff-shell__recent-header h2 {
  font-size: 13px;
  letter-spacing: 0.01em;
}

.ff-shell__recent-header button {
  color: var(--ff-text-secondary);
  font-size: 11px;
  border-radius: 8px;
  border: 1px solid rgba(131, 144, 168, 0.28);
  padding: 6px 8px;
  background: rgba(131, 144, 168, 0.12);
}

.ff-shell__recent-list {
  display: grid;
  gap: 8px;
}

.ff-shell__recent-item {
  border: 1px solid rgba(131, 144, 168, 0.22);
  background: rgba(14, 20, 30, 0.72);
  border-radius: 10px;
  padding: 9px;
  display: grid;
  gap: 8px;
}

.ff-shell__recent-open {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--ff-text-primary);
}

.ff-shell__recent-open span:last-child {
  color: var(--ff-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.ff-shell__recent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--ff-text-secondary);
}

.ff-shell__recent-meta button {
  margin-left: auto;
  min-height: 28px;
  color: var(--ff-text-secondary);
  border: 1px solid rgba(131, 144, 168, 0.28);
  background: rgba(131, 144, 168, 0.12);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
}

.ff-shell__empty {
  font-size: 12px;
  color: var(--ff-text-muted);
}

.ff-shell__footer {
  display: grid;
  gap: 5px;
}

.ff-shell__footer p {
  font-size: 11px;
  color: var(--ff-text-muted);
}

.ff-shell__donate {
  margin-top: 4px;
  align-self: flex-start;
}

.ff-shell--recording .ff-shell__card {
  border-color: rgba(255, 59, 48, 0.35);
}

.ff-shell--recording .ff-shell__title::after {
  content: '';
  display: inline-flex;
  margin-left: 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ff-live);
  box-shadow: 0 0 0 6px var(--ff-live-soft);
  animation: ffLivePulse 1.6s ease-in-out infinite;
}

.ff-shell--complete .ff-shell__card {
  border-color: rgba(52, 199, 89, 0.42);
}

.ff-shell--error .ff-shell__card {
  border-color: rgba(255, 59, 48, 0.38);
}

@keyframes ffLivePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--ff-live-soft);
    opacity: 1;
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 59, 48, 0);
    opacity: 0.68;
  }
}

@keyframes ffShellIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ffSpinnerSpin {
  to {
    transform: rotate(360deg);
  }
}

.ff-shell--processing .ff-shell__card::before {
  content: '';
  display: block;
  width: 22px;
  height: 22px;
  margin: 8px auto;
  border: 2.5px solid rgba(123, 138, 166, 0.3);
  border-top-color: var(--ff-accent);
  border-radius: 50%;
  animation: ffSpinnerSpin 0.85s linear infinite;
}

/* Post-processing progress indicator */
.ff-shell__processing {
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(10, 132, 255, 0.32);
  background: rgba(10, 132, 255, 0.1);
  display: grid;
  gap: 10px;
}

.ff-shell__processing-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ff-text-primary);
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ff-shell__processing-dots {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 28px;
  font-family: 'SF Mono', 'Menlo', monospace;
  letter-spacing: 0.08em;
  color: rgba(219, 234, 255, 0.9);
  opacity: 0.92;
}

.ff-shell__processing-bar-track {
  height: 7px;
  border-radius: 3px;
  background: rgba(10, 132, 255, 0.18);
  overflow: hidden;
}

.ff-shell__processing-bar-fill {
  position: relative;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #0a84ff 0%, #4ab0ff 100%);
  transition: width 860ms cubic-bezier(0.19, 0.91, 0.21, 1);
  min-width: 0;
}

.ff-shell__processing-bar-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.26) 45%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: translateX(-140%);
  animation: ffProcessSweep 1.5s linear infinite;
}

.ff-shell__processing-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ff-shell__processing-percent {
  font-size: 13px;
  font-weight: 600;
  color: var(--ff-accent);
  font-variant-numeric: tabular-nums;
  min-width: 36px;
}

.ff-shell__processing-step {
  font-size: 12px;
  color: var(--ff-text-secondary);
  text-align: right;
  flex: 1;
}

.ff-shell__error-guidance {
  margin-top: 8px;
  font-size: 11px;
  color: var(--ff-text-muted);
  line-height: 1.45;
}

.ff-shell__error-retry {
  margin-top: 10px;
  padding: 8px 13px;
  font-size: 12px;
  font-weight: 600;
  color: #ff9a92;
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: 10px;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}

.ff-shell__error-retry:hover {
  background: rgba(255, 59, 48, 0.17);
  border-color: rgba(255, 59, 48, 0.4);
}

@keyframes ffProcessSweep {
  to {
    transform: translateX(140%);
  }
}

:focus-visible {
  outline: 2px solid var(--ff-accent);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .ff-shell {
    padding: 10px;
  }

  .ff-shell__card {
    padding: 14px;
    max-height: calc(100vh - 20px);
  }

  .ff-shell__header {
    gap: 8px;
  }

  .ff-shell__title {
    font-size: 22px;
  }

  .ff-shell__report-actions button {
    flex-basis: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### `src/renderer/styles/theme.ts`

```ts
/**
 * markuprx Premium Theme System
 *
 * Design tokens for a premium, Apple/Linear quality experience.
 * Supports dark/light/system modes with customizable accent colors.
 */

// ============================================================================
// Color Tokens
// ============================================================================

export interface ThemeColors {
  // Backgrounds - layered for depth
  bg: {
    primary: string;      // Main app background
    secondary: string;    // Cards, panels
    tertiary: string;     // Nested elements
    elevated: string;     // Floating elements (modals, dropdowns)
    overlay: string;      // Overlay backdrop
    subtle: string;       // Very subtle backgrounds (hover states)
  };

  // Text - hierarchy through opacity/tone
  text: {
    primary: string;      // Main content
    secondary: string;    // Supporting content
    tertiary: string;     // Disabled/placeholder
    inverse: string;      // Text on accent colors
    link: string;         // Interactive text
  };

  // Borders - subtle but present
  border: {
    default: string;      // Standard borders
    subtle: string;       // Barely visible borders
    strong: string;       // Emphasized borders
    focus: string;        // Focus rings
  };

  // Semantic status colors
  status: {
    success: string;
    successSubtle: string;
    warning: string;
    warningSubtle: string;
    error: string;
    errorSubtle: string;
    info: string;
    infoSubtle: string;
  };

  // Accent - user customizable primary color
  accent: {
    default: string;      // Primary accent
    hover: string;        // Hover state
    active: string;       // Active/pressed state
    subtle: string;       // 10% opacity for backgrounds
    muted: string;        // 20% opacity for emphasis
  };

  // Special surfaces
  surface: {
    glass: string;        // Glass morphism background
    glassBorder: string;  // Glass border
    highlight: string;    // Subtle highlight
    inset: string;        // Inset/recessed areas
  };
}

// Dark theme - Premium slate palette
export const darkTheme: ThemeColors = {
  bg: {
    primary: '#0a0f1a',      // Deep space blue-black
    secondary: '#111827',    // Elevated surface
    tertiary: '#1f2937',     // Nested elements
    elevated: '#1a2332',     // Floating surfaces
    overlay: 'rgba(0, 0, 0, 0.75)',
    subtle: 'rgba(255, 255, 255, 0.03)',
  },
  text: {
    primary: '#f9fafb',      // Almost white
    secondary: '#9ca3af',    // Cool gray
    tertiary: '#9ca3af',     // Muted, while retaining WCAG AA contrast on dark surfaces
    inverse: '#0a0f1a',      // For accent buttons
    link: '#60a5fa',         // Soft blue
  },
  border: {
    default: 'rgba(255, 255, 255, 0.08)',
    subtle: 'rgba(255, 255, 255, 0.04)',
    strong: 'rgba(255, 255, 255, 0.15)',
    focus: 'rgba(96, 165, 250, 0.5)',
  },
  status: {
    success: '#34d399',      // Emerald
    successSubtle: 'rgba(52, 211, 153, 0.15)',
    warning: '#fbbf24',      // Amber
    warningSubtle: 'rgba(251, 191, 36, 0.15)',
    error: '#f87171',        // Red
    errorSubtle: 'rgba(248, 113, 113, 0.15)',
    info: '#60a5fa',         // Blue
    infoSubtle: 'rgba(96, 165, 250, 0.15)',
  },
  accent: {
    default: '#3b82f6',      // Vibrant blue
    hover: '#2563eb',
    active: '#1d4ed8',
    subtle: 'rgba(59, 130, 246, 0.12)',
    muted: 'rgba(59, 130, 246, 0.25)',
  },
  surface: {
    glass: 'rgba(17, 24, 39, 0.8)',
    glassBorder: 'rgba(255, 255, 255, 0.06)',
    highlight: 'rgba(255, 255, 255, 0.02)',
    inset: 'rgba(0, 0, 0, 0.3)',
  },
};

// Light theme - Clean and airy
export const lightTheme: ThemeColors = {
  bg: {
    primary: '#ffffff',
    secondary: '#f9fafb',    // Warm gray
    tertiary: '#f3f4f6',     // Nested
    elevated: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.5)',
    subtle: 'rgba(0, 0, 0, 0.02)',
  },
  text: {
    primary: '#111827',      // Near black
    secondary: '#4b5563',    // Gray
    tertiary: '#626b78',     // Muted, with WCAG AA contrast on light and tinted surfaces
    inverse: '#ffffff',
    link: '#2563eb',         // Blue
  },
  border: {
    default: 'rgba(0, 0, 0, 0.08)',
    subtle: 'rgba(0, 0, 0, 0.04)',
    strong: 'rgba(0, 0, 0, 0.15)',
    focus: 'rgba(37, 99, 235, 0.4)',
  },
  status: {
    success: '#047857',      // Accessible emerald on light and subtly tinted surfaces
    successSubtle: 'rgba(5, 150, 105, 0.1)',
    warning: '#92400e',      // Accessible amber-brown on light and subtly tinted surfaces
    warningSubtle: 'rgba(217, 119, 6, 0.1)',
    error: '#dc2626',        // Red
    errorSubtle: 'rgba(220, 38, 38, 0.1)',
    info: '#2563eb',         // Blue
    infoSubtle: 'rgba(37, 99, 235, 0.1)',
  },
  accent: {
    default: '#2563eb',
    hover: '#1d4ed8',
    active: '#1e40af',
    subtle: 'rgba(37, 99, 235, 0.08)',
    muted: 'rgba(37, 99, 235, 0.18)',
  },
  surface: {
    glass: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(0, 0, 0, 0.06)',
    highlight: 'rgba(255, 255, 255, 0.7)',
    inset: 'rgba(0, 0, 0, 0.03)',
  },
};

// ============================================================================
// Accent Color Presets
// ============================================================================

export interface AccentColor {
  default: string;
  hover: string;
  active: string;
  name: string;
}

export const accentColors = {
  blue: {
    default: '#3b82f6',
    hover: '#2563eb',
    active: '#1d4ed8',
    name: 'Ocean Blue',
  },
  indigo: {
    default: '#6366f1',
    hover: '#4f46e5',
    active: '#4338ca',
    name: 'Indigo',
  },
  violet: {
    default: '#8b5cf6',
    hover: '#7c3aed',
    active: '#6d28d9',
    name: 'Violet',
  },
  purple: {
    default: '#a855f7',
    hover: '#9333ea',
    active: '#7e22ce',
    name: 'Purple',
  },
  fuchsia: {
    default: '#d946ef',
    hover: '#c026d3',
    active: '#a21caf',
    name: 'Fuchsia',
  },
  pink: {
    default: '#ec4899',
    hover: '#db2777',
    active: '#be185d',
    name: 'Pink',
  },
  rose: {
    default: '#f43f5e',
    hover: '#e11d48',
    active: '#be123c',
    name: 'Rose',
  },
  red: {
    default: '#ef4444',
    hover: '#dc2626',
    active: '#b91c1c',
    name: 'Red',
  },
  orange: {
    default: '#f97316',
    hover: '#ea580c',
    active: '#c2410c',
    name: 'Orange',
  },
  amber: {
    default: '#f59e0b',
    hover: '#d97706',
    active: '#b45309',
    name: 'Amber',
  },
  yellow: {
    default: '#eab308',
    hover: '#ca8a04',
    active: '#a16207',
    name: 'Yellow',
  },
  lime: {
    default: '#84cc16',
    hover: '#65a30d',
    active: '#4d7c0f',
    name: 'Lime',
  },
  green: {
    default: '#22c55e',
    hover: '#16a34a',
    active: '#15803d',
    name: 'Green',
  },
  emerald: {
    default: '#10b981',
    hover: '#059669',
    active: '#047857',
    name: 'Emerald',
  },
  teal: {
    default: '#14b8a6',
    hover: '#0d9488',
    active: '#0f766e',
    name: 'Teal',
  },
  cyan: {
    default: '#06b6d4',
    hover: '#0891b2',
    active: '#0e7490',
    name: 'Cyan',
  },
  sky: {
    default: '#0ea5e9',
    hover: '#0284c7',
    active: '#0369a1',
    name: 'Sky',
  },
} as const;

export type AccentColorKey = keyof typeof accentColors;

// ============================================================================
// Typography
// ============================================================================

export const typography = {
  // Font families
  fontFamily: {
    // Primary - Inter for UI, falls back to system fonts
    sans: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(', '),
    // Monospace - JetBrains Mono for code
    mono: [
      '"JetBrains Mono"',
      '"SF Mono"',
      'Menlo',
      'Monaco',
      '"Cascadia Code"',
      '"Courier New"',
      'monospace',
    ].join(', '),
    // Display - for large headings (optional upgrade)
    display: [
      '"Inter Display"',
      'Inter',
      '-apple-system',
      'sans-serif',
    ].join(', '),
  },

  // Font sizes - modular scale (1.2 ratio)
  fontSize: {
    '2xs': '0.625rem',   // 10px
    xs: '0.75rem',       // 12px
    sm: '0.875rem',      // 14px
    base: '1rem',        // 16px
    lg: '1.125rem',      // 18px
    xl: '1.25rem',       // 20px
    '2xl': '1.5rem',     // 24px
    '3xl': '1.875rem',   // 30px
    '4xl': '2.25rem',    // 36px
    '5xl': '3rem',       // 48px
  },

  // Font weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line heights
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ============================================================================
// Spacing Scale
// ============================================================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
} as const;

// ============================================================================
// Shadows
// ============================================================================

export const shadows = {
  // Standard elevation shadows
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Inner shadow
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',

  // Colored glow effects (functions for dynamic colors)
  glow: (color: string, intensity = 0.4) =>
    `0 0 20px ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,
  glowLg: (color: string, intensity = 0.3) =>
    `0 0 40px ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,

  // Focus ring
  focus: (color: string) => `0 0 0 3px ${color}`,
  focusInset: (color: string) => `inset 0 0 0 2px ${color}`,
} as const;

// ============================================================================
// Border Radius
// ============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  md: '0.375rem',   // 6px
  DEFAULT: '0.5rem', // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.5rem',  // 24px
  '3xl': '2rem',    // 32px
  full: '9999px',
} as const;

// ============================================================================
// Transitions
// ============================================================================

export const transitions = {
  // Duration
  duration: {
    fastest: '50ms',
    faster: '100ms',
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '400ms',
    slowest: '500ms',
  },

  // Timing functions
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    // Premium easings
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    snap: 'cubic-bezier(0, 0.7, 0.3, 1)',
  },

  // Pre-composed transitions
  all: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  colors: 'color 150ms ease, background-color 150ms ease, border-color 150ms ease',
  opacity: 'opacity 200ms ease',
  transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  shadow: 'box-shadow 200ms ease',
} as const;

// ============================================================================
// Z-Index Scale
// ============================================================================

export const zIndex = {
  behind: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
  max: 9999,
} as const;

// ============================================================================
// Breakpoints
// ============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================================================
// Type Helpers
// ============================================================================

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  accentKey: AccentColorKey;
  typography: typeof typography;
  spacing: typeof spacing;
  shadows: typeof shadows;
  borderRadius: typeof borderRadius;
  transitions: typeof transitions;
  zIndex: typeof zIndex;
}

// ============================================================================
// CSS Custom Property Generator
// ============================================================================

/**
 * Converts theme colors to CSS custom properties
 */
export function generateCSSProperties(theme: ThemeColors, accent: AccentColor): Record<string, string> {
  return {
    // Backgrounds
    '--bg-primary': theme.bg.primary,
    '--bg-secondary': theme.bg.secondary,
    '--bg-tertiary': theme.bg.tertiary,
    '--bg-elevated': theme.bg.elevated,
    '--bg-overlay': theme.bg.overlay,
    '--bg-subtle': theme.bg.subtle,

    // Text
    '--text-primary': theme.text.primary,
    '--text-secondary': theme.text.secondary,
    '--text-tertiary': theme.text.tertiary,
    '--text-inverse': theme.text.inverse,
    '--text-link': theme.text.link,

    // Borders
    '--border-default': theme.border.default,
    '--border-subtle': theme.border.subtle,
    '--border-strong': theme.border.strong,
    '--border-focus': theme.border.focus,

    // Status
    '--status-success': theme.status.success,
    '--status-success-subtle': theme.status.successSubtle,
    '--status-warning': theme.status.warning,
    '--status-warning-subtle': theme.status.warningSubtle,
    '--status-error': theme.status.error,
    '--status-error-subtle': theme.status.errorSubtle,
    '--status-info': theme.status.info,
    '--status-info-subtle': theme.status.infoSubtle,

    // Accent (using provided accent color)
    '--accent-default': accent.default,
    '--accent-hover': accent.hover,
    '--accent-active': accent.active,
    '--accent-subtle': `${accent.default}1a`,  // 10% opacity
    '--accent-muted': `${accent.default}40`,   // 25% opacity

    // Surfaces
    '--surface-glass': theme.surface.glass,
    '--surface-glass-border': theme.surface.glassBorder,
    '--surface-highlight': theme.surface.highlight,
    '--surface-inset': theme.surface.inset,
  };
}
```
