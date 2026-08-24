import type {FontSize} from "@daily/protocol"

export const FONT_SIZE_PX: Record<FontSize, number> = {
  small: 13,
  normal: 15,
  large: 17,
}

export const FONT_SIZE_SCALE: Record<FontSize, number> = {
  small: FONT_SIZE_PX.small / FONT_SIZE_PX.normal,
  normal: 1,
  large: FONT_SIZE_PX.large / FONT_SIZE_PX.normal,
}
