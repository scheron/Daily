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
  it("inlines deploy/compose.yaml verbatim, so the copy people paste cannot drift from the one that is tested", () => {
    const readme = readFileSync(join(rootDir, "apps/server/README.md"), "utf-8")
    const compose = readFileSync(join(rootDir, "deploy/compose.yaml"), "utf-8")

    const block = readme.match(/```yaml\n([\s\S]*?)```/)
    expect(block).not.toBeNull()
    expect(block?.[1].trimEnd()).toBe(compose.trimEnd())
  })

  it("TC-19: names the image and the rolling tag, and carries nothing about the retired bare-metal delivery", () => {
    const readmePath = join(rootDir, "apps/server/README.md")
    expect(existsSync(readmePath)).toBe(true)

    const readme = readFileSync(readmePath, "utf-8")

    expect(readme).toContain("ghcr.io/scheron/daily-server")
    expect(readme).toContain("p<N>")

    for (const retired of ["install-server.sh", "curl -fsSL", "systemctl", "daily-server setup", "daily-server update"]) {
      expect(readme).not.toContain(retired)
    }
  })

  it("gives the reverse-proxy reader the order, the network block and a route to paste, instead of describing them in prose", () => {
    const readme = readFileSync(join(rootDir, "apps/server/README.md"), "utf-8")

    expect(readme).toContain("network daily declared as external, but could not be found")
    expect(readme).toContain("external: true")

    for (const proxy of [
      "reverse_proxy daily-server:8787",
      "proxy_pass http://daily-server:8787",
      "traefik.http.services.daily.loadbalancer.server.port",
    ]) {
      expect(readme).toContain(proxy)
    }

    expect(readme).toContain("client_max_body_size")
    expect(readme).toContain("DAILY_SERVER_MAX_ASSET_BYTES")
  })

  it("tells the reverse-proxy reader that the first start's failed address is expected and heals itself", () => {
    const readme = readFileSync(join(rootDir, "apps/server/README.md"), "utf-8")

    expect(readme).toContain("Public address verification failed")
    expect(readme).toMatch(/every 30 seconds for ten minutes/)
    expect(readme).toContain("daily-server verify")
  })
})
