import type {CommandHelp} from "../help"

export const TAGS_HELP: CommandHelp = {
  output: '{"tags":[Tag,...]}',
  details: `
Lists non-deleted tags available for task assignment.
Use tag names with daily tasks add --tag or --tags.

Human-readable rows:
  Each row contains color, exact tag name, and full tag id. Empty output prints
  "(no tags)" and exits successfully.

JSON result:
  {"ok":true,"data":{"tags":[Tag,...]}}

Using the result:
  "daily tasks add" accepts either a tag's full id or exact, case-sensitive
  name. Unknown values create tags automatically. Prefer ids in automation when
  a tag name may be renamed.

Examples:
  daily tags
  daily tags --json
  daily tasks add "Review PR" --tag work
`,
}
