# Continuous Calendar Footer — Design

**Date:** 2026-06-11
**Status:** Superseded by `2026-06-11-calendar-sidebar-design.md` — after evaluating the built footer version, the continuous calendar moved to a left sidebar (vertical orientation); the footer reverts to the week strip.

## Summary

The footer week strip becomes a collapsible calendar panel. Expanded, it shows a **continuous calendar**: an infinite, horizontally-scrollable lattice of weeks with no month blocks, no duplicated days, and no gaps. Months are revealed _on top of_ the uniform grid via labels and dimming, not by breaking the grid. Collapsed, it is exactly the current week strip.

The motivation: Daily is calendar-centric — yesterday/today/tomorrow context should always be in view, beyond a single week.

## Core layout: the 5-week lattice

The timeline of Monday-start weeks is split into fixed **chunks of 5 consecutive weeks** (35 days). Each chunk renders as a 7-column (Mon→Sun) × 5-row grid. Chunks are laid side by side, scrolling horizontally:

```
◄──────────────────────── scroll ────────────────────────►
      Май            │       Июнь           │      Июль
 Пн Вт Ср Чт Пт Сб Вс │ Пн Вт Ср Чт Пт Сб Вс │ Пн Вт Ср Чт Пт Сб Вс
 27 28 29 30  1  2  3 │  1  2  3  4  5  6  7 │  6  7  8  9 10 11 12
  4  5  6  7  8  9 10 │  8  9 10 ⓫ 12 13 14 │ 13 14 15 16 17 18 19
 11 12 13 14 15 16 17 │ 15 16 17 18 19 20 21 │ 20 21 22 23 24 25 26
 18 19 20 21 22 23 24 │ 22 23 24 25 26 27 28 │ 27 28 29 30 31  1  2
 25 26 27 28 29 30 31 │ 29 30  1  2  3  4  5 │  3  4  5  6  7  8  9
```

Properties (all confirmed with the user):

- **Always exactly 5 rows.** A chunk is just "the next 5 weeks", with no month alignment.
- **Every date exists exactly once.** Reading order is newspaper columns: down a chunk, then to the top of the next chunk.
- **Months never break the grid.** A month boundary like `29 30 | 1 2 3 4 5` lives inside a single row. A month's first day lands wherever the lattice puts it (sometimes mid-column); a month can flow across a chunk boundary mid-month. This is accepted by design — month identity is carried by dimming and labels.
- **Stable chunk anchoring.** Chunk index is computed from the fixed epoch Monday `2001-01-01`, so chunk boundaries never shift between sessions or when the loaded range grows.

### Chunk header

Each chunk has a header: a month label plus a weekday letters row (`Пн…Вс`, localized the same way as existing UI). The label is the month containing the **chunk's middle day** (18th of 35 — row 3, Thursday) — a deterministic, testable rule that names the dominant month.

### Day cell

- Day number + status dot below (same semantics as `BaseCalendar` and the week strip badges): tasks present with `countActive > 0` → warning/orange dot; tasks present with `countActive === 0` → success/green dot; no tasks → no dot.
- **Today**: accent border. **Active day**: accent fill (`text-accent` / `bg-accent`-tinted) — same visual language as the current week strip.
- Cell size targets ~32–36px; expanded panel height ≈ 260px (header + 5 rows). Exact values tuned during implementation.

### Focus month and dimming

The **focus month** is the month of the date at the viewport's horizontal center (middle row, center x). Recomputed on scroll via `requestAnimationFrame` throttling. Days (and chunk labels) of non-focus months render dimmed (reduced opacity), with a ~150ms CSS opacity transition, so focus migrates smoothly as the user scrolls. An optional thin "snake" contour line tracing the focused month's boundary is a visual-polish option deferred to implementation.

## States and controls

- **Expanded (~260px)** — the continuous calendar. The calendar icon on the left becomes "scroll to today". The `DayPicker` popover is not used here (the lattice _is_ the calendar).
- **Collapsed (40px)** — the current week strip, unchanged, including the `DayPicker` hover popover (still needed when the lattice is hidden).
- A chevron button (far right, both states) toggles expanded/collapsed.
- Persistence: new setting `layout.calendarExpanded: boolean`, default `true`. The settings deep-merge handles the new key without migration.
- `useContentSize`: `FOOTER_HEIGHT` changes from a constant to a reactive value (40 collapsed / ~260 expanded); content height recomputes as today.

## Behavior

- **Free momentum scroll**, no snapping.
- On open/expand, the lattice is centered on **today**.
- Click on a day → `tasksStore.setActiveDay(date)`; the lattice does not move.
- If `activeDay` changes from outside the lattice (search, collapsed-mode popover), the expanded lattice smoothly scrolls to show it.
- **Drag & drop**: day cells carry `data-drop-day`; the existing global pointer handler in `Footer` works unchanged, so tasks can be dropped on any visible day of any month.

## Data and "infinity"

- No new IPC or queries. The lattice renders all chunks overlapping `tasksStore.loadedRange` (padded outward to chunk boundaries). Initial ±6 months ≈ 11 chunks ≈ 385 cells — trivial DOM; **no virtualization** (YAGNI; even hours of scrolling yields only a few thousand simple cells).
- Day lookup via a computed `Map<ISODate, Day>` over `tasksStore.days`.
- When scroll approaches the rendered edge, call the existing `extendRange("past" | "future")` (+3 months). When content is prepended, compensate `scrollLeft` by the added width synchronously so the viewport does not visually jump.
- `loadedRange` and `extendRange` are currently private to `tasks.store.ts`; the store adds them to its public return (read-only `loadedRange`) for the lattice.
- `extendRange` error handling already lives in the store (logged, `pendingExtend` reset); the lattice needs nothing extra.

## Architecture

`{fragments}/Footer.vue` grows into a folder, following the `Content/` folder pattern:

```
src/renderer/src/ui/views/Main/{fragments}/Footer/
  index.ts                — re-export
  Footer.vue              — container: expanded/collapsed switch, chevron, drag&drop pointer handler (moved as-is)
  WeekStrip.vue           — the current week strip markup, extracted unchanged
  ContinuousCalendar.vue  — the expanded lattice
  useCalendarScroll.ts    — scroll concerns: focus-month detection, edge extension + scrollLeft compensation, scrollToDate
  lattice.ts              — pure chunk math: epoch, date ↔ (chunk, row, col), chunk date ranges, chunk label rule, dot status
```

- Pure functions in `lattice.ts` are unit-tested with vitest: epoch/chunk math, reading-order continuity (every date exactly once across consecutive chunks), chunk label rule, year boundaries. All date math via Luxon on ISO dates (no `Date`/DST pitfalls).
- `Settings` type gains `layout.calendarExpanded` in `src/shared/types/storage.ts` plus the default value where settings defaults are defined.

## Testing

- **vitest (pure):** `lattice.ts` math as above; dot-status mapping.
- **Manual:** collapse/expand persistence across restart; dimming migration while scrolling; edge extension with no visual jump (both directions); drag-drop onto a day in a neighboring month; "scroll to today" after far scrolling; window resize.

## Out of scope

- Virtualized rendering of chunks.
- Auto-collapse on small windows (manual toggle only, persisted).
- Changes to `BaseCalendar`, `DayPicker` internals, or the tasks data layer.
