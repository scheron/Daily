/** Why a rebind did not happen: `invalid` is not a usable accelerator, `unavailable` is taken by another app, `not-running` means the Quick task process is not there to ask. */
export type HotkeyRebindResult =
  | {ok: true}
  | {ok: false; reason: "invalid" | "unavailable"; active: string | null}
  | {ok: false; reason: "not-running"; active: null}

/** What Settings shows about the shortcut: whether the Quick task process is up, and the accelerator it has registered, if any. */
export type QuickTaskHotkeyState = {running: boolean; active: string | null}

/** What the panel's editor shows in its `/` menu: the rows, the highlighted one, and the caret's x in the panel window's coordinates. */
export type QuickTaskMenu = {rows: Array<{label: string; icon?: string; color?: string; tone?: "remove"}>; selected: number; caretX: number}
