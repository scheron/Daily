# Calendar Sidebar — Design (v2)

**Date:** 2026-06-11
**Status:** Approved (brainstormed interactively)
**Supersedes:** `2026-06-11-continuous-calendar-footer-design.md` — the horizontal footer lattice. After user evaluation of the built footer version, the continuous calendar moves to a left sidebar in vertical orientation; the footer reverts to the original week strip.

## Summary

A collapsible **left sidebar** hosts a **vertical continuous calendar**: an infinite, vertically-scrollable stack of week rows where months flow into each other with no blocks, no duplicated days, and no gaps. The visual language is `BaseCalendar`'s (ghost-button square cells, corner status dots, text-color dimming) — not the custom-styled footer lattice it replaces. The footer goes back to the original single-week strip.

What carries over from v1 (axis swapped X→Y): the scroll mechanics (free scroll, center-on-today, queued scroll for cold launch / far jumps, follow on external activeDay changes, edge extension with scroll compensation, rAF focus-month detection) and the data flow (`loadedRange` / `extendRange` / `days` Map — no new IPC).

## Layout

- New `aside` to the LEFT of `app-main-panel` in `Main.vue`'s app shell, full window height, fixed width `SIDEBAR_WIDTH ≈ 288px` (7 × `h-9` cells + `gap-1` + padding — exact value tuned during implementation).
- **Collapsible**: reuses the existing `Settings.sidebar.collapsed` field (default `false` = expanded; already in defaults — no settings migration). Bound in `ui.store.ts` via the `useSettingValue` pattern (`sidebarCollapsed` + `toggleSidebarCollapsed()`).
- Collapsed = sidebar fully hidden. Controls: a collapse button in the sidebar header; a reopen button (icon `sidebar`, fallback `chevron-right` if the sprite lacks it) in the main `Header`.
- `useContentSize`: `contentWidth` subtracts the reactive sidebar width; `FOOTER_HEIGHT` returns to a plain constant 40 (the expanded footer mode is removed).

## Sidebar structure (BaseCalendar visual language)

```
┌──────────────────────────────┐
│  ‹    June 2026    ›   ⊙  ⟨  │ ← sticky header: chevrons = scroll ±1 month,
│  Mon Tue Wed Thu Fri Sat Sun │   focus-month label, today button, collapse
│  ────────────────────────────│ ← divider (border-accent/10)
│    1   2   3   4   5   6   7 │ ↑
│    8   9  10 [11] 12  13  14 │ │  infinite vertical stack of week rows,
│   15  16  17  18  19  20  21 │ │  grid-cols-7 gap-1; months flow with no
│   22  23  24  25  26  27  28 │ │  breaks (29 30 | 1 2 3 4 5 in one row)
│   29  30   1   2   3   4   5 │ ↓
└──────────────────────────────┘
```

- **Header (sticky)**: focus-month label (`MMMM yyyy`, same format as BaseCalendar), `chevron-left`/`chevron-right` buttons that smooth-scroll one month back/forward (to the 1st of focusMonth ∓/± 1), a `today` button (icon `today`, `text-accent`) that scrolls back to today, and the collapse button.
- **Weekday row (sticky)**: `WEEKDAYS` from `BaseCalendar/constants` (`Mon…Sun`), `text-accent/70`, followed by the `border-accent/10` divider — exactly BaseCalendar's header treatment.
- **Day cell** — BaseCalendar's cell verbatim: `BaseButton variant="ghost"`, `aspect-square h-9 text-sm`, day number, status dot `size-2 rounded-full absolute top-0.5 right-0.5` (`bg-warning` = active tasks remain, `bg-success` = tasks present and none active, no dot otherwise), `data-drop-day` attribute, `type="button"`, `:aria-label` = ISO date, `aria-current="date"` on today.
- **Cell states**: today → `border-accent border-1`; active day → `bg-accent/30 text-accent hover:bg-accent/40`; drop target → `ring-accent border-accent ring-1`; day of a non-focus month → `text-base-content/50` (text-color dimming, BaseCalendar-style — not opacity).

## Focus month

The focus month is the month of the date at the **vertical center of the viewport** (middle column — Thursday — of the centered week row, matching the v1 majority-of-week ownership rule). Recomputed on scroll via rAF throttle. It drives the sticky header label and the day dimming.

## Behavior

