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

export const PROJECTS_CREATE_HELP: CommandHelp = {
  output: '{"branch":Branch}',
  details: `
Creates a project. Names are trimmed and must be unique case-insensitively.

  daily projects create Work
  daily projects create Work --json
`,
}

export const PROJECTS_RENAME_HELP: CommandHelp = {
  output: '{"branch":Branch}',
  details: `
Renames a project by full id or exact name. The protected main project cannot be renamed.

  daily projects rename Work Client-Work
`,
}

export const PROJECTS_DELETE_HELP: CommandHelp = {
  output: '{"branch":Branch}',
  details: `
Soft-deletes a project by full id or exact name. The protected main project cannot
be deleted. If it was active, the active project falls back to main.

  daily projects delete Work --json
`,
}

export const PROJECTS_USE_HELP: CommandHelp = {
  output: '{"branch":Branch}',
  details: `
Sets the active project used by task commands that do not specify --project or --all.

  daily projects use Work
`,
}
