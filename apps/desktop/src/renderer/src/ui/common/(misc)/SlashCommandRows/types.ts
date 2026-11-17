import type {IconName} from "@/types/icons"
import type {Branch} from "@daily/protocol"

export type SlashMenu = {
  rows: Array<{
    label: string
    tooltip?: string
    project?: Pick<Branch, "id" | "emoji">
    icon?: IconName
    iconColor?: string
    color?: string
    tone?: "remove"
  }>
  selected: number
}