- Free vertical scroll, no snapping.
- On mount, centered on **today** (queued-scroll mechanism handles the cold-launch case where `loadedRange` is still null: queue when the target is outside/absent from the loaded range, re-issue once `loadedRange` changes, 10s freshness window).
- Click on a day → `tasksStore.setActiveDay(date)`; the sidebar does not move (same-day click guard + `suppressFollow` flag).
- `activeDay` changed from outside the sidebar (search, week strip, DayPicker) → smooth scroll to it; far jumps that trigger `recenterRange` are covered by the queued-scroll re-issue.
- Scroll near the rendered top/bottom edge → `tasksStore.extendRange("past" | "future")`; on `firstWeekIndex` change, compensate `scrollTop` symmetrically by `(prev − next) × ROW_HEIGHT` so the same dates stay under the viewport.
- Header chevrons → `queueScroll` to the 1st of the adjacent month, smooth.

## Drag & drop

The global pointer tracking currently living in `Footer.vue` moves to a shared composable `src/renderer/src/composables/useDayDropTarget.ts`: module-level `dropTargetDate` / `pendingDrop` state, window pointer listeners attached once (activated from `Main.vue`), `[data-drop-day]` hit-testing unchanged. The drag-clone class check extends from `.app-footer` / `[data-popup]` to include `.app-sidebar`. Both the footer week strip and the sidebar cells consume the shared `dropTargetDate`, so tasks can be dropped on any visible day in either place.

## Pure math: `weekLattice.ts`

Replaces the 5-week-chunk `lattice.ts` (vertical orientation needs no chunks):

- Same fixed epoch Monday `2001-01-01`; `weekIndexForDate(date)` = floor(daysFromEpoch / 7).
- `buildWeekRange(from, to)` → consecutive `ISODate[7]` rows (Mon-first) covering the range, padded outward to week boundaries; every date exactly once, gapless.
- `ROW_HEIGHT = 40` (36px cell + 4px gap) drives all viewport math; `dateAtViewportCenter({scrollTop, clientHeight, firstWeekIndex})` → Thursday of the centered row; `scrollTopForDate({date, firstWeekIndex, clientHeight})` centers the row containing the date (clamped ≥ 0).
- `getDayDotStatus` / `DayDotStatus`, `dayOfMonth`, `monthKey` carry over as-is.

## Removals (v1 footer-calendar teardown)

- `Footer.vue` reverts to the original single-state week strip (keeps the `Footer/` folder, `WeekStrip.vue`, and the `index.ts` re-export; drops the chevrons, expanded branch, and `footerHeight` prop — height is `h-header` again).
- Delete `ContinuousCalendar.vue`, the old `useCalendarScroll.ts` (replaced by the Y-axis version in the Sidebar folder), `lattice.ts`, and their tests.
- Remove `Settings.layout.calendarExpanded` (type + default + `ui.store` binding + tests) — it never shipped in a release, so removal is safe; `sidebar.collapsed` takes its role.

## Architecture

```
src/renderer/src/ui/views/Main/{fragments}/Sidebar/
  index.ts               — re-export
  CalendarSidebar.vue     — header + weekday row + continuous week stack
  weekLattice.ts          — pure math (epoch, week rows, viewport ↔ date)
  useCalendarScroll.ts    — Y-axis scroll glue: focus month, edges, scrollToDate, compensation
src/renderer/src/composables/useDayDropTarget.ts — shared drag&drop pointer tracking
```

## Testing

- **vitest (pure):** `weekLattice.ts` — epoch anchoring, pre-epoch dates, week-row continuity (every date exactly once), month-boundary row stays intact, viewport center ↔ scrollTop roundtrip, dot status.
- **vitest (stores):** `ui.store` `sidebarCollapsed` default + toggle.
- **vitest (component):** `CalendarSidebar` — renders every loaded date exactly once incl. today; click selects a day; warning/success dots.
- **Manual:** cold-launch centering; dimming + header label migration while scrolling; edge extension without visible jump (both directions); far search jump; chevrons ±1 month; collapse/reopen persistence across restart; drag-drop onto sidebar days and week-strip days; window resize.

## Out of scope

- Footer expanded calendar (removed by this design).
- Virtualized rendering (range stays bounded by `loadedRange` + recenter).
- Auto-collapse on narrow windows.
