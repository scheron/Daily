This is history; the rules that hold now are in `docs/spec/`.

# Plan: Visible Activity times and smooth comment actions

## Result

Activity currently reveals timestamps on hover, making time hard to scan and adding a distracting tooltip. Every comment and history event shows a small local `HH:mm` label to the left of its existing icon, without a time tooltip. Comment actions keep their current behavior and fade in and out over 150 ms.

## Approach

Update the existing comment and history rows together so both kinds of Activity entries have the same time, icon and text alignment. Keep the existing date grouping, time formatter, full timestamp accessibility, source badges and comment interactions. The user confirmed this design after the grill and declined a prototype in favor of direct implementation.

- Keep each event icon and put time before it — time becomes scannable while the event type remains recognizable.
- Use a small, muted, fixed-width time column with zero-padded hours — aligned times should stay legible without competing with the entry text.
- Remove only timestamp tooltips — author and source explanations remain useful and are separate from time.
- Fade comment actions through opacity only, for 150 ms in both directions — the panel should feel softer without movement or a change to its hover and keyboard-focus triggers.
- Preserve comment opening, deletion confirmation and full timestamp accessibility — this is a presentation change with no data or interaction redesign.

## Out of scope

- New date formats, time zones, settings, dependencies, shared animation utilities or Activity actions.
- Storage, IPC, sync, comment content changes and source tooltip changes.
- A prototype, production release, publishing or merging before the human gate.

## Done and Spec

```text
## Done

1. Open Activity on a task with comments and history, including an entry at 01:05 → every row shows small, muted `HH:mm` before the retained icon, with aligned columns and a leading zero — you check
2. Hover or focus a comment or history row → no timestamp tooltip appears; source badge explanations remain available and full timestamps remain accessible — you check
3. Hover a comment or focus its controls from the keyboard, then leave → its existing action panel fades in and out over 150 ms without sliding; opening a comment and deletion confirmation still work — you check
4. Inspect Activity in a narrow right panel with a long comment → time and icons remain legible, previews wrap or clip normally, and actions remain reachable — you check

## Spec

+ activity — Task Activity
  About: Comments and history events shown together in task details.
+ activity#visible-time — Comments and history events always show small, aligned local HH:mm before the retained icon, without timestamp hover or focus tooltips
  Why: time should be scannable without hovering or obscuring entry content.
  Done: 1, 2, 4
+ activity#comment-action-fade — Comment actions preserve hover and keyboard access and fade in and out through opacity only over 150 ms
  Why: actions remain easy to reach while appearing smoothly without distracting movement.
  Done: 3
```
