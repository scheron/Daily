import type {IconName} from "@/ui/base/BaseIcon"
import type {HTMLAttributes} from "vue"

type CommonProps = {
  icon?: IconName
  children?: ContextMenuItem[] | true
  disabled?: boolean

  classIcon?: HTMLAttributes["class"]
  classLabel?: HTMLAttributes["class"]
  class?: HTMLAttributes["class"]
}

export type ContextMenuItem =
  | (CommonProps & {separator?: false; value: string; label: string})
  | (CommonProps & {separator: true; value?: string; label?: string})

export type ContextMenuSelectEvent = {
  item: ContextMenuItem
  parent?: ContextMenuSelectEvent | null
}
