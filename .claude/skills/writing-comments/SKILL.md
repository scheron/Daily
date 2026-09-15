---
name: writing-comments
description: Use when writing, keeping, or deleting any comment or JSDoc in this repo, and whenever you edit a file that already has comments. Decides whether a comment earns its place — only on a public method, export, or prop whose behaviour the name and the code do not already tell.
---

# Writing Comments

## Core rule

**No comments by default.** A comment earns its place only when both hold:

1. **It sits on a public surface** — an exported function, class, type or constant, a public method, an action a store returns, a component prop.
2. **It says what the name and the code do not** — a non-obvious contract, a unit, a side effect, an order a caller must respect, a reason that the next refactor would otherwise undo.

Inline comments inside a body, section-divider comments, and comments on private helpers never earn it. When a line needs explaining, rename or extract until it doesn't.

## Trash — delete on sight

```ts
/** After a click, the tab gets selected. */
function onSelectTab(id: TabId) {}
```

The name already said it. Retelling the name in a sentence is the most common kind.

```ts
// refs
const isOpen = ref(false)

/**
 * @param id - the task id
 */
export function findTaskById(id: Task["id"]) {}

// const old = computeLegacy(task)
```

A section label, a `@param` that restates the type, commented-out code — all trash.

## Earns it

```ts
/** Resolves to `null` when the remote snapshot is newer than this build can read — the caller aborts sync instead of retrying. */
export function readSnapshot(raw: unknown): Snapshot | null {}
```

The signature cannot tell the caller that `null` means "abort, don't retry." That is the whole test: remove the comment — does a careful reader of the code lose something they need?

A pure util whose contract is easiest shown by use may carry an `@example` — `defineVariant` in `apps/desktop/src/renderer/src/utils/ui/tailwindcss.ts`.

## Where

- **Components (`.vue`) and composables** — zero comments. A prop gets JSDoc only when its behaviour is not obvious from its name and type.
- **Stores, services, controllers** — only on the public actions/methods that pass the core rule.
- **Tests** — none; a case that needs explaining needs a better name (**writing-tests**).
- **Tool directives are code, not comments** — `// @ts-nocheck`, `// @vitest-environment`, `// eslint-disable-next-line` stay.
- **Teaching references** under `.claude/skills/**/reference/` are the only place section labels are allowed.

## When editing a file

Delete every comment in the code you touch that does not pass the core rule. Not being wrong is not a reason to keep one.

## Common mistakes

- JSDoc that retells the function name (`/** Selects the tab */ function selectTab`).
- JSDoc on a private helper or a composable's inner function.
- Explaining _how_ the code works line by line. The code says how; a comment may only say what the code cannot.
- Section labels in `<script setup>` — the order and blank lines carry it (**structuring-script-setup**).
- Leaving commented-out code "for later." Git has it.
