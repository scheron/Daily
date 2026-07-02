type TaskLike<Id extends string | number = string | number> = {
  id: Id
}

/**
 * From a reordered list and the moved item's new index, derives the drop anchor:
 * the following item becomes the "before" target; at the end it's "after" with no target.
 * @example resolveMoveTarget([{id: "a"}, {id: "b"}], 0) // {targetTaskId: "b", position: "before"}
 */
export function resolveMoveTarget<Id extends string | number, Item extends TaskLike<Id>>(items: Item[], newIndex: number) {
  const nextTask = items[newIndex + 1] ?? null
  const targetTaskId = (nextTask?.id ?? null) as string | null
  const position: "before" | "after" = targetTaskId ? "before" : "after"

  return {targetTaskId, position}
}
