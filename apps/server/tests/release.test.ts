import {existsSync, readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

describe("release-server.yml", () => {
  it("TC-17/TC-9: derives the rolling tag from SYNC_PROTOCOL_VERSION in packages/protocol, never typing p1 by hand, and still exits 1 if the constant cannot be found", () => {
    const workflowPath = join(rootDir, ".github/workflows/release-server.yml")
    expect(existsSync(workflowPath)).toBe(true)

    const workflow = readFileSync(workflowPath, "utf-8")

    expect(workflow).toContain("SYNC_PROTOCOL_VERSION")
    expect(workflow).toContain("packages/protocol/src/types/syncProtocol.ts")
    expect(workflow).not.toContain("src/shared/types/syncProtocol.ts")
    expect(workflow).not.toContain("p1")
    expect(workflow).toMatch(/exit 1/)
  })
})

describe("apps/server/README.md", () => {
  it("TC-19: names the image and the rolling tag, and carries nothing about the retired bare-metal delivery", () => {
    const readmePath = join(rootDir, "apps/server/README.md")
    expect(existsSync(readmePath)).toBe(true)

    const readme = readFileSync(readmePath, "utf-8")

    expect(readme).toContain("ghcr.io/scheron/daily-server")
    expect(readme).toContain("p<N>")

    for (const retired of ["install-server.sh", "systemctl", "daily-server setup", "daily-server update"]) {
      expect(readme).not.toContain(retired)
    }
  })
})
