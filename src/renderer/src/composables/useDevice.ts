import {breakpointsTailwind, useBreakpoints} from "@vueuse/core"

export function useDevice() {
  const breakpoint = useBreakpoints(breakpointsTailwind)

  return {
    isMobile: breakpoint.smaller("sm"),
    isTablet: breakpoint.between("sm", "lg"),
    isDesktop: breakpoint.greaterOrEqual("lg"),

    isMacOS: window.BridgeIPC["platform:is-mac"](),
    isWindows: window.BridgeIPC["platform:is-windows"]() || window.BridgeIPC["platform:is-linux"](),
  }
}
