# Task Activity

Comments and history events shown together in task details.

### visible-time — Comments and history events always show small, aligned local HH:mm before the retained icon, without timestamp hover or focus tooltips

Why: time should be scannable without hovering or obscuring entry content.

- Open Activity on a task with comments and history, including an entry at 01:05 → every row shows small, muted `HH:mm` before the retained icon, with aligned columns and a leading zero
- Hover or focus a comment or history row → no timestamp tooltip appears; source badge explanations remain available and full timestamps remain accessible
- Inspect Activity in a narrow right panel with a long comment → time and icons remain legible, previews wrap or clip normally, and actions remain reachable

### comment-action-fade — Comment actions preserve hover and keyboard access and fade in and out through opacity only over 150 ms

Why: actions remain easy to reach while appearing smoothly without distracting movement.

- Hover a comment or focus its controls from the keyboard, then leave → its existing action panel fades in and out over 150 ms without sliding; opening a comment and deletion confirmation still work
