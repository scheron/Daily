---
name: structuring-utility-files
description: Use when adding, moving, or refactoring a helper/utility function in the renderer's `utils/` (or a component's or store's local `utils/`) — decides whether it gets its own file or joins an existing module, how the file is named, and where it lives. Applies whenever you're tempted to create utils.ts/helpers.ts/common.ts or drop a function into an unrelated existing file.
---

# Structuring Utility Files

Paths below are relative to the renderer root `apps/desktop/src/renderer/src` — the `@/` alias.

## Core rule

**One exported utility per file by default.** A helper gets its own file named exactly after it, placed in a domain subfolder under `utils/`. We deliberately avoid grab-bag modules that accumulate unrelated functions.

```
utils/
  storage/applyChangeset.ts          // export function applyChangeset(...)
  tags/sortTagsByName.ts             // export function sortTagsByName(...)
  ui/findVerticalScrollAncestor.ts   // export function findVerticalScrollAncestor(...)
  ui/toRawDeep.ts                    // export function toRawDeep(...)
```

The file name matches the function name (camelCase), even for tiny one-liners. Domain folders (`storage/`, `tags/`, `ui/`) group files — they are **not** single files, and a helper never sits loose at the `utils/` root.

## The one exception: a cohesive primitive family

A **fixed, closed set of tiny low-level primitives over one thing** may share a single module named after the family. In this repo those are:

| Module              | Family                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `ui/tailwindcss.ts` | class-name primitives: `cn`, `defineVariant`                                                       |
| `ui/dom.ts`         | DOM queries: `findFocusableEl`, `findAllFocusableElements`, `findClosestAtPoint`, `getCssVariable` |

Every function in such a module must belong to that **one** family. The moment a function has real domain logic or doesn't fit the family vocabulary, it gets its own file instead.

`utils/codemirror/` is not a helper domain but the markdown editor itself: its layers (`extensions/`, `commands/`, `theme/`, `widgets/`, `language/`) keep their `index.ts` as the door into each layer, the way a component folder does. The rest of this skill applies to helper domains.

## Decision

1. Is it needed outside the renderer by a real consumer? → `packages/std` (`@daily/std`, domain-free: `getToday`, `toDateLabel`) or `packages/protocol` (`@daily/protocol`, rules over the synced domain: `sortMilestones`, `milestoneCompletion`). See **keeping-symbols-local** — no promotion on speculation.
2. Is it used by one component or one store only? → that owner's local `utils/` (`ui/common/calendar/TaskCalendar/utils/`, `stores/task-editor/utils/`), same one-function-per-file shape.
3. Is it a tiny generic primitive that belongs to an existing family module? → add it there.
4. Otherwise → **own file**, named after the function, in the matching domain folder. When in doubt, own file.

## Conventions for the file

- **Named exports only** — no `export default` for utils.
- Co-locate a small tightly-bound type in the same file, beside the function that uses it.
- **No barrel `index.ts`** in a helper domain. Import from the exact path: `import {sortTagsByName} from "@/utils/tags/sortTagsByName"`.
- JSDoc only when it earns it — see **writing-comments**. A pure util with a non-obvious contract may carry an `@example` (`defineVariant` in `ui/tailwindcss.ts`); trivial helpers carry nothing.

## Common mistakes

- Creating `utils.ts` / `helpers.ts` / `common.ts` / `misc.ts` and letting unrelated functions pile up. **Never.** Split into one-function files under a domain folder.
- Dropping a new function into `ui/dom.ts` or `ui/tailwindcss.ts` just because the import is handy, when it isn't part of that family. Give it its own file.
- Leaving a helper at the `utils/` root instead of in a domain folder.
- Adding a barrel `index.ts` to re-export a helper folder. We import from the specific file.
- Naming the file by category (`tagUtils.ts`) instead of by the function (`sortTagsByName.ts`).
