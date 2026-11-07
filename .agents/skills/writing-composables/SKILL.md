---
name: writing-composables
description: Use when writing or changing a Vue composable or the call to one — the type of each parameter, what it returns, what it watches, how it is named (`useXxx`, `watchXxx`, `xxxRef`), what it cleans up, and whether logic belongs in the component, a composable or a store. Applies whenever you type a parameter as `() => T`, `Ref<T>` or `MaybeRefOrGetter<T>`, wrap a value in a getter to pass it, write a `watch`, or move logic out of a component or a store.
---

# Writing Composables

This is Vue, not React: the reactive primitives carry the state. A composable takes and gives reactive values — refs, computeds, getters — never the callbacks and dependency lists React needs, and it reaches for stores itself.

Where the file lives: **structuring-components** (a component's `composables/`) and **keeping-symbols-local** (how far it climbs). Order inside its body: **structuring-script-setup** — short related declarations form one block, and blank lines separate concerns, not declarations.

## Inputs

### A parameter the composable only reads is `MaybeRefOrGetter<T>`

Read it with `toValue()` where it is used, and watch it as `() => toValue(x)`. The caller passes whatever it holds: a ref, a computed, a template ref, a reactive object, a prop getter `() => props.id`, a plain value.

```ts
// RIGHT
export function useProfileForm(accountId: MaybeRefOrGetter<string>) {
  watch(() => toValue(accountId), load, {immediate: true})
}

// WRONG — a getter around something already reactive; a read-only parameter typed as only a ref or only a getter
useDetails(() => selectedItem)
export function useFieldFocus(input: Ref<HTMLInputElement | null>) {}
```

- **A parameter the composable writes is a `Ref<T>`**: `useVerificationCode(code: Ref<string | null>)` fills in the code.
- **A value read once to seed state is a plain value**: `useDraft(initial: Note | null)` copies the note into the draft when it starts.

### What the caller passes

- **A composable that needs store state calls the store itself** — `const {isCalendarDockExpanded} = storeToRefs(useUIStore())` — instead of receiving a flag or a getter the caller read from that store.
- **A ref goes in only when it is local component state** that cannot be re-derived without duplicating side effects: `dockTab` from `useDockTabs()` goes into `useDockMorph(dockRef, dockTab)`.
- **A store's own composables take the store's state as a context object** — `useAiModels({connectionState, …})`, `useTaskMutations({findTaskById, …})` — because a setup store cannot call itself. This is the one exception to "call the store yourself"; see below.

```ts
// WRONG — React style: the caller reads the store and hands in a getter
useDockCrossFade(dockRef, {expanded: () => uiStore.isCalendarDockExpanded})

// RIGHT — the composable reads the store itself
useDockCrossFade(dockRef)
```

### Watch sources are refs

In composables and components alike:

- Store state goes through `storeToRefs`: `watch([activeDay, activeMilestoneId], …)`, not `watch(() => [tasksStore.activeDay, filterStore.activeMilestoneId], …)`.
- A condition over several refs becomes a `computed` that is watched.
- A parameter is watched as `() => toValue(id)`, a prop as `() => props.id`.

A `watch` is for a side effect only: a request, the router, storage, the DOM.

## Naming

Names follow Vue core:

- **Returns nothing, only watches or reacts** → `watchXxx`, like `watchEffect` and VueUse's `watchDebounced`: `watchScrollIntoView(alertRef)`. It returns nothing beyond a stop handle.
- **Refines a reactive primitive and returns it** → `xxxRef` or `xxxReactive`, like `shallowRef` and `shallowReactive`: `storedRef("theme", "light")` is a `Ref<string>` kept in storage.
- **Anything else** → `useXxx`, which returns state.

## No React patterns

| React habit                                                               | In Vue                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Dependencies serialised into a key: `watch(() => JSON.stringify([a, b]))` | Watch the sources: `watch([() => props.view, id, filter], load)`     |
| State copied from props or a store and kept in sync by a `watch`          | `computed`; a writable `computed` or `defineModel` when it is edited |
| A callback prop for an event: `onSaved: () => void`                       | `defineEmits`                                                        |
| A render function passed as a prop                                        | A slot                                                               |
| A setter that only assigns: `setOpen(value)`                              | Return the ref, or `defineModel`                                     |
| A getter returned instead of state: `getUser()`                           | Return the ref or computed                                           |

## A store composes composables

A store holds the state many screens share and the actions that change it. Choose a store by cohesive module responsibility, not by ref count. Linked ephemeral UI state belongs to the store that owns that UI. No store holds one part of another domain's workflow.

A responsibility that is large and has an edge of its own does not grow inside the store: it moves to a composable in the store's `composables/`, the store calls that composable and returns what it hands back. The store stays the one place the state is opened and closed.

- **What leaves:** a bounded piece with its own state or its own steps — restoring the session from storage (`useSessionRestore`), the remembered account choice (`useRememberedAccount`), a load state (`useLoadingState`).
- **What stays:** the state several of those pieces write, and the actions that cross them (`login`, `logout`, `openSession`).
- **A piece that needs the store's state takes it as a parameter**, typed `Ref<T>` for what it writes and a plain function for an action: `useSessionRestore({state, openSession, clearSession})`. It never imports the store it serves.
- **A pure helper of one store** sits in the store's `utils/`: `stores/session/utils/toFailedResult.ts`.
- **A store that loads a catalog** shares the in-flight load between callers, keeps the identity of a successful result, allows a retry after a failure, and leaves screen-specific presentation to the screen.
- **Mutable state shared by independent consumers** — the registry of open dialogs, the queue of toasts — is opened in a store. A composable may adapt that store; it never hides a module-level reactive registry of its own.
- **What a store itself subscribes to** is released with `tryOnScopeDispose` in its setup, not when some component unmounts.

## Ownership

A composable is a composition mechanism, not automatically a ViewModel. Before extracting state or effects, sort them with the [responsibility guide](references/responsibilities.md): View behaviour, workflow, or UI mechanism.

- Named `useTemplateRef` declarations belong to the `.vue` that owns the matching template: `const panelRef = useTemplateRef("panel")` with `ref="panel"`. A mechanism receives refs explicitly.
- Simple view-only disclosure, focus and geometry stay in the View.
- Validation, loading and saving, dirty and pending state and application commands belong to a bounded workflow composable, even with one caller.
- UI logic that has grown, or has a clear responsibility of its own — a resize handle, a gesture, virtualization, an interruptible animation — is a composable too, in its component's `composables/`.
- No screen-shaped aggregate that only forwards other composables and hides the template's bindings.

Homes: a component's composables in its `composables/`; a composable several owners share in `src/composables/`; a store's bounded responsibility in the store's `composables/`. Static definitions go in `constants/`. Pure loaders, queries and transforms go in `utils/<domain>/`, and only when the abstraction means more than a transparent native operation.

## Cleanup

- Timers, DOM listeners and observers are disposed at the same lifecycle boundary that created them.
- A composable that outlives its subject — a route param changes under it — aborts its in-flight requests before it loads the next subject, so a stale answer never lands on the new one.
- Moving logic keeps its request cancellation, stale-result guards, atomic writes and cleanup.

## Done when

Reads take `MaybeRefOrGetter` and go through `toValue` where the value must stay reactive, writes take refs, seed-only inputs stay plain values, names follow the Vue core convention, and every effect keeps its owner and its cleanup.
