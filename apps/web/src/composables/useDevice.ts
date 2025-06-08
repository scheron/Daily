import {breakpointsTailwind, useBreakpoints} from "@vueuse/core"

export function useDevice() {
  const breakpoint = useBreakpoints(breakpointsTailwind)

  const DEVICES = {
    ios: {name: "ios", regex: /iPhone/i},
    android: {name: "android", regex: /android/i},
    windows: {name: "windows", regex: /Windows/i},
    macOS: {name: "macOS", regex: /Mac OS X/i},
  }

  function getDeviceType(type: keyof typeof DEVICES) {
    for (const key in DEVICES) {
      const device = key as keyof typeof DEVICES

      if (DEVICES[device].regex.test(navigator.userAgent)) {
        return DEVICES[device].name === type ? device : ""
      }
    }

    return ""
  }

  return {
    isMobile: breakpoint.smaller("sm"),
    isTablet: breakpoint.smaller("md"),
    isDesktop: breakpoint.greaterOrEqual("md"),

    isIOS: getDeviceType("ios"),
    isMacOS: getDeviceType("macOS"),
    isApple: getDeviceType("ios") || getDeviceType("macOS"),

    isAndroid: getDeviceType("android"),
    isWindows: getDeviceType("windows"),
  }
}
