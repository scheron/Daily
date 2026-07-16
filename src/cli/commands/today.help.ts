import type {CommandHelp} from "../help"

export const TODAY_HELP: CommandHelp = {
  output: '{"date":"YYYY-MM-DD"|null,"tasks":[Task,...]}',
  details: `
Shows today's tasks in the active project — a shortcut for "daily tasks" with no
date. "Today" is the computer's local calendar; there is no date or project
override here (use "daily tasks" for that). Rows match "daily tasks" and an empty
day prints "(no tasks)". JSON: {"ok":true,"data":{"date":"YYYY-MM-DD"|null,"tasks":[Task,...]}}
(date may be null when no day record exists).

  daily today
  daily today --json
`,
}
