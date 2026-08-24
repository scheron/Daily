export type CliInstallState = {
  available: boolean
  installed: boolean
  binPath: string
  binDir: string
  launcherPath: string
  shellProfilePath: string
  pathIncludesBin: boolean
  shellProfileIncludesBin: boolean
  pathHint: string
  conflict: boolean
}

export type CliInstallResult = {
  ok: boolean
  state: CliInstallState
  error?: string
}
