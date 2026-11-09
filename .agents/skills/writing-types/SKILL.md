---
name: writing-types
description: Use when declaring or refactoring any TypeScript type in this repo — choosing between `type` and `interface`, adding a props/payload/DTO/return type, a union, an object shape or a contract a class implements, deciding where a type lives, or typing a value that may be absent. Applies whenever you write `type X =`, `interface X`, `as const` or an explicit `undefined`.
---

# Writing Types

Component placement follows **structuring-components**; visibility follows **keeping-symbols-local**.

## `type` by default, `interface` only for `implements`

**Use `type` for everything.** Object shapes, props, payloads, DTO shapes, unions, intersections, mapped/utility types, function signatures, return types — all `type`.

**Use `interface` in exactly two cases, nothing else:**

1. **A class must implement it** — `class A implements IA {}`. The contract is an `interface`, prefixed with `I`.
2. **Declaration merging** — extending an existing interface you don't own: a global augmentation (`HTMLElement`, `Window`) or a module augmentation (vue-router's `RouteMeta` or `Router`). `type` literally cannot merge, so `interface` is forced here.

Everything outside these two cases is a `type`. When in doubt, `type`.

```ts
// ✅ default — object shape, props, payload, union: all `type`
type HorizontalPosition = "start" | "center" | "end"
type BaseMenuItem = {value?: string; label?: string; icon?: IconName}
type MoveTaskByOrderParams = {taskId: Task["id"]; targetStatus?: TaskStatus; activeDate: ISODate}

// ✅ case 1 — a class implements it → `interface` + `I` prefix
export interface IAiClient {
  /* ... */
}
export abstract class OpenAiCompatibleClient implements IAiClient {
  /* ... */
}

// ✅ case 2 — merging into a global interface we don't own
declare global {
  interface HTMLElement {
    _tooltipCleanup?: () => void
  }
}

// ✅ case 2 — merging into a library's interface
declare module "vue-router" {
  interface RouteMeta {
    title?: string
  }
}
```

Real anchors: `IAiClient` (`apps/desktop/src/main/ai/types.ts`), `IStorageController` (`packages/core/src/types/storage.ts`) and `IRemoteStorage` (`packages/protocol/src/types/sync.ts`) are `interface` **because** classes implement them. The `HTMLElement` augmentation in `apps/desktop/src/renderer/src/directives/vTooltip/vTooltip.ts` and `Window` in `apps/desktop/src/renderer/electron.d.ts` are `interface` because they merge into a global. Nothing else needs `interface`.

## A class contract

- **A contract earns an `interface` only when something reads it besides the class** — a parameter, a variable, a second implementation or a test double typed by it. An interface that exactly one class implements and nothing else reads adds a second copy of the contract: drop it and let the class carry the signatures and their JSDoc (`StorageAPI` in `apps/desktop/src/renderer/src/api/Storage.ts`).
- **A class contract uses `interface IXxx`.**
- **Fitting a shape is not yet `implements`.** A function takes a `SocketLike`, and some class happens to fit it; no class says `implements SocketLike`, so it stays a `type`. The same holds for an object literal: `const item: BaseContextMenuItem = {...}` is not `implements`. Only a `class ... implements` clause qualifies for case 1.

## Where a type lives

Where a type is declared follows who needs it. A component contract is declared in the `.vue`: `Field.vue` declares `export type FieldExpose` inside `<script setup>` and calls `defineExpose<FieldExpose>(…)`; the consumer imports it from the `.vue`, `import type {FieldExpose} from "./Field.vue"`.

1. **Needed only inside one file** — a component (a long `Props` pulled out of the generic instead of inlined) or a composable (its options and its return type): it is not exported and stays in that file. Once independent owners need it, it moves to `types/<domain>.ts`; files within one owner may share that owner's local `types.ts`.
2. **A UI type the component's callers need** (`Props`, `Expose`, `Emits`): it is exported from the `.vue` itself.
3. **A logic type never lives in a UI component.** It lives in `types/<domain>.ts`, one file per domain, no barrel. A logic type must not depend on a component.
4. **A component folder where the `.vue` and its composables share one type:** the type sits in the folder's `types.ts` and both import it from there. If the type is needed outside the folder, it is exported through the folder's `index.ts`.
5. **A repeated type is replaced by one shared type** declared one level up. A small trivial derivation may stay duplicated; a domain contract may not.

