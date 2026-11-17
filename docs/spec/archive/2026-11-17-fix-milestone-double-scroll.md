This is history; the rules that hold now are in `docs/spec/`.

# Plan: One scrollable list in the milestone menu

## Result

The milestone menu in task details shows two vertical scrollbars at normal and large interface sizes. Its search field moves with the outer scrollbar. When this plan is done, only the milestone choices scroll; the search field stays in place, and every milestone remains reachable.

## Approach

Give the choices list sole ownership of scrolling in the task-details milestone popup, following the existing selection-menu pattern. Preserve the shared popup and combobox behavior for their other callers. A real Electron layout regression demonstrates the original symptom and the fix; the existing component tests continue to cover milestone selection.

- Keep all interface sizes supported — the menu must fit its content without a second scrollbar when the root font size changes.
- Keep the runtime test opt-in through an explicitly isolated CDP endpoint — the standard DOM test environment cannot calculate layout. The phase and E2E gate run it explicitly against the current build.

## Out of scope

- Changing milestone selection, filtering, creation, or the No milestone row.
- Changing other selection menus, application typography, or global popup sizing.
- Quick Task, sync, protocol registration, packaging, or release changes. The trial launcher disables those integrations only in the private test instance.

## Done and Spec

```text
## Done

1. In task details, open Milestone for a project with at least 16 milestones at each interface size; scroll the choices to the last milestone → choices move, the search field stays fixed, the last milestone is reachable, and the popup has no second scrollable region.
2. Filter the long milestone list, select a result, save, reopen, and then choose No milestone → filtering and selection work, the chosen row is checked, and clearing the milestone still works. Repeat selection and clearing through the card context menu → the existing shared menu behavior is preserved.
3. Open Milestone for a project with no milestones → No milestone is available; enter a new name → Create is reachable. The short menu needs no scrollbar.
4. Try the menu in the isolated app at the preferred interface size → its height, fixed search, and scrolling feel right — you check

## Spec

+ menus#milestone-search-stays-fixed — In task details, only the milestone choices scroll; the search field stays fixed at every interface size
  Why: one scrolling region keeps search reachable and removes competing scrollbars
  Done: 1, 3
```
