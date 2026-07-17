import type {CommandHelp} from "../help"

export const SYNC_HELP: CommandHelp = {
  output: '{"synced":true,"dir":string}',
  details: `
One-shot sync of the node database with the configured sync folder
(pull-merge, then push if anything differs). Requires node mode — run
"daily sync enable" first; direct mode (app database on this Mac) exits 2.
A failed sync exits 5 so agents and cron can react.
JSON: {"ok":true,"data":{"synced":true,"dir":string}}.

  daily sync
  daily sync --json
`,
}

export const SYNC_ENABLE_HELP: CommandHelp = {
  output: '{"mode":"node","dir":string}',
  details: `
Switches the CLI to node mode: an own database (XDG data dir) synced through
a folder. The folder default is ~/.local/share/daily/sync; pass --dir to use
another (e.g. a directory the Daily app reaches over SSH). Takes effect for
every subsequent command; each mutating command then pushes automatically.

  daily sync enable
  daily sync enable --dir /srv/daily-sync
`,
}

export const SYNC_DISABLE_HELP: CommandHelp = {
  output: '{"mode":"direct"}',
  details: `
Switches back to direct mode over the Daily app's database. The node database
and sync folder are left on disk untouched.

  daily sync disable
`,
}

export const SYNC_STATUS_HELP: CommandHelp = {
  output: '{"mode":"direct"|"node","dir":string|null,"snapshot":{"updatedAt":string,"hash":string}|null}',
  details: `
Shows the active mode, the configured sync folder, and the folder snapshot's
meta if one exists. Never mutates anything.

  daily sync status
  daily sync status --json
`,
}
