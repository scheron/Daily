---
name: naming-files
description: Use when creating or renaming a file or folder in a front-end source tree (TypeScript/Vue code) — case, role suffix (`.store`, `.endpoint`, `.events`, `.meta`), stores, classes and singletons, DTOs, `index.ts` barrels, `helpers`, a regex constant, an acronym, or a hyphen in a name.
---

# Naming Files

The rules cover an app's front-end source tree, with paths relative to its source root; a backend or another package names its files by its own architecture.

Component folders and the `ui/` layout: **structuring-components**. One function per file in `utils/`: **structuring-utility-files**. Where a test file sits: **writing-tests**.

## Rules

1. **Case follows the kind of content.** A component or a class is PascalCase, and so is a file that exports a ready instance of a class — it is named by the class without its underscore, and the instance is what callers import. Here the class is `_<Name>` and the instance `<Name>`, both in `<Name>.ts`: `api/Storage.ts` holds `class _Storage` and `export const Storage = new _Storage(...)`, and callers import `Storage`. Everything else is camelCase. The case of the exported identifier does not matter: a table of strings exported as `ErrorMessages` goes in `errorMessages.ts`. Never kebab-case.
   `ApiClient.ts`; `utils/common/EventEmitter.ts`; `utils/auth/withToken.ts`; `ui/base/BaseInput.vue`.
2. **Name by the main export**; several equal exports → name by the topic. `composables/useTheme.ts`; `constants/storageKeys.ts`; `utils/common/typeGuards.ts`.
   **Composables** (Vue): the group's name is not repeated in the composable's name when the rest is clear on its own — `composables/websocket/useSubscription.ts`; keep the prefix when it carries the meaning — `composables/widgets/useWidgetState.ts`. The prefix itself (`useXxx`, `watchXxx`, `xxxRef`) is chosen by **writing-composables**.
3. **Role suffix** — a closed list: `.store`, `.endpoint`, `.schema`, `.worker`, `.test`, `.d`, `.events`, `.meta`. The part before the dot follows rules 1–2, and suffixes stack: `<name>.store.test.ts`.
   `stores/session/session.store.ts`, `login.endpoint.ts`, `email.schema.ts`, `parser.worker.ts`, `env.d.ts`, `locales/en-US.meta.ts`, `useTheme.test.ts`. Event-name constants are `constants/events/<name>.events.ts`: the files are found by searching for the suffix, yet they lie together in one folder.
4. **Identifier tied to the file name:** `useXStore` ↔ `x.store.ts`; `xEndpoint` ↔ `x.endpoint.ts`; `xSchema` ↔ `x.schema.ts`; directive `vX` ↔ `vX.ts` (Vue); `useXModal` ↔ `XModal/` (Vue). `useSessionStore` ↔ `stores/session/session.store.ts`, `loginEndpoint` ↔ `login.endpoint.ts`, `directives/vFocusOnMount.ts`, `useConfirmModal` ↔ `ConfirmModal/`.
5. **Folders outside `ui/` are kebab-case**, usually one word. `api/rest-client/`, `constants/validation-schemas/`.
6. **`helpers` is not a name** for a file or a folder, in `router/` too: router utilities live in `router/utils/`. Where a `helpers` file's functions go: **structuring-utility-files**.
7. **The kind word goes last** in a component or class name, everywhere — in groups, in `{fragments}`, for classes. `ConfirmModal`, `PasswordInput`, `SessionStore`, `ApiRestError`.
8. **No truncated words; an acronym is written as a word.** `IconButton`, not `IconBtn`; `QrCode`, not `QRCode`; `CsvExporter`; `ApiRestError`, not `ApiRESTError`; `decodeJwt`, not `decodeJWT`.
9. **`index.ts` is the door of a module**: a component folder, a store, an `api` module, the router, a class split over several files. `stores/session/index.ts`, `api/rest-client/index.ts`. A grouping — a `ui/` group, a domain folder of `utils/`, `composables/`, `constants/`, `types/`, `directives/`, `lib/` — has no barrel.
10. **A store is always a folder, one folder one store:** `stores/<name>/<name>.store.ts` plus an `index.ts` that re-exports by name: `export {useSessionStore} from "./session.store"`. A second store is a second folder, never a second file in the first. The Pinia store file defines it as `export const useXStore = defineStore("x", () => {…})` — no default export; the store id matches the folder and never changes once released.
    What else lies in the folder, only when the store has it:
    - `composables/` — composables only this store uses; the door does not re-export them.
    - `utils/` — the store's functions; where a function lives and how far it is exported: **structuring-utility-files** and **keeping-symbols-local**.
    - `constants.ts` — the store's constants.
    - `types.ts` — the types of the store's state and of what it works on; a type other code needs too goes to `types/` (**writing-types**).
    - the tests of the store and of the files above, placed as **writing-tests** says.

    The door re-exports the store and any name from the folder that other code needs. How the store releases what it subscribes to: **writing-composables**.

11. **A regex is a constant in `constants/regex.ts`**, named `<WHAT>_REGEX`, and a caller imports it from there; no file keeps its own regex literal.
12. **One file per `Error` subclass**, named by the class, in a folder of errors grouped by domain: `errors/auth/SessionExpiredError.ts`.
13. **Shared data and environment.** Shared contracts go in `types/<domain>.ts`, static catalogs and content in `constants/<domain>/`, loaders and transforms in `utils/<domain>/` — no feature silo at the source root. Application metadata is static data, not an export borrowed from a page.
14. **DTO**, when the app has an API layer: `<Name>Dto.ts`, a class with a `static fromEntry` that normalizes an endpoint response, and a `static to<Name>Body(params)` for every request body the endpoint sends, so an endpoint never builds a body inline: `UserDto.fromEntry`, `UserDto.toUpdateBody`. A DTO never imports a type from an endpoint file: it declares a local, unexported input type for each mapper, with only the fields that mapper reads, and the endpoint's params satisfy it structurally.

## Exceptions

- `assets/**` — the naming rules do not apply: in `icons/` the file name is the sprite id, and `styles/` keeps its names.
- Locale files are named by their locale tag: `locales/en-US.json`, `locales/en-US.meta.ts`.
- Generated files keep the names and paths their generator gives them.
- A `constants/` folder whose `index.ts` composes the files beside it into one value (a map of form schemas built from the field schemas next to it) is a module, and that `index.ts` is its door, not a barrel.

## Common mistakes

- Copying a hyphenated, `Btn`-style or otherwise rule-breaking name from a neighbouring file.
- camelCase for a class, or for a file that exports an instance of a class.
- PascalCase for a module of functions or constants: `constants/messages/validationMessages.ts`, not `ValidationMessages.ts`.
- A suffix that is not on the list: `user.endpoints.test.ts`.
- A second store dropped next to the first inside one folder, or a store hidden in a component folder.
- A regex literal written inline instead of imported from `constants/regex.ts`.
