import type {IconName} from "@/ui/base/BaseIcon"
import type {HTMLAttributes} from "vue"

type CommonProps = {
  icon?: IconName
  children?: BaseContextMenuItem[] | true
  disabled?: boolean

  classIcon?: HTMLAttributes["class"]
  classLabel?: HTMLAttributes["class"]
  class?: HTMLAttributes["class"]
}

export type BaseContextMenuItem =
  | (CommonProps & {separator?: false; value: string; label: string})
  | (CommonProps & {separator: true; value?: string; label?: string})

export type BaseContextMenuLabeledItem = Extract<BaseContextMenuItem, {separator?: false}>

export type BaseContextMenuSelectEvent = {
  item: BaseContextMenuItem
  parent?: BaseContextMenuSelectEvent | null
}
