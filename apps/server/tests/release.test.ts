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
    expect(workflow).toContain("scripts/ci/derive-protocol-tag.sh")
    expect(workflow).not.toContain("p1")

    const scriptPath = join(rootDir, "scripts/ci/derive-protocol-tag.sh")
    expect(existsSync(scriptPath)).toBe(true)

    const script = readFileSync(scriptPath, "utf-8")

    expect(script).toContain("SYNC_PROTOCOL_VERSION")
    expect(script).toContain("packages/protocol/src/types/syncProtocol.ts")
    expect(script).not.toContain("src/shared/types/syncProtocol.ts")
    expect(script).not.toContain("p1")
    expect(script).toMatch(/exit 1/)
  })
})

describe("deploy/install.sh", () => {
  it("TC-3: pins the image to the current SYNC_PROTOCOL_VERSION everywhere the rolling tag appears", () => {
    const protocolPath = join(rootDir, "packages/protocol/src/types/syncProtocol.ts")
    expect(existsSync(protocolPath)).toBe(true)

    const protocolSource = readFileSync(protocolPath, "utf-8")
    const versionMatch = /SYNC_PROTOCOL_VERSION\s*=\s*(\d+)/.exec(protocolSource)
    expect(versionMatch, "packages/protocol/src/types/syncProtocol.ts should declare SYNC_PROTOCOL_VERSION").not.toBeNull()
    const protocolVersion = (versionMatch as RegExpExecArray)[1]

    const installScriptPath = join(rootDir, "deploy/install.sh")
    expect(existsSync(installScriptPath)).toBe(true)

    const installScript = readFileSync(installScriptPath, "utf-8")
    const pinnedTags = [...installScript.matchAll(/ghcr\.io\/scheron\/daily-server:p(\d+)/g)].map((match) => match[1])

    expect(pinnedTags.length, "deploy/install.sh should pin ghcr.io/scheron/daily-server:p<N> at least once").toBeGreaterThan(0)

    for (const tag of pinnedTags) {
      expect(tag, `deploy/install.sh pins p${tag}, but SYNC_PROTOCOL_VERSION is ${protocolVersion}`).toBe(protocolVersion)
    }
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
