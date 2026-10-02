/** Why a rebind did not happen: `invalid` is not a usable accelerator, `unavailable` is taken by another app, `helper-down` means the helper process is not running to ask. */
export type HotkeyRebindResult =
  | {ok: true}
  | {ok: false; reason: "invalid" | "unavailable"; active: string | null}
  | {ok: false; reason: "helper-down"; active: null}

/** What Settings shows about the shortcut: whether the helper process is up, and the accelerator it has registered, if any. */
export type QuickCaptureHotkeyState = {running: boolean; active: string | null}

/** What the panel's editor shows in its `/` menu: the rows, the highlighted one, and the caret's x in the panel window's coordinates. */
export type QuickCaptureMenu = {rows: Array<{label: string; icon?: string; color?: string; tone?: "remove"}>; selected: number; caretX: number}
