import {readFileSync, readdirSync, statSync, existsSync} from "node:fs"
import {builtinModules} from "node:module"
import {join, posix} from "node:path"

const RUNTIME_PROVIDED = new Set(["electron", "original-fs"])
const BUILTINS = new Set(builtinModules)

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
}

/**
 * Reads an asar archive's header and exposes its contents.
 *
 * Implemented directly against the asar container format rather than through
 * `@electron/asar` on purpose: this gate exists to police the dependency
 * machinery, so it must not depend on that machinery resolving correctly.
 */
function openAsar(archivePath) {
  const fd = readFileSync(archivePath)
  const headerSize = fd.readUInt32LE(4)
  const jsonSize = fd.readUInt32LE(12)
  let header
  try {
    header = JSON.parse(fd.subarray(16, 16 + jsonSize).toString("utf8"))
  } catch (error) {
    throw new Error(`${archivePath} is not a readable asar archive: ${error.message}`)
  }
  const dataOffset = 8 + headerSize

  function lookup(path) {
    let node = header
    for (const segment of path.split("/")) {
      if (!segment) continue
      if (!node.files || !node.files[segment]) return null
      node = node.files[segment]
    }
    return node
  }

  return {
    isFile(path) {
      const node = lookup(path)
      return node != null && node.files === undefined
    },
    read(path) {
      const node = lookup(path)
      if (!node || node.files) return null
      if (node.unpacked) return null
      const start = dataOffset + Number(node.offset)
      return fd.subarray(start, start + node.size).toString("utf8")
    },
    countFiles() {
      let n = 0
      ;(function walk(node) {
        if (!node.files) return void n++
        for (const child of Object.values(node.files)) walk(child)
      })(header)
      return n
    },
  }
}

/** Merges the asar archive and its `.unpacked` sidecar into one virtual filesystem. */
function openBundle(resourcesDir) {
  const archivePath = join(resourcesDir, "app.asar")
  const unpackedDir = join(resourcesDir, "app.asar.unpacked")

  if (!existsSync(archivePath)) {
    if (existsSync(join(resourcesDir, "app"))) {
      fail(
        "app.asar is missing but Contents/Resources/app exists: the build produced a loose, " +
          "unarchived app directory. asar has been turned off. Re-enable it, or update this gate " +
          "deliberately — it will not silently fall back to walking the filesystem.",
      )
    } else {
      fail(`no app payload found in ${resourcesDir}: neither app.asar nor app/`)
    }
    process.exit(1)
  }

  const asar = openAsar(archivePath)
  const unpacked = new Set()
  if (existsSync(unpackedDir)) {
    ;(function walk(dir, prefix) {
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry)
        const rel = prefix ? `${prefix}/${entry}` : entry
        if (statSync(abs).isDirectory()) walk(abs, rel)
        else unpacked.add(rel)
      }
    })(unpackedDir, "")
  }

  return {
    archivePath,
    unpackedDir,
    unpackedFiles: unpacked,
    isFile: (p) => asar.isFile(p) || unpacked.has(p),
    read: (p) => (unpacked.has(p) ? readFileSync(join(unpackedDir, p), "utf8") : asar.read(p)),
    entryCount: asar.countFiles(),
  }
}

/** Extracts bare-specifier imports left external by the bundler. */
function externalSpecifiers(source) {
  const found = new Set()
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const re of patterns) {
    for (const [, spec] of source.matchAll(re)) {
      if (!spec || spec.startsWith(".") || spec.startsWith("/")) continue
      if (spec.startsWith("node:") || BUILTINS.has(spec)) continue
      if (RUNTIME_PROVIDED.has(spec)) continue
      found.add(packageNameOf(spec))
    }
  }
  return found
}

