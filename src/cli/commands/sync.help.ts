import type {CommandHelp} from "../help"

export const SYNC_HELP: CommandHelp = {
  output: '{"synced":true,"dir":string}',
  details: `
One-shot sync of the node database with the configured sync folder:
merge remote and local snapshots, then conditionally push the merged result.
"pull" selects the remote record when updated_at values are equal; it is not a
one-way transfer. Requires node mode — run "daily sync enable" first; direct
mode (app database on this Mac) exits 2.
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

export const SYNC_DOCTOR_HELP: CommandHelp = {
  output: '{"healthy":boolean,"mode":"direct"|"node",...}',
  details: `
Reads the active CLI configuration and, in node mode, checks the configured
folder and snapshot without writing to the database, snapshot, config, or
assets. Reports a blocking problem with exit code 5. Normal sync always merges
both sides and conditionally pushes the merged snapshot; "pull" only chooses
the remote record when timestamps are equal.

  daily sync doctor
  daily sync doctor --json
`,
}
