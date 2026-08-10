import type {FontSize} from "@shared/types/storage"

export const FONT_SIZE_PX: Record<FontSize, number> = {
  small: 15,
  normal: 17,
  large: 19,
}

export const FONT_SIZE_SCALE: Record<FontSize, number> = {
  small: 1,
  normal: FONT_SIZE_PX.normal / FONT_SIZE_PX.small,
  large: FONT_SIZE_PX.large / FONT_SIZE_PX.small,
}
