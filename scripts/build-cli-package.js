import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {join} from "node:path"

const root = process.cwd()
const bundlePath = join(root, "out", "cli", "index.js")
const outDir = join(root, "dist-cli")

const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"))
const bundle = readFileSync(bundlePath, "utf-8")

const bareImports = new Set()
for (const match of bundle.matchAll(/(?:^|\n)import\s[^"']*["']([^."'/][^"']*)["']/g)) {
  bareImports.add(match[1].startsWith("@") ? match[1].split("/").slice(0, 2).join("/") : match[1].split("/")[0])
}

const dependencies = {}
for (const name of [...bareImports].sort()) {
  if (name.startsWith("node:")) continue
  const version = rootPkg.dependencies?.[name]
  if (!version) {
    console.error(`Bundle imports "${name}" which is not in package.json dependencies`)
    process.exit(1)
  }
  dependencies[name] = version
}

rmSync(outDir, {recursive: true, force: true})
mkdirSync(outDir, {recursive: true})
copyFileSync(bundlePath, join(outDir, "index.js"))

const pkg = {
  name: "@scheron/daily-cli",
  version: rootPkg.version,
  description: "Daily task automation from the shell — standalone sync node for the Daily app",
  type: "module",
  bin: {daily: "./index.js"},
  engines: {node: ">=22.5.0"},
  license: rootPkg.license,
  repository: rootPkg.repository,
  keywords: [...rootPkg.keywords, "cli"],
  dependencies,
}

writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf-8")
console.log(`dist-cli ready: ${pkg.name}@${pkg.version}, deps: ${Object.keys(dependencies).join(", ") || "(none)"}`)
