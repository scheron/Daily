# No task capture outside the main window

Status: accepted.

Quick Task was a second Electron process: the same bundle respawned with `--quick-task`, a panel
window and a separate slash-menu window, a global shortcut, a menu-bar item and its own settings.
We remove it entirely. Daily creates tasks only in the main window. There is no global shortcut and
no capture above other apps.

The panel is unused. Keeping it costs a second process with a stdio RPC channel, a hotkey register
and rebind path, tray wiring, a settings row, two hash routes, eleven bridge methods and around
twenty test files. None of that buys anything a user asks for.

## Options considered

**Keep the code and turn the feature off by setting.** Rejected: the whole surface stays alive —
process, shortcut, menu item, settings UI and tests — and the next reader still has to work out
which parts of the app are real. A disabled feature is not a removed one.

**Remove the panel but keep a global shortcut that raises the main window and focuses the task
input.** Rejected: this is a new feature, not a removal. It keeps global shortcut registration and
the rebind UI, with their conflicts with other apps, and it adds focus behaviour nobody asked for.
If out-of-window capture is wanted later, it deserves its own decision.

## Consequences

The slash menu outlives Quick Task. Its row contract `QuickTaskMenu` becomes `SlashMenu` and lives
with `SlashCommandRows`, the component that takes it as a prop. It loses `caretX`, which only the
external menu window needed; the internal popup positions itself through `getAnchor`.
`MarkdownEditor` loses the `externalMenu` prop and the `menu` emit, so the internal popup is the
only one. `isValidAccelerator` goes with its last two consumers.

Leftovers are ignored, not tidied. The `quickTask` key stays in the local settings blob and the
`Daily-QuickTask` and `Daily-QuickTask-dev` cache directories stay on disk. We add no cleanup code:
it would be new surface serving a deleted feature. The `quickCapture` → `quickTask` migration and
its test stay. The migration is untyped, so it still compiles once the field leaves `Settings`.

Settings never cross the wire — the snapshot carries no settings document — so neither
`Snapshot.version` nor the transport protocol version moves. Build and packaging are untouched:
Quick Task was never a separate build target.

Removing a shortcut users could configure is a breaking change. The next release takes a major
version, and the CHANGELOG entry is written then.

The menu-bar icon and its "Open Daily" item stay. Only the Quick Task item goes.
