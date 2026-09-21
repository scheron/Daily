import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

function read(relativePath: string): string {
  return readFileSync(join(rootDir, relativePath), "utf-8")
}

describe("the server image carries packages/core", () => {
  it("TC-3: copies packages/core's manifest into the builder's dependency layer before pnpm install", () => {
    const dockerfile = read("Dockerfile")
    const installIndex = dockerfile.indexOf("RUN pnpm install --frozen-lockfile --ignore-scripts")
    expect(installIndex).toBeGreaterThan(-1)

    const manifestLayer = dockerfile.slice(0, installIndex)
    const manifestCopies = manifestLayer.match(/^COPY .*package\.json.*$/gm) ?? []

    expect(manifestCopies).toContain("COPY packages/core/package.json ./packages/core/package.json")
    expect(manifestCopies).toContain("COPY packages/protocol/package.json ./packages/protocol/package.json")
    expect(manifestCopies).toContain("COPY packages/std/package.json ./packages/std/package.json")
  })

  it("TC-3: copies packages/core's sources with the other packages before the bundle build runs", () => {
    const dockerfile = read("Dockerfile")
    const buildIndex = dockerfile.indexOf("RUN pnpm build:server:package")
    expect(buildIndex).toBeGreaterThan(-1)

    const sourceLayer = dockerfile.slice(0, buildIndex)
    const sourceCopies = sourceLayer.match(/^COPY (apps\/server|packages\/\w+) .*$/gm) ?? []

    expect(sourceCopies).toContain("COPY packages/core ./packages/core")
    expect(sourceCopies).toContain("COPY packages/protocol ./packages/protocol")
    expect(sourceCopies).toContain("COPY packages/std ./packages/std")
  })

  it("TC-3: un-ignores packages/core in .dockerignore beside the other packages", () => {
    const dockerignore = read(".dockerignore")
    const unignoredLines = dockerignore.split("\n").filter((line) => line.startsWith("!"))

    expect(unignoredLines).toContain("!packages/core")
    expect(unignoredLines).toContain("!packages/protocol")
    expect(unignoredLines).toContain("!packages/std")
  })
})