A type that crosses the process boundary lifts to `apps/desktop/src/shared/`, and only then. A shared wire or domain contract is imported from the package that owns it (`packages/protocol`, `packages/core`); the renderer never redeclares it. The type of a persisted row stays private beside the code that reads it. A component's `types.ts` holds that owner's private types, not the app's domain types.

## An absent value is `null` or a missing key, never `undefined`

A value is never assigned, passed or returned as an explicit `undefined`. A value that may be absent is typed `T | null` and set to `null`; an optional key is left out.

```ts
// ✅
const selected = computed<User | null>(() => (selectedId.value ? findUser(selectedId.value) : null))
headers: {...options.headers, ...(token && {Authorization: `Bearer ${token}`})}
history.replace(history.location, {notice: null})

// ❌
return undefined
Authorization: token ? `Bearer ${token}` : undefined
```

`undefined` stays where the platform hands it over (an optional prop not passed, `Map.get` of a missing key) and in a check against it. A protocol, wire format or stored format keeps its semantics: this rule never rewrites one.

In a Vue template, a native attribute the DOM types allow only as `string | undefined` is left out with `v-bind` of a computed attributes object. A template attribute with an off value takes it: `:aria-current="isActive ? 'page' : 'false'"`, `:aria-hidden="Boolean(collapsed)"`, `:role="loading ? 'status' : null"`.

## A value the backend names is typed from its type, never `as const`

A status, a role: the backend owns the name — here the shared packages do (`TaskStatus` in `packages/protocol`). When it renames one, the compiler must show every place that breaks, so every list, default and map is typed from the domain type (`Status`, `ErrorCode`) and never from its own literals.

- **A list:** annotate it. `const STATUSES: Status[] = [...]`. A subset is `Exclude<Status, "deleted">[]` (`Exclude` and `Extract` are the utilities for a union; `Omit` and `Pick` are for object types).
- **A map:** `Record<Status, T>`, so a status added later fails until it has an entry.
- **A choice that adds a value:** a union, not a second list: `type StatusFilter = Status | "all"`.
- **Narrowing a string from a control:** `STATUSES.find((candidate) => candidate === value)`, not `value as Status`.

```ts
// ✅
type StatusVariant = "success" | "error" | "muted"
const STATUSES: Exclude<Status, "deleted">[] = ["active", "blocked"]
const VARIANT: Record<Status, StatusVariant> = {active: "success", blocked: "error", deleted: "muted"}

// ❌ the literals become the type; a renamed status breaks nothing
const STATUSES = ["active", "blocked"] as const
const status = value as Status
```

`as const` stays for a literal that no domain type names: a list of DOM event names, a table of icons.

## Why not `interface` for plain object shapes?

- `type` handles unions, intersections, mapped types, and primitives uniformly — one keyword for every shape, no switching cost.
- `interface` silently merges across declarations; a duplicate `type` name is a hard error. For plain shapes that merge behavior is a footgun, not a feature.
- Satisfying a shape is **not** `implements` — that's a `type`, not an `interface`.

## Common mistakes

- Declaring a props/payload/DTO/response shape as `interface` out of habit. → `type`.
- Reaching for `interface` "because it's an object". Object-ness is irrelevant; only `implements` and merging matter.
- Adding the `I` prefix to a plain `type`. The `I` prefix belongs only to contracts a class implements.
- An interface a class implements without the `I` prefix. Rename it to `IXxx`.
- An interface that exactly one class implements and nothing else reads. Drop it.
- Treating `const x: Shape = {...}`, or "this class happens to fit the shape", as a reason to make `Shape` an `interface`. That's not `implements` — keep it a `type`.
- Returning, passing or assigning `undefined` for a missing value. → `null`, or leave the key out.
