import type {Tag} from "@daily/protocol"

export function sortTagsByName(list: Tag[]): Tag[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}))
}
