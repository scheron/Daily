import {APP_CONFIG} from "@daily/protocol"

export const IS_DEMO = process.env.DAILY_DEMO === "1"

export function resolveAppProfile(isDemo: boolean, isDevelopment: boolean) {
  if (isDemo) {
    return {
      name: `${APP_CONFIG.name} Demo`,
      dataDirectory: `${APP_CONFIG.name}-Demo`,
      outputDirectory: "out-demo",
      syncDirectory: `${APP_CONFIG.name}-Demo`,
    }
  }

  return {
    name: APP_CONFIG.name,
    dataDirectory: isDevelopment ? `${APP_CONFIG.name}-dev` : APP_CONFIG.name,
    outputDirectory: "out",
    syncDirectory: isDevelopment ? `${APP_CONFIG.name}-dev` : APP_CONFIG.name,
  }
}
