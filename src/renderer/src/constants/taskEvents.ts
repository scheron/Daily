import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskEventType} from "@shared/types/storage"

/** Icon, verb and chip styling for each task event type, shared across activity views. */
export const TASK_EVENT_META: Record<TaskEventType, {icon: IconName; verb: string; chipClass: string}> = {
  created: {icon: "plus", verb: "Created", chipClass: "bg-accent/10 text-accent"},
  completed: {icon: "check-check", verb: "Completed", chipClass: "bg-success/10 text-success"},
  reactivated: {icon: "refresh", verb: "Reopened", chipClass: "bg-accent/10 text-accent"},
  discarded: {icon: "archive", verb: "Discarded", chipClass: "bg-warning/10 text-warning"},
  edited: {icon: "pencil", verb: "Edited", chipClass: "bg-base-300 text-base-content/60"},
  deleted: {icon: "trash", verb: "Deleted", chipClass: "bg-error/10 text-error"},
  restored: {icon: "undo", verb: "Restored", chipClass: "bg-success/10 text-success"},
  moved: {icon: "move", verb: "Moved", chipClass: "bg-accent/10 text-base-content"},
}
