import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..")

function readServerManifest(): {exports: Record<string, string>} {
  return JSON.parse(readFileSync(join(serverDir, "package.json"), "utf-8"))
}

describe("apps/server/package.json exports", () => {
  it("TC-11: exposes the package entry point and the six paths packages/core's tests reach past it, and nothing else", () => {
    const {exports} = readServerManifest()

    expect(exports["./*"]).toBeUndefined()

    expect(exports).toEqual({
      ".": "./src/index.ts",
      "./config/resolveServerConfig": "./src/config/resolveServerConfig.ts",
      "./devices/DeviceStore": "./src/devices/DeviceStore.ts",
      "./enrollment/EnrollmentStore": "./src/enrollment/EnrollmentStore.ts",
      "./http/createHttpServer": "./src/http/createHttpServer.ts",
      "./identity/ServerIdentityStore": "./src/identity/ServerIdentityStore.ts",
      "./store/instance": "./src/store/instance.ts",
    })
  })
})
