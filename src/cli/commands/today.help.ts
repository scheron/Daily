import type {CommandHelp} from "../help"

export const TODAY_HELP: CommandHelp = {
  output: '{"date":"YYYY-MM-DD"|null,"tasks":[Task,...]}',
  details: `
Shows tasks scheduled for today in the active project.
This is a shortcut for the most common daily check-in.

Scope and date:
  "Today" is calculated from the computer's local calendar. The project is the
  one currently active in the Daily desktop app. This command does not accept a
  date or project override; use "daily tasks" when an override is required.

Output:
  Human output uses the same rows as "daily tasks" and prints "(no tasks)" for
  an empty day. JSON output is:
    {"ok":true,"data":{"date":"YYYY-MM-DD"|null,"tasks":[Task,...]}}
  date may be null when no day record exists. An empty day is a successful result.

Examples:
  daily today
  daily today --json
`,
}
