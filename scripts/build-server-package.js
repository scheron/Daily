import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {join} from "node:path"

const root = process.cwd()
const bundlePath = join(root, "out", "server", "index.js")
const outDir = join(root, "dist-server")

const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"))
const bundle = readFileSync(bundlePath, "utf-8")

const version = process.env.DAILY_SERVER_PACKAGE_VERSION?.trim() || rootPkg.version

const bareImports = new Set()
for (const match of bundle.matchAll(/(?:^|\n)import\s[^"']*["']([^."'/][^"']*)["']/g)) {
  bareImports.add(match[1].startsWith("@") ? match[1].split("/").slice(0, 2).join("/") : match[1].split("/")[0])
}

const dependencies = {}
for (const name of [...bareImports].sort()) {
  if (name.startsWith("node:")) continue
  const declared = rootPkg.dependencies?.[name]
  if (!declared) {
    console.error(`Bundle imports "${name}" which is not in package.json dependencies`)
    process.exit(1)
  }
  dependencies[name] = declared
}

rmSync(outDir, {recursive: true, force: true})
mkdirSync(outDir, {recursive: true})
copyFileSync(bundlePath, join(outDir, "index.js"))
copyFileSync(join(root, "LICENSE"), join(outDir, "LICENSE"))

const pkg = {
  name: "@scheron/daily-server",
  version,
  type: "module",
  bin: {"daily-server": "./index.js"},
  engines: {node: ">=22.5.0"},
  license: rootPkg.license,
  repository: rootPkg.repository,
  dependencies,
}

writeFileSync(join(outDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf-8")
console.log(`dist-server ready: ${pkg.name}@${pkg.version}, deps: ${Object.keys(dependencies).join(", ") || "(none)"}`)
