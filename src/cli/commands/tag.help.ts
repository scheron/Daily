import type {CommandHelp} from "../help"

export const TAGS_HELP: CommandHelp = {
  output: '{"tags":[Tag,...]}',
  details: `
Lists non-deleted tags. Rows show color, exact name, and full id; empty output
prints "(no tags)". Use a tag's name or id with "daily tasks add --tag".
JSON: {"ok":true,"data":{"tags":[Tag,...]}}.

  daily tags
  daily tags --json
`,
}

export const TAG_DELETE_HELP: CommandHelp = {
  output: '{"tag":Tag}',
  details: `
Deletes a tag by full id or exact, case-sensitive name. The tag is removed from
every task that carries it. Unknown names/ids exit 3. Output is "deleted <id>" or
{"ok":true,"data":{"tag":Tag}} as JSON.

  daily tags delete typo-tag
  daily tags delete 8FGNzAuKdjNmCWTqjMfZO --json
`,
}
