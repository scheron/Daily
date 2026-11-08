// @ts-nocheck
import {accessSync, constants} from "node:fs"
import {resolve} from "node:path"
import {describe, expect, it, vi} from "vitest"

import {createElectronPaths} from "../../../src/main/config/paths"

describe("electronPaths", () => {
  it("exposes the AppPaths surface", async () => {
    const mod = await import("../../../src/main/config/electronPaths")
    for (const key of ["appDataRoot", "dbPath", "assetsDir", "remoteSyncPath"]) {
      expect(typeof mod.electronPaths[key]).toBe("function")
    }
  })

  it("finds the desktop icon and executable iCloud helper from the desktop workspace", () => {
    const workspace = resolve("apps/desktop")
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace)

    try {
      const paths = createElectronPaths({isPackaged: false, getAppPath: () => workspace, getPath: () => workspace}, workspace)
      accessSync(paths.icon(), constants.R_OK)
      accessSync(paths.fileCoordinatorPath(), constants.X_OK)
    } finally {
      cwd.mockRestore()
    }
  })
})
