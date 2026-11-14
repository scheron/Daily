# Selection menus

Lists for selecting one value: status, priority, project, milestone, or AI model.

### same-as-priority — Selection menus follow the priority and status menus: each selected row has a gray checkmark on the right, without a highlight color

Why: consistent menus are easy to read without learning each one. The priority and status menus set the pattern.

- Open the project menu in the dock, the card context menu, and task details → the selected project has a gray checkmark on the right. Its name and icon keep their normal color.
- Open the milestone menu for a task with a milestone → its milestone has a gray checkmark on the right.
- Open Settings → AI → model selection → the current model has a gray checkmark on the right. Its name keeps its normal color.

### no-milestone-row — Show No milestone as the first row of the milestone menu in task details and the card context menu; selecting it clears the milestone, and a click on the selected milestone keeps it

Why: select the empty value from the list, as with No project and No priority, so the way to clear a milestone is visible

- Open Milestone in the details of a task with a milestone → the first row is No milestone and the task's milestone is checked. Select No milestone → the field shows "No milestone" in grey. Open the menu again → No milestone is checked.
- Right-click a card with a milestone → Milestone → No milestone → the task has no milestone, and the card no longer shows one.
- In task details and in the card context menu, click the milestone that is already checked → the menu closes, the task keeps its milestone, and its update time stays the same.
- Type "no mil" in the milestone menu → No milestone stays. Type a milestone's name → No milestone is gone. Type "no milestone" → there is no Create row.
- Open Milestone for a task whose project has no milestones → the only row is No milestone, and it is checked. Type a new name → a Create row appears.
