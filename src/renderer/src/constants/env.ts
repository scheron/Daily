export const isDevMode = import.meta.env.DEV && import.meta.env.MODE === "development"
export const isProdMode = import.meta.env.PROD && import.meta.env.MODE === "production"

export const isMacOS = window.BridgeIPC["platform:is-mac"]()
export const isWindows = window.BridgeIPC["platform:is-windows"]() || window.BridgeIPC["platform:is-linux"]()

export const devicePlatform = isMacOS ? "mac" : "win"
