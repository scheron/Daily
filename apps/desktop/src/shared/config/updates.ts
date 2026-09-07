export const UPDATES_CONFIG = {
  brewCask: "scheron/tap/daily",
  brewTimeoutMs: 15 * 60_000,
  githubRepo: "scheron/Daily",
  brewEnv: {
    HOMEBREW_NO_AUTO_UPDATE: "1",
  },
  githubHeaders: {
    Accept: "application/vnd.github+json",
    "User-Agent": "Daily-App-Updater",
  },
} as const
