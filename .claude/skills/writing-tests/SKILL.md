---
name: writing-tests
description: Use when adding or reviewing a `*.test.ts` in this repo — decides whether a file deserves a test at all, how many cases it earns, and which existing seam to mount it on. Applies whenever you are tempted to cover a constant, a type, a barrel or a class-name map, or need the project's store/component/composable harnesses.
---

# Writing Tests

`dev-skills:tdd` governs whether a test is **honest** — verify red, derive the expectation by hand, assert on the real thing rather than the mock, mutate the production code before keeping the test. Do not restate it here; read it when writing.

This skill governs whether a test is **worth writing**, and where it mounts.

## Core rule

A test earns its place when it pins a **decision** — something a future change could alter silently, without a type error and without a crash.

A decision is one of:

- a rounding direction (`floor` vs `ceil`) or the step it snaps to
- a threshold and its strictness (`<=` vs `<`)
- precedence between two sources of the same fact (a remote change against a local one under Last-Write-Wins)
- ordering, grouping, deduplication
- absence expressed as `null` rather than a confident `0`
- a state transition — accepted / ignored as stale / removed
- a lifecycle guarantee — one shared in-flight promise, retry exactly once, cleanup on unmount
- what actually crosses `window.BridgeIPC`

Everything else is plumbing, and plumbing is covered by the decisions that run through it.

## Budget

| The code under test                                          | Cases it earns                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Makes **no** decision                                        | **2** — it works, and it fails the one way it can                          |
| Makes **n** decisions                                        | **n**, one each                                                            |
| Has a catch-all that turns any malformed input into `null`   | **1** — the catch-all is one decision, not one per kind of malformed input |
| Branches over an enum where every arm is the **same shape**  | **1** — the arm that is not a literal                                      |
| Branches over an enum where the arms are **different logic** | one per arm                                                                |

The suite is read by someone returning after a year to change something. Five hundred tests that each pin a decision are a safety net; five thousand that restate what the code obviously does are noise that teaches them to distrust the run.

## Point it at the public surface

A private helper — anything not exported, or not on the public surface of a class, store or composable — **gets no test of its own**. It is covered through the caller that uses it.

**Never widen visibility for a test.** A store or composable member that only tests read is removed from the public surface, and its test moves to the seam the app actually uses — the action the UI calls, or the util the store delegates to.

Exporting a helper, or turning a `private` method public, so a test can reach it is the change that makes the test worthless: it pins the internal shape that the next refactor was going to move, and stops pinning the behaviour someone actually depends on.

The payoff is exactly that refactor. When a private method breaks, the public one that uses it goes red — the same signal, at the level that still means something after the internals are rewritten.

```text
a store's private helper       → drive the public action, assert the state it leaves
a class's private method       → drive the public method, assert the result and the emitted event
a composable's inner function  → call what it returned, assert the value or the effect
```

And assert the **result**, not the echo. "It took the parameters and handed them back" is not a behaviour — what a caller depends on is the value, the state or the effect that came out the other side. A test that only proves the arguments survived the trip passes on any implementation, including a broken one.

## What gets no test

|                                                                 | Why                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `constants.ts`, `constants/**`, enums, string tables            | Nothing can change silently — a test would restate the value it reads |
| `types.ts`, `types/**`                                          | No runtime                                                            |
| `index.ts` barrels, `variants.ts`, `get<Part>Classes` functions | Re-exports and class-name maps                                        |
| Delegation to a dependency — `cn` → `twMerge(clsx())`           | Tests the library, not us                                             |

When a file makes no decision and is not on this list, it still gets its two cases. When it is on this list, it gets none — say so and move on.

## Where tests live

Tests never sit beside the source. They mirror it under a `tests/` root:

- `apps/desktop/tests/renderer/…` — the renderer (`stores/`, `modules/`, `components/`, `utils/`)
- `apps/desktop/tests/main/…`, `apps/desktop/tests/shared/…` — the main process and shared code
- `packages/<pkg>/tests/…` — `core`, `protocol`, `std`

Run one file from the repo root: `pnpm evitest run apps/desktop/tests/renderer/stores/tasks.store.test.ts`. The suite runs under Electron's Node (`evitest`) — plain `vitest` cannot load `better-sqlite3`.

## Seams

Mount on one that already exists. **The ideal number of new seams is zero**: a test that needs production code restructured before it can be written is reporting a design problem, and that is `dev-skills:refactor`, not this.

| Testing                           | Harness                                                                                                                 | Exemplar                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A pure function                   | none — call it                                                                                                          | `apps/desktop/tests/renderer/components/MarkdownEditor/toImageAltText.test.ts` |
| A store                           | `mockBridgeIPC()` + `setActivePinia(createPinia())` + `vi.mock` of the renderer `api`; import the store after the mocks | `apps/desktop/tests/renderer/stores/branches.store.test.ts`                    |
| A component's behaviour           | `mount` from `@vue/test-utils` + `trigger` + `emitted()`                                                                | `apps/desktop/tests/renderer/components/MessageReasoning.test.ts`              |
| A module over real stores         | `mockBridgeIPC()` + a real Pinia + `mount`                                                                              | `apps/desktop/tests/renderer/modules/CalendarDock/CalendarDock.test.ts`        |
| A composable with lifecycle hooks | `mount(defineComponent({setup() { …; return () => h("div") }}))`, so `onUnmounted` attaches                             | `setupBoard` in `CalendarDock.test.ts`                                         |
| Timers, streaming, debounce       | `vi.useFakeTimers` + `advanceTimersByTimeAsync`, awaiting a rejection **before** advancing                              | `MessageReasoning.test.ts`                                                     |
| The markdown editor (CodeMirror)  | `apps/desktop/tests/helpers/editorView.ts`: `mountEditorView` + `typeText` / `pressKey`, `unmountEditorView` after      | `apps/desktop/tests/renderer/utils/codemirror/completion.test.ts`              |
| The AI agent loop                 | `apps/desktop/tests/main/ai/helpers/agentFixture.ts`, `mockAiClient.ts`                                                 | `apps/desktop/tests/main/ai/AIController.test.ts`                              |
| Storage core over SQLite          | `packages/core/tests/helpers/db.ts`                                                                                     | `packages/core/tests/storage/…`                                                |

Shared renderer harnesses live in `apps/desktop/tests/helpers/` — `mockBridgeIPC` is the one way to stand in for `window.BridgeIPC`. When a second test file needs the same harness, move it there rather than copying it.

## Conventions

- **No comments**, same as production code. A case that needs explaining needs a better name.
- **Name the test as a sentence about behaviour**, so the diagnosis reads out of the failure: `"createBranch trims the name before it reaches the API"`, not `"works"`.
- **No MSW** — it is not a dependency. Mock at the module level with `vi.mock`, and build the mock object with `vi.hoisted` when the factory needs it.
- **Build fixtures through a `make*` factory** with overrides (`makeMilestone({targetDate: …})`), never a hand-copied object per case.

## Common mistakes

- Covering a file because it is untested rather than because it decides something. Coverage is the by-product; the decision is the reason.
- Spending five cases on a guard clause that has one behaviour, then giving a three-formula function one case because "the switch is covered".
- Asserting `toHaveBeenCalledTimes` on a mock as the whole test. That passes because the mock exists — assert on the state or the value the code produced.
- Hand-rolling a `window.BridgeIPC` stub instead of `mockBridgeIPC()`.
- Deciding a file is untested because no test mirrors its path. Test files here are sometimes **grouped** — `CalendarDock.test.ts` also drives `useTaskColumns`. Work out what is covered from what the test files _import_, never from filenames, or you will plan work that already exists.