function packageNameOf(specifier) {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

/** Node-style upward `node_modules` resolution, evaluated inside the bundle. */
function resolveFrom(bundle, fromDir, pkgName) {
  let dir = fromDir
  for (;;) {
    const candidate = posix.join(dir, "node_modules", pkgName, "package.json")
    if (bundle.isFile(candidate)) return posix.join(dir, "node_modules", pkgName)
    if (!dir) return null
    dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : ""
  }
}

function main() {
  const appPath = process.argv[2]
  if (!appPath) {
    console.error("usage: verify-bundle-closure.mjs <path to Daily.app>")
    process.exit(2)
  }

  const resourcesDir = join(appPath, "Contents", "Resources")
  if (!existsSync(resourcesDir)) {
    fail(`not an app bundle: ${appPath} has no Contents/Resources`)
    process.exit(1)
  }

  const bundle = openBundle(resourcesDir)
  console.log(`archive: ${bundle.archivePath} (${bundle.entryCount} entries)`)
  console.log(`unpacked: ${bundle.unpackedFiles.size} files`)

  const entryPoints = ["out/main/main.js", "out/preload/preload.cjs"]
  const roots = new Set()
  for (const entry of entryPoints) {
    const source = bundle.read(entry)
    if (source == null) {
      fail(`entry point ${entry} is missing from the bundle`)
      continue
    }
    for (const name of externalSpecifiers(source)) roots.add(name)
  }
  if (process.exitCode === 1) process.exit(1)

  console.log(`externalized roots imported by main+preload: ${roots.size}`)

  // A zero-root result would make every check below pass vacuously. main always imports at
  // least better-sqlite3, which is native and cannot be bundled, so an empty set means the
  // scan broke rather than that there is nothing to verify.
  if (roots.size === 0) {
    fail(
      "no externalized dependencies were found in the packaged main/preload bundles. " +
        "This check cannot verify anything in that state - the bundle format or the entry point " +
        "names have changed and this gate needs updating.",
    )
    process.exit(1)
  }

  const missing = []
  const seen = new Set()
  const queue = []
  for (const name of roots) queue.push({pkg: name, fromDir: "out/main", via: "main/preload"})

  while (queue.length) {
    const {pkg, fromDir, via} = queue.shift()
    const dir = resolveFrom(bundle, fromDir, pkg)
    if (!dir) {
      missing.push({pkg, via})
      continue
    }
    if (seen.has(dir)) continue
    seen.add(dir)

    let manifest
    try {
      manifest = JSON.parse(bundle.read(posix.join(dir, "package.json")))
    } catch {
      fail(`unreadable package.json for ${pkg} at ${dir}`)
      continue
    }
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      queue.push({pkg: dep, fromDir: dir, via: `${pkg} -> ${dep}`})
    }
    for (const dep of Object.keys(manifest.optionalDependencies ?? {})) {
      if (resolveFrom(bundle, dir, dep)) queue.push({pkg: dep, fromDir: dir, via: `${pkg} -> ${dep} (optional)`})
    }
  }

  console.log(`resolved packages in closure: ${seen.size}`)

  if (missing.length) {
    fail(`${missing.length} package(s) in the runtime dependency closure are not resolvable inside the bundle:`)
    for (const {pkg, via} of missing) console.error(`  missing: ${pkg}   (required by ${via})`)
    console.error("This is the failure that ships as ERR_MODULE_NOT_FOUND on the user's machine.")
  }

  const nativeBinaries = [...bundle.unpackedFiles].filter((f) => f.endsWith(".node"))
  const sqliteNative = nativeBinaries.find((f) => f.includes("better-sqlite3"))
  if (!sqliteNative) {
    fail(
      "better-sqlite3's native binary is not in app.asar.unpacked. A .node file swallowed by the " +
        "asar builds, signs and ships, then dies on first database access.",
    )
  } else {
    console.log(`native binary unpacked: ${sqliteNative}`)
  }

  if (process.exitCode === 1) {
    console.error("bundle closure verification FAILED")
    process.exit(1)
  }
  console.log("bundle closure verification passed")
}

main()
