import {breakpointsTailwind, useBreakpoints} from "@vueuse/core"

import {isMacOS, isWindows} from "@/constants/env"

export function useDevice() {
  const breakpoint = useBreakpoints(breakpointsTailwind)

  return {
    /**
     * Viewport below the `md` breakpoint (`width < 48rem`). JS twin of the CSS `compact:`
     * variant — keep both in sync.
     * @see {@link @/assets/styles/main.css | `@custom-variant compact`}
     */
    isCompact: breakpoint.smaller("md"),

    isMacOS: isMacOS,
    isWindows: isWindows,
  }
}
