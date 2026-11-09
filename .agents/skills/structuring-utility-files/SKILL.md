---
name: structuring-utility-files
description: Use when adding, moving or splitting a utility function or class under the renderer's `utils/` (or an owner's local `utils/`), or when meeting a `helpers` file or folder — whether the utility should exist, whether it gets its own file or joins a family module, what the file is called, and where it lives. Applies whenever you're tempted to create `utils.ts`, `helpers.ts` or `common.ts`, or to drop a function into an unrelated existing file.
---

# Structuring Utility Files

Paths below are relative to the renderer root `apps/desktop/src/renderer/src` — the `@/` alias.

## Decide whether the utility should exist

A transparent wrapper around `find`, `filter`, `map` or a property read does not earn a module merely because it has several callers — use the native operation at its owner. A real second consumer is necessary but not sufficient: extract meaningful domain policy, a reusable transform or a nontrivial algorithm. Loading and caching shared data belongs to the store that owns it, not to a utility.

## Where it lives

1. Is it needed outside the renderer by a real consumer? → `packages/std` (`@daily/std`, domain-free: `getToday`, `toDateLabel`) or `packages/protocol` (`@daily/protocol`, rules over the synced domain: `sortMilestones`, `milestoneCompletion`). No promotion on speculation (**keeping-symbols-local**).
2. Is it used by one owner only — one component, one store, the router? → that owner's local `utils/` (`ui/modules/RightPanel/utils/`, `stores/task-editor/utils/`), same one-function-per-file shape.
3. Is it a tiny primitive that belongs to an existing closed family module? → add it there.
4. Otherwise → **own file**, named after the function, in the matching domain folder of `utils/`, or in `utils/common/` when no domain fits. When in doubt, own file.

## One function per file

A utility gets its own file named exactly after it (camelCase, even for a one-liner that has earned its place):

```
utils/
  storage/applyChangeset.ts          // export function applyChangeset(...)
  tags/sortTagsByName.ts             // export function sortTagsByName(...)
  ui/findVerticalScrollAncestor.ts   // export function findVerticalScrollAncestor(...)
  ui/toRawDeep.ts                    // export function toRawDeep(...)
```

- **Nothing sits directly in the `utils/` root** — not a function, not a class, not a family module. It goes in a domain folder, or in `common/`.
- A domain folder groups files; it is never a single file. Create it when the first utility of that domain arrives, named like the matching area of `types/` or `stores/`.
- `arrays/`, `objects/`, `strings/` are domain folders like any other, one file per function — never `arrays.ts`, `objects.ts`, `strings.ts`.
- `common/` means one file per common function, never a `common.ts`.
- A domain folder has no `index.ts`: import from the exact file, `import {sortTagsByName} from "@/utils/tags/sortTagsByName"`.
- The same holds inside an owner's `utils/`: a component folder never gets a `utils.ts` or `helpers.ts` of its own.
- Converters: a value to its display string is `toX.ts`, a string back to the value is `fromX.ts`.

## Conventions for the file

- **Named exports only** — no `export default`.
- A small type bound tightly to the function sits in the same file, beside the function that uses it.
- Never `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`; never a file named by category (`tagUtils.ts`) instead of by function (`sortTagsByName.ts`).
- JSDoc only when it earns it (**writing-comments**). A pure utility with a non-obvious contract may carry an `@example` (`defineVariant` in `ui/tailwindcss.ts`); trivial ones carry nothing.

## A class is a file of its own

A file that exports a class or its ready instance is PascalCase and named by the class without its underscore (**naming-files**): `utils/common/EventEmitter.ts`. It lives in a domain folder or `common/`, like a function. A class that needs several files becomes a folder whose `index.ts` is its door.

## Utilities and singletons

`utils/` holds standalone functions and base classes that can be called from anywhere. A wrapper bound to a library, shared state, and anything that exists once per app are not utilities: they live in a `lib/` layer, or in the module that owns them (an API client inside the API layer). Such a singleton's file holds the class and its one instance; callers import the instance, never the class. Here the class is `_<Name>` and the instance `<Name>`, both in `<Name>.ts`: `api/Storage.ts` holds `class _Storage` and `export const Storage = new _Storage(...)`, and callers import `Storage`. `lib/` has no barrel either: import from the exact file.

## A closed family may share a file

A **fixed, closed set of tiny primitives over one thing** may share one module named after the family. In this repo those are:

| Module              | Family                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `ui/tailwindcss.ts` | class-name primitives: `cn`, `defineVariant`                                                       |
| `ui/dom.ts`         | DOM queries: `findFocusableEl`, `findAllFocusableElements`, `findClosestAtPoint`, `getCssVariable` |

Every function in it belongs to that one family. A function with real domain logic, or one that doesn't fit the family's vocabulary, gets its own file.

General-purpose operations over arrays, objects or strings are not a closed family — they keep growing, so they live in folders, one file per function.

## `helpers` is not a name

`helpers` is not a file or folder name (**naming-files**), and a `helpers` file or folder is not a family either:

- Nothing new goes into it, not even a function that looks like it fits.
- Move any function you edit to its own file, placed by the table below.

| What the function is                   | Where it goes                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| a pure function                        | `utils/<domain>/<fn>.ts`; next to its owner when only one module uses it — `<owner>/utils/<fn>.ts` |
| uses Vue reactivity or lifecycle (Vue) | `composables/`, or the owner's `composables/` (**writing-composables**)                            |

Router utilities live in `router/utils/<fn>.ts`, never `router/helpers/`.

## Common mistakes

- Creating `utils.ts` / `helpers.ts` / `common.ts` / `misc.ts` and letting unrelated functions pile up.
- Leaving a utility at the `utils/` root instead of in a domain folder or `common/`.
- An `arrays.ts`, `objects.ts` or `strings.ts` family file instead of a folder.
- A function file lying loose in a component folder instead of its `utils/`.
- Adding a function to an existing `helpers` because it is already there.
- Dropping a function into `ui/dom.ts` or `ui/tailwindcss.ts` because the import is handy, when it isn't part of that family.
- Replacing `helpers.js` with `helpers.ts`, or with a `utils.ts` of the same contents.
- A barrel `index.ts` over a utils folder or over `lib/`.
- Naming the file by category (`tagUtils.ts`) instead of by the function (`sortTagsByName.ts`).
- A class or singleton file in camelCase.
