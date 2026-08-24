import {existsSync} from "fs"
import {join} from "path"
import {fileURLToPath} from "url"
import madge from "madge"

const rootDir = join(fileURLToPath(import.meta.url), "..", "..")

const targets = ["apps/desktop/src", "apps/cli/src", "apps/server/src", "packages/core/src", "packages/protocol/src", "packages/std/src"]
  .map((dir) => join(rootDir, dir))
  .filter((dir) => existsSync(dir))

const result = await madge(targets, {
  fileExtensions: ["ts"],
  detectiveOptions: {ts: {skipTypeImports: true}},
  dependencyFilter: (dependencyPath) => !dependencyPath.endsWith(".vue"),
})

const circular = result.circular()

if (circular.length > 0) {
  console.error(`✖ Found ${circular.length} circular ${circular.length === 1 ? "dependency" : "dependencies"}!\n`)
  circular.forEach((cycle, index) => console.error(`${index + 1}) ${cycle.join(" > ")}`))
  process.exit(1)
}

console.log("✔ No circular dependency found!")
