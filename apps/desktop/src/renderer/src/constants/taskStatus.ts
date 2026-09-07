import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@daily/protocol"

export type StatusAction = {label: string; value: TaskStatus; icon: IconName; tooltip: string}

export const STATUS_ACTIONS: StatusAction[] = [
  {label: "Backlog", value: "backlog", icon: "inbox", tooltip: "Move to backlog"},
  {label: "Active", value: "active", icon: "fire", tooltip: "Set as active"},
  {label: "Discarded", value: "discarded", icon: "archive", tooltip: "Discard task"},
  {label: "Done", value: "done", icon: "check-check", tooltip: "Mark as done"},
]

export const STATUS_COLOR_CLASS: Record<TaskStatus, string> = {
  backlog: "text-base-content/60",
  active: "text-error",
  discarded: "text-warning",
  done: "text-success",
}

export const STATUS_HOVER_CLASS: Record<TaskStatus, string> = {
  backlog: "hover:bg-base-content/10",
  active: "hover:bg-error/10",
  discarded: "hover:bg-warning/10",
  done: "hover:bg-success/10",
}

export const STATUS_SELECTED_CLASS: Record<TaskStatus, string> = {
  backlog: "bg-base-content/10 hover:bg-base-content/20",
  active: "bg-error/10 hover:bg-error/20",
  discarded: "bg-warning/10 hover:bg-warning/20",
  done: "bg-success/10 hover:bg-success/20",
}

/**
 * Classes for one option in a status menu, so the picker and the card's context
 * menu read identically.
 * @param status - The option being rendered
 * @param current - The task's current status, which the option highlights when they match
 */
export function statusOptionClass(status: TaskStatus, current: TaskStatus): string {
  const base = `${STATUS_COLOR_CLASS[status]} ${STATUS_HOVER_CLASS[status]}`
  return status === current ? `${base} ${STATUS_SELECTED_CLASS[status]}` : base
}

export function findStatusAction(status: TaskStatus): StatusAction {
  return STATUS_ACTIONS.find((action) => action.value === status) ?? STATUS_ACTIONS[0]
}
