# Rows Mode: Single Status Grid — Design

**Date:** 2026-06-12
**Status:** Approved (brainstormed interactively)
**Scope:** the "rows" view mode only. List and columns modes are untouched. Branch `feat/rows-active-grid` (built on top of the calendar-sidebar branch).

## Summary

The rows view mode drops its three status shelves and becomes a **single section**: a responsive grid of same-size task tiles showing ONE status at a time, switched by a three-segment control (Active / Done / Discarded). While a tile is being dragged, a panel with **two drop zones — the two other statuses —** slides up from the bottom; dropping a tile there changes its status through the existing board machinery.

## Screen structure

```
┌──────────────────────────────────────────────────┐
│ [🔥 Active 3] [✓✓ Done 0] [🗄 Discarded 0]  #tags │ ← header: segmented switcher + tag filter
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│  │  tile  │ │  tile  │ │  tile  │ │  tile  │     │ ← grid: repeat(auto-fill, 294px)
│  └────────┘ └────────┘ └────────┘ └────────┘     │
│ ┌─────────────────────┬────────────────────────┐ │
│ │   ✓✓ Done           │   🗄 Discard           │ │ ← drag-only: slides up from the bottom
│ └─────────────────────┴────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## Header

- **Segmented switcher** — three segments, each with the status icon, label, and count, reusing the visual identities from `Content/model/constants.ts` `BOARD_COLUMNS` (active: `fire`/error, done: `check-check`/success, discarded: `archive`/warning). Counts come from the unfiltered per-status task lists.
- **View state is ephemeral**: component-local, defaults to `active`, resets to `active` on day change and app restart. No new settings.
- **Tag filter** — one `DynamicTagsPanel` in the header filtering the current view; backed by the existing per-status `activeTagIdsByStatus` in `useBoardModel`, so each view keeps its own independent tag selection (same semantics the per-shelf panels had).
- The shelf-collapse settings (`layout.columnsCollapsed`, `columnsHideEmpty`, `columnsAutoCollapseEmpty`) no longer apply in rows mode; they remain in force for the columns mode.

## Grid

- Tiles are the existing `TaskCard view="rows"` (294×134), unchanged.
- Layout: CSS grid `grid-template-columns: repeat(auto-fill, 294px)` + the existing gap; column count follows the content width (window resize, sidebar collapse). Left-aligned rows.
- **Reordering stays**: the grid is a vue-draggable list (existing `DRAGGABLE_ATTRS`, group `daily-board`) bound to `localTasksByStatus[currentView]`; same-view drag reorders via the existing `onColumnChange` → `moveTaskByOrder` flow.
- Empty view shows the existing empty-state treatment ("No active tasks" + icon).

## Drop zones

- Visible only while `isDragging` (from `useBoardModel`); a bottom panel slides up (CSS transition) inside the rows-mode container.
- Always exactly **two zones: the other two statuses** relative to the current view (Active → Done | Discard; Done → Active | Discard; Discarded → Active | Done). Each zone: status icon + label, large hit area (half the panel width), status-colored highlight while a drag hovers it.
- Technically each zone is a minimal vue-draggable list in the same `daily-board` group; a drop triggers the existing cross-column flow (`onColumnChange` with the zone's status → `commitColumnMove`/`moveTaskByOrder`), appending the task to the end of the target status. No new persistence paths.
- Day re-scheduling drops (footer week strip, calendar sidebar via `useDayDropTarget`) and the context-menu status change keep working unchanged; the zones add to them, not replace.

## Architecture

```
src/renderer/src/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/
  RowsMode.vue        — rewritten: header (switcher + tag panel) + grid + zones wiring
  StatusSwitcher.vue  — segmented control (icon + label + count × 3)
  StatusDropZones.vue — the slide-up two-zone panel
  viewStatuses.ts     — pure helpers: `otherStatuses(status)`, view types
```

- The old flat `modes/RowsMode.vue` moves into `modes/rows/`; `Content.vue`'s import updates.
- `useBoardModel` stays shared with the columns mode and unforked — rows consumes a subset (`localTasksByStatus`, `filteredTasksByStatus`, drag handlers, tag-filter state). If a rows-only need appears that would complicate the shared model, prefer a small local computed in `RowsMode.vue` over forking.

## Testing

- **vitest (pure):** `viewStatuses.ts` — `otherStatuses` returns the two other statuses in stable order for each input.
- **Manual:** view switching with counts; grid reflow on window resize and sidebar collapse; reorder within the grid persists; drag shows the two correct zones per view and dropping moves the task (and it disappears from the current view); tag filter applies per view independently; day-drop onto footer/sidebar still works mid-drag; empty states; list/columns modes unaffected.
- vue-draggable does not function under happy-dom, so grid/zone interactions are deliberately left to the manual sweep (consistent with the existing modes having no component tests).

## Out of scope

- List and columns modes.
- Persisting the selected view.
- Changes to `TaskCard`, `useBoardModel`'s public surface, stores, or IPC.
