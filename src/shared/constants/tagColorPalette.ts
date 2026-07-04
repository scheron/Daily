import type {TagPresetColor} from "../types/theme"

export const TAG_COLOR_PALETTE = {
  from: ["#FF6B9D", "#FF8C42", "#FFD93D", "#6BCF7F", "#4ECDC4", "#45B7D1", "#96CEB4", "#A8E6CF", "#95A5F6", "#C77DFF"],
  to: ["#FF1744", "#FF6F00", "#FFC107", "#4CAF50", "#00BCD4", "#2196F3", "#26A69A", "#66BB6A", "#5C6BC0", "#9C27B0"],
} as const

export const TAG_QUICK_COLORS: readonly string[] = TAG_COLOR_PALETTE.to

/** Named preset colors offered when creating a tag (Linear-style fixed palette). */
export const TAG_PRESET_COLORS: readonly TagPresetColor[] = [
  {name: "Grey", value: "#bec2c8"},
  {name: "Dark Grey", value: "#838b96"},
  {name: "Slate", value: "#64748b"},
  {name: "Purple", value: "#5e6ad2"},
  {name: "Violet", value: "#8b5cf6"},
  {name: "Indigo", value: "#6366f1"},
  {name: "Blue", value: "#4ea7fc"},
  {name: "Sky", value: "#38bdf8"},
  {name: "Cyan", value: "#22b8cf"},
  {name: "Teal", value: "#26b5a6"},
  {name: "Green", value: "#4cb782"},
  {name: "Lime", value: "#84cc16"},
  {name: "Yellow", value: "#f2c94c"},
  {name: "Amber", value: "#f59e0b"},
  {name: "Orange", value: "#eb8e4b"},
  {name: "Red", value: "#eb5757"},
  {name: "Rose", value: "#f43f5e"},
  {name: "Pink", value: "#f178b6"},
  {name: "Brown", value: "#a3744f"},
]
