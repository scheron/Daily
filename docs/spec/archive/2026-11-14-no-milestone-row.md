This is history; the rules that hold now are in `docs/spec/`.

# Plan: Clear a task's milestone with a No milestone row

## Result

The only way to clear a task's milestone is a click on the selected row, and nothing in the menu shows it. When this plan is done, the milestone menu in task details and in the card context menu starts with a No milestone row. Selecting it clears the milestone. A click on the selected row changes nothing. A task without a milestone shows "No milestone" in grey in its details, as Project and Priority do.

## Approach

The milestone menu gets one more row at the top of its list. It reads No milestone, has a check when the task has no milestone, and reports "no milestone" when selected. The menu reports a choice only when the choice changes the value. Task details and the card context menu both open this one menu, so both get the change. The details field changes only its empty label.

- The row belongs to the menu's own list and is not a stored milestone. The empty milestone has no record behind it, as with priority. No project is different: it is the real `main` project under another name.
- No change, no report. Both places that open the menu are covered at once. If the menu reported the same value again, the task would still be saved, its update time would move, and sync would carry a change that changes nothing.
- The row's icon is the grey milestone icon that the empty field and the dock's No milestone row already use. There is no "milestone off" icon, and with No priority the row and the empty field show the same icon.
- The row is filtered by its name like any other row. Typing exactly "No milestone" therefore offers no Create row, as in the project menu.
- "No milestone" in grey replaces "Set milestone" in task details. It matches No project and No priority, and the name of the row the menu then has checked.

## Out of scope

- Clearing a task's milestone when the task moves to another project.
- The dock's No milestone filter row and the board's milestone frame.
- The milestone chip in Quick Task and the editor's slash commands.
- A dedicated "milestone off" icon.

## Done and Spec

```text
## Done

1. Open Milestone in the details of a task with a milestone → the first row is No milestone and the task's milestone is checked. Select No milestone → the field shows "No milestone" in grey. Open the menu again → No milestone is checked.
2. Right-click a card with a milestone → Milestone → No milestone → the task has no milestone, and the card no longer shows one.
3. In task details and in the card context menu, click the milestone that is already checked → the menu closes, the task keeps its milestone, and its update time stays the same.
4. Type "no mil" in the milestone menu → No milestone stays. Type a milestone's name → No milestone is gone. Type "no milestone" → there is no Create row.
5. Open Milestone for a task whose project has no milestones → the only row is No milestone, and it is checked. Type a new name → a Create row appears.
6. Open the details of a task without a milestone → the Milestone field reads "No milestone" in grey with the milestone icon.
7. The No milestone row reads like No project and No priority in their menus, with the grey milestone icon on the left — you check

## Spec

+ menus#no-milestone-row — Show No milestone as the first row of the milestone menu in task details and the card context menu; selecting it clears the milestone, and a click on the selected milestone keeps it
  Why: select the empty value from the list, as with No project and No priority, so the way to clear a milestone is visible
  Done: 1, 2, 3, 4, 5
```
