import type {CommandHelp} from "../help"

export const PROJECTS_HELP: CommandHelp = {
  output: '{"branches":[Branch,...]}',
  details: `
Lists projects. CLI commands use the active project by default.
Pass --project to task commands to target a project by id or exact name.

Human-readable rows:
  Each row contains exact project name followed by its full id. Empty output
  prints "(no projects)" and exits successfully.

JSON result:
  {"ok":true,"data":{"branches":[Branch,...]}}
  The JSON collection is named "branches" because projects use the Branch data
  model internally. This field name is intentional and stable.

Using the result:
  Pass either Branch.id or the exact, case-sensitive Branch.name to --project.
  Prefer ids in automation because names may be renamed. Without --project,
  commands use the project currently active in the desktop app.

Examples:
  daily projects
  daily projects --json
  daily tasks --project Work
  daily tasks add "Plan sprint" --project Work
`,
}
