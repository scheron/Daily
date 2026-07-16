import type {CommandHelp} from "../help"

export const PROJECTS_HELP: CommandHelp = {
  output: '{"branches":[Branch,...]}',
  details: `
Lists projects; task commands use the active project unless --project or --all is
given. Rows show the exact name and full id; empty output prints "(no projects)".
Pass Branch.id or the exact, case-sensitive Branch.name to --project — prefer ids
in automation, since names may be renamed. The JSON collection is named "branches"
(projects use the Branch model internally) and is stable.
JSON: {"ok":true,"data":{"branches":[Branch,...]}}.

  daily projects
  daily projects --json
  daily tasks --project Work
`,
}
