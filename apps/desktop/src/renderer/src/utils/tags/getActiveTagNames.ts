import type {Tag, Task} from "@daily/protocol"

/**
 * The names of the selected tags, looked up in the tags the given tasks carry.
 * @example getActiveTagNames(tasks, new Set(["tag-1"])) // Set {"work"}
 */
export function getActiveTagNames(tasks: readonly Task[], activeTagIds: ReadonlySet<Tag["id"]>): Set<Tag["name"]> {
  const names = new Set<Tag["name"]>()
  for (const task of tasks) {
    for (const tag of task.tags) {
      if (activeTagIds.has(tag.id)) names.add(tag.name)
    }
  }
  return names
}
