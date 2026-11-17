import type {IconName} from "@/types/icons"
import type {SlashMenu} from "@/ui/common/(misc)/SlashCommandRows"

type NestedItem = Omit<SlashMenu["rows"][number], "tone"> & {apply: () => void}

export type NestedCommand = {
  label: string
  icon: IconName
  tone?: "remove"
  isAvailable?: () => boolean
  getItems: (query: string) => NestedItem[]
}
