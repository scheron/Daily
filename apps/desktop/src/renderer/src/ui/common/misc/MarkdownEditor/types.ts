import type {IconName} from "@/ui/base/BaseIcon"
import type {QuickTaskMenu} from "@shared/types/quickTask"

type NestedItem = Omit<QuickTaskMenu["rows"][number], "tone" | "icon"> & {icon?: IconName; apply: () => void}

export type NestedCommand = {
  label: string
  icon: IconName
  tone?: "remove"
  isAvailable?: () => boolean
  getItems: (query: string) => NestedItem[]
}
