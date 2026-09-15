---
name: writing-types
description: Use when declaring or refactoring any TypeScript type in this repo — choosing between `type` and `interface`, adding a props/payload/return type, a union, an object shape, or a contract a class implements. Applies whenever you write `type X =` or `interface X`.
---

# Writing Types

Conventions for how we declare TypeScript types in this repo. This skill grows over time — the `type` vs `interface` rule is the first entry. Where a type is declared (inline, `types.ts`, `shared/`, `packages/protocol`) is **keeping-symbols-local**.

## `type` by default, `interface` only for `implements`

**Use `type` for everything.** Object shapes, props, payloads, unions, intersections, mapped/utility types, function signatures, return types — all `type`.

**Use `interface` in exactly two cases, nothing else:**

1. **A class must implement it** — `class A implements IA {}`. The contract is an `interface`, prefixed with `I`.
2. **Declaration merging / global augmentation** — extending an existing interface you don't own (e.g. augmenting the global `HTMLElement` or `Window`). `type` literally cannot merge, so `interface` is forced here.

Everything outside these two cases is a `type`. When in doubt, `type`.

```ts
// ✅ default — object shape, props, payload, union: all `type`
type TaskStatus = "active" | "done" | "discarded"
type BaseTagProps = {color: string; removable: boolean}
type MoveTaskReq = {taskId: Task["id"]; branchId: Branch["id"]; orderIndex: number}

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
```

Real anchors: `IAiClient` (`apps/desktop/src/main/ai/types.ts`), `IStorageController` (`packages/core/src/types/storage.ts`) and `IRemoteStorage` (`packages/protocol/src/types/sync.ts`) are `interface` **because** classes implement them. The `HTMLElement` augmentation in `apps/desktop/src/renderer/src/directives/vTooltip/vTooltip.ts` and `Window` in `apps/desktop/src/renderer/electron.d.ts` are `interface` because they merge into a global. Nothing else needs `interface`.

## Why not `interface` for plain object shapes?

- `type` handles unions, intersections, mapped types, and primitives uniformly — one keyword for every shape, no switching cost.
- `interface` silently merges across declarations; a duplicate `type` name is a hard error. For plain shapes that merge behavior is a footgun, not a feature.
- An object satisfying a shape (`const item: BaseContextMenuItem = {...}`) is **not** `implements` — that's a `type`, not an `interface`. Only a `class ... implements` clause qualifies for case 1.

## Common mistakes

- Declaring a props/payload/response shape as `interface` out of habit. → `type`.
- Reaching for `interface` "because it's an object". Object-ness is irrelevant; only `implements` and global merging matter.
- Adding the `I` prefix to a plain `type`. The `I` prefix belongs only to interfaces a class implements.
- An interface a class implements without the `I` prefix. Rename it to `IXxx`.
- An interface that exactly one class implements and nothing else reads — no parameter, variable or second implementation typed by it. It adds a second copy of the contract; drop it and let the class carry the signatures and their JSDoc (`StorageAPI` in `apps/desktop/src/renderer/src/api/Storage.ts`).
- Treating `const x: Shape = {...}` as a reason to make `Shape` an `interface`. That's not `implements` — keep it a `type`.
