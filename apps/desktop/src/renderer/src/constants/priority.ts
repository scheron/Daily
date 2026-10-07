import {TAG_PRESET_COLORS} from "@daily/protocol"

import type {PriorityLevel} from "@/types/ui"
import type {TagPresetColorName} from "@daily/protocol"

/** The five priority levels in display order, each with the tag-palette colour its icon is drawn in. */
export const PRIORITY_LEVELS: readonly PriorityLevel[] = [
  {value: "none", label: "No priority", color: presetColor("Grey")},
  {value: "urgent", label: "Urgent", color: presetColor("Red")},
  {value: "high", label: "High", color: presetColor("Orange")},
  {value: "medium", label: "Medium", color: presetColor("Green")},
  {value: "low", label: "Low", color: presetColor("Blue")},
]

function presetColor(name: TagPresetColorName): string {
  return TAG_PRESET_COLORS.find((color) => color.name === name)?.value ?? ""
}
