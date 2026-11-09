---
name: writing-comments
description: Use when writing, keeping, rewriting or deleting a comment or JSDoc in this repo, including comments beside edited code. Decides whether a comment earns its place — JSDoc on a public surface whose contract the name and the code do not tell, or a one-line reason the code cannot show — and keeps every comment describing the code as it is now.
---

# Writing Comments

## Core rule

**No comments by default.** A comment is written only where the code cannot show what a reader needs: a contract the signature cannot carry, or the reason behind the code — an external constraint, a non-obvious invariant.

A JSDoc comment earns its place when both hold:

1. **It sits on a public surface** — an exported function, class, type or constant, a public method, an action a store returns, a component prop.
2. **It says what the name and the code do not** — a non-obvious contract, a unit, a side effect, an order a caller must respect, a reason that the next refactor would otherwise undo.

Every comment is **short** — one sentence, two at most — and in the present tense. Section-divider comments never earn it, and neither does narration of what a line does — when a line needs explaining, rename or extract until it doesn't.

**One exception, inline:** a one-line comment may sit inside a body or on a private helper when it records what the code cannot show — a library, browser or platform constraint, a security rule, a timing reason, an invariant the surrounding code relies on — that a reader would otherwise "fix" away:

```ts
// SQLite has no boolean type; the column holds 0 or 1.
const done = row.done === 1
```

Delete comments in the code you touch if they do not pass the core rule.

## The current state, never the history

A comment describes the code as it is now. It never records what the code used to do, what changed, what was removed or which bug a line once fixed — that history lives in git, and the commit message is where a change explains itself.

A comment that passes the core rule but no longer matches the code is rewritten to describe the code as it is, never extended with a sentence about what changed.

```ts
// ❌ history
// Switched from setTimeout to requestAnimationFrame to fix the flicker.
requestAnimationFrame(measure)

// ✅ the constraint as it stands
// The element has no size until the next frame.
requestAnimationFrame(measure)
```

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

A section label, a `@param` that restates the type, commented-out code — all trash. In plain JavaScript the JSDoc type tags (`@param {string}`, `@type`) are the only types there are, and stay.

```ts
/** … `.env` holds `VITE_API_URL`, and Vite inlines it at build time. */

// Failing at import is the kindest outcome for a `.env` that has drifted: without these keys every
// request goes to the wrong host, and the app answers a 404 that looks like a broken endpoint rather
// than a missing setting. The base URL is checked on its own because the client builds every path from it…
```

Retelling what Vite, Electron, Vue or the browser already document is not knowledge about this code. Neither is an essay justifying a guard whose `throw` message already says what is missing.

## Earns it

```ts
/** Resolves to `null` when the remote snapshot is newer than this build can read — the caller aborts sync instead of retrying. */
export function readSnapshot(raw: unknown): Snapshot | null {}
```

The signature cannot tell the caller that `null` means "abort, don't retry." That is the whole test: remove the comment — does a careful reader of the code lose something they need?

```ts
/** Runs middlewares in order, stopping at the first that returns a redirect or `false`; a throw aborts the navigation. */
export function applyMiddlewares(middlewares: Middleware[]) {}
```

A one-line summary of what an export does, stating its rule, earns it too — it is what the reader gets on hover without opening the body. The line between this and `/** Selects the tab */` is the rule: "stops at the first redirect or `false`, a throw aborts" is a contract; "selects the tab" is the name again.

A pure util whose contract is easiest shown by use may carry an `@example` — `defineVariant` in `apps/desktop/src/renderer/src/utils/ui/tailwindcss.ts`. An `@example` in JSDoc is never trash — keep it, even when the prose around it goes.

## Where

- **Components (`.vue`)** — zero comments. A prop gets JSDoc only when its behaviour is not obvious from its name and type.
- **Composables** — at most the one-line summary on the exported function; inside it, only the inline exception above.
- **Stores, services, controllers, API clients** — only on the public actions and methods that pass the core rule.
- **Tests** — none; a case that needs explaining needs a better name (**writing-tests**).
- **Tool directives are code, not comments** — `// @ts-expect-error`, `// @ts-nocheck`, `// @vitest-environment`, `// eslint-disable-next-line`, `// prettier-ignore` stay.
- **Teaching references** in a skill's own `reference/` folder (teaching code files) are the only place section labels are allowed.

## Common mistakes

- JSDoc that retells the function name (`/** Selects the tab */ function selectTab`).
- JSDoc on a private helper or a composable's inner function.
- Explaining _how_ the code works line by line. The code says how; a comment may only say what the code cannot.
- A comment that tells what the code used to do, or appends a sentence about the latest change. Rewrite it to the current state, or delete it.
- Section labels in `<script setup>` — the order and blank lines carry it (**structuring-script-setup**).
- Leaving commented-out code "for later." Git has it.
