# Plan: dark mode

Based on `docs/changes/dark-mode/intent.md` (the bar) and `docs/spec.md` (design decision 7 and Look and feel). No code written yet.

Working rule: every color comes from a token in `frontend/src/styles/brand.css`; a color literal anywhere else is a bug, and `colors.test.ts` says so.

## Files that change

No backend change: `backend/` is untouched and gets no new tests.

**New — frontend (`frontend/`)**

- `src/lib/theme.ts` — `getTheme` / `setTheme` / `toggleTheme`: localStorage only (never `prefers-color-scheme`), light on a fresh browser, writes `data-theme` on `<html>`; storage denied (cookies blocked, storage off) falls back to light instead of breaking render
- `src/lib/theme.test.ts` — the module's behaviour (see Proof)
- `src/lib/colors.test.ts` — the one-place and contrast rules, read straight out of `brand.css` (see Proof)

**Edited — frontend**

- `src/styles/brand.css` — the `:root` block keeps today's light values byte for byte; every mode-blind literal becomes a token with its current value (the three hexes, the hairline `rgba(7, 59, 76, 0.07)` borders, the sticky-header wash, the modal backdrop, both shadows, the sea-green wash); a new `[data-theme="dark"]` block re-points every token — page `#04232E`, black panels, Sea Mist `#CDD8DB` ink, lightened Sea Green/Marigold inks for small text, dark tints for pills and washes, hairlines and shadows that read on dark; dark ink on Raspberry for the late pill and delete button (white is 3.6:1, under decision 7) with a lightened hover, and `--color-btn-bg` so the secondary button doesn't sit black-on-black on the topbar
- `src/pages/Dashboard.tsx` — eight hex literals (axis tick, two grids, the area's stroke and fill, the bar fill, two chip dots) become token references; the tick is `--color-ink-muted`, the accents already have tokens; both `<Tooltip>`s take their box from tokens (`--color-panel`, `--color-tooltip-border`, `--color-ink`) so Recharts' default white tooltip follows the mode
- `src/routes.tsx` — the toggle button in the top bar, next to "New deal"
- `index.html` — a small blocking script in `<head>` applying the stored theme before first paint, so a dark reload never flashes light
- `src/routes.test.tsx` — toggle assertions (see Proof)

**New — end-to-end (`e2e/`)**

- `theme.spec.ts` — intent criterion 2
- `screenshots.spec.ts` — intent criterion 3, writes four PNGs into `docs/changes/dark-mode/`

Both reuse `helpers.ts` as it stands (sample-data reset, console watcher); Playwright gives each test a fresh context, so storage starts empty by default.

**New — docs**

- `docs/changes/dark-mode/dashboard-light.png`, `dashboard-dark.png`, `pipeline-light.png`, `pipeline-dark.png`

**Edited — docs**

- `docs/STATUS.md` — updated as each phase lands
- `docs/changes/dark-mode/plan.md` — this file, if the plan changes

**Untouched**: `backend/`, `package.json` (Playwright is already a dependency — no new one needed), `docs/spec.md` (already describes the change), `docs/changes/dark-mode/intent.md`, `frontend/src/lib/activity.ts` (already speaks `var(--color-*)`).

## Order of work

### Phase 1 — Tokens: the dark palette in one place

Everything colored starts reading from tokens. The light `:root` block keeps its exact current values; every mode-blind literal in `brand.css` (three hexes, ten `rgba()`s) is promoted to a token holding its current value; then the new `[data-theme="dark"]` block re-points every token with the brand skill's dark palette. `Dashboard.tsx` loses its eight hex literals to the same tokens.

Done when: `colors.test.ts` is green — no color literal outside `brand.css`, today's light values unchanged, and every dark pair the spec names meets its ratio.

### Phase 2 — Toggle and memory

`theme.ts` (localStorage only, light default, `data-theme` on `<html>`), the button in the top bar of `routes.tsx` with an accessible name, and the `<head>` script in `index.html` so a dark-mode reload never flashes light. Unit tests for the module and the button.

Done when: the toggle flips every section, the choice survives a reload, a fresh browser opens light, and `theme.test.ts` plus `routes.test.tsx` are green.

### Phase 3 — Everything follows the mode

A pass over every surface in dark: the dashboard charts and funnel, tables and detail pages, the shared `Modal` and `ConfirmDialog`, messages (the pipeline error line, follow-up and late pills, timeline dots), the top bar, and the pipeline board's tints. Anything still assuming light gets a token.

Done when: all five sections and both dialogs look right in both modes in a real browser, and `colors.test.ts` still passes.

### Phase 4 — Proof

`e2e/theme.spec.ts` for criterion 2, `e2e/screenshots.spec.ts` for criterion 3 (four PNGs into this folder), then `npm run check` for criterion 1 and the `docs/STATUS.md` update.

Done when: intent criteria 1, 2 and 3 hold.

## Risks

1. **Scattered color.** Eight hexes in `Dashboard.tsx`, three hexes and ten `rgba()`s in `brand.css` — easy to fix, easy to re-acquire. Mitigation: promote everything to tokens in Phase 1 and let `colors.test.ts` fail any literal that appears outside `brand.css` afterwards.
2. **Contrast in dark mode.** Accents are tuned for light: Sea Green and Marigold glare on dark, pastel tints wash out, Midnight-based hairlines and shadows disappear. Mitigation: dark variants for inks, tints, hairlines and shadows in the dark block, with `colors.test.ts` computing WCAG AA (4.5:1 text, 3:1 large text and UI) from the parsed tokens until spec decision 7 holds.
3. **Light mode drifting.** "Exactly as today, apart from the toggle" breaks if a token value shifts during the refactor. Mitigation: `:root` keeps byte-identical values, asserted by test; Phase 3 walks light mode too and compares against `main`.
4. **Flash of light on a dark reload.** React applies the theme after first paint. Mitigation: the blocking `<head>` script in `index.html` runs before the stylesheet paints; checked by eye on reload — Playwright cannot see the flash.
5. **Following the device by mistake.** Intent excludes `prefers-color-scheme`. Mitigation: `theme.ts` reads only localStorage, and its unit test proves a fresh browser starts light even when the OS asks for dark (mocked `matchMedia`).
6. **Screenshots that churn or catch a half-drawn page.** Charts and fonts need time to settle, and every `npm test` rewrites the four PNGs. Mitigation: reset to sample data through `helpers.ts`, wait for `document.fonts.ready` and the rendered charts, fixed laptop viewport; the PNGs change only when the visuals change, so they are committed at the end of the change.
7. **Coverage gate.** `npm run check` demands 80%. Mitigation: `theme.ts` and the toggle are small and fully covered by their unit tests; `colors.test.ts` counts toward it too.

## Proof

### Unit — frontend (Vitest, `frontend/src/**/*.test.ts(x)`)

- `lib/theme.test.ts` — fresh storage → light with `matchMedia` never consulted; toggle writes the choice and sets `data-theme`; the stored choice round-trips; an unknown stored value falls back to light; blocked storage (getItem/setItem throwing) falls back to light and still marks `<html>`.
- `lib/colors.test.ts` — every color literal under `frontend/src` sits in `brand.css` (the "one place" constraint); the `:root` light values are exactly today's; dark pairs computed from the parsed CSS meet WCAG AA — ink and muted ink on page and panel at 4.5:1, pill and button labels at 4.5:1, dots and UI chrome at 3:1.
- `routes.test.tsx` — the toggle sits in the top bar on the five sections and the detail pages, has an accessible name, reads light on a fresh load, and flips `data-theme` when clicked.

### End-to-end (Playwright, `e2e/`, installed Chrome)

- `theme.spec.ts` (intent criterion 2) — a fresh visit starts light; the toggle changes the page background and a panel on every section and a detail page; the choice is still dark after a reload; a dialog and the charts are dark while dark; no console errors.
- `screenshots.spec.ts` (intent criterion 3) — after a sample-data reset, the dashboard and the pipeline captured light and dark at a fixed laptop viewport into `docs/changes/dark-mode/` (four PNGs).

No backend changes, so no new backend tests — the existing suite still runs inside `npm run check`. Criterion 1 is `npm run check` itself.
