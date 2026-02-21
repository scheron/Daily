import {breakpointsTailwind, useBreakpoints} from "@vueuse/core"

import {isMacOS, isWindows} from "@/constants/env"

export function useDevice() {
  const breakpoint = useBreakpoints(breakpointsTailwind)

  return {
    isMobile: breakpoint.smaller("sm"),
    isTablet: breakpoint.between("sm", "lg"),
    isDesktop: breakpoint.greaterOrEqual("lg"),

    isMacOS: isMacOS,
    isWindows: isWindows,
  }
}
