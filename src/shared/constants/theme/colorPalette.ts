export const TAG_COLOR_PALETTE = {
  from: ["#FF6B9D", "#FF8C42", "#FFD93D", "#6BCF7F", "#4ECDC4", "#45B7D1", "#96CEB4", "#A8E6CF", "#95A5F6", "#C77DFF"],
  to: ["#FF1744", "#FF6F00", "#FFC107", "#4CAF50", "#00BCD4", "#2196F3", "#26A69A", "#66BB6A", "#5C6BC0", "#9C27B0"],
} as const

export const TAG_QUICK_COLORS: readonly string[] = TAG_COLOR_PALETTE.to
