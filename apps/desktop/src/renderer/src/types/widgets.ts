import type {IconName} from "@/ui/base/BaseIcon"

export type WidgetId = "calendar-month" | "stats" | "activity"

export type WidgetSlot = {
  id: WidgetId
  height: number
}

export type WidgetLayout = WidgetSlot[]

export type WidgetDef = Omit<WidgetSlot, "height"> & {
  name: string
  icon: IconName
  maxHeight: number
  minHeight: number
  /** When false, the widget sizes to its content and exposes no resize handle. */
  resizable: boolean
}
