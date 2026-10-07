import {PRIORITY_LEVELS} from "@/constants/priority"

import type {PriorityLevel} from "@/types/ui"
import type {TaskPriority} from "@daily/protocol"

/**
 * An unknown value falls back to No priority.
 * @example getPriorityLevel("urgent").label // "Urgent"
 */
export function getPriorityLevel(priority: TaskPriority): PriorityLevel {
  return PRIORITY_LEVELS.find((level) => level.value === priority) ?? PRIORITY_LEVELS[0]
}
