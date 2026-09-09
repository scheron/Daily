/**
 * Runtime probe, executed by the packaged Electron binary itself with
 * ELECTRON_RUN_AS_NODE=1. Proves the shipped binary can actually load the
 * shipped modules — including the native one pulled out by asarUnpack.
 *
 * Headless by construction: it never opens a window, so it behaves the same on
 * a CI runner as on a developer machine.
 */
const {createRequire, builtinModules} = require("module")
const fs = require("fs")
const os = require("os")
const path = require("path")

const appPath = process.argv[2]
if (!appPath) {
  console.error("usage: probe-bundle-runtime.cjs <path to Daily.app>")
  process.exit(2)
}

const asar = path.join(appPath, "Contents", "Resources", "app.asar")
const mainEntry = path.join(asar, "out", "main", "main.js")
const req = createRequire(mainEntry)
const BUILTINS = new Set(builtinModules)

let failures = 0
const failure = (message) => {
  console.error(`::error::${message}`)
  failures++
}

function externalRoots() {
  const roots = new Set()
  for (const entry of [mainEntry, path.join(asar, "out", "preload", "preload.cjs")]) {
    let source
    try {
      source = fs.readFileSync(entry, "utf8")
    } catch {
      failure(`entry point not readable inside the bundle: ${entry}`)
      continue
    }
    const patterns = [
      /\bfrom\s*["']([^"']+)["']/g,
      /\bimport\s*["']([^"']+)["']/g,
      /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
      /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    ]
    for (const re of patterns) {
      for (const [, spec] of source.matchAll(re)) {
        if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) continue
        if (BUILTINS.has(spec) || spec === "electron" || spec === "original-fs") continue
        roots.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0])
      }
    }
  }
  return [...roots].sort()
}

async function loadRoots() {
  const roots = externalRoots()
  console.log(`loading ${roots.length} externalized root package(s) under the packaged binary`)
  for (const name of roots) {
    let resolved
    try {
      resolved = req.resolve(name)
    } catch (error) {
      failure(`cannot resolve ${name} from the packaged main bundle: ${error.code ?? error.message}`)
      continue
    }
    try {
      req(name)
      console.log(`  loaded  ${name}`)
    } catch (error) {
      if (error.code === "ERR_REQUIRE_ESM") {
        try {
          await import(require("url").pathToFileURL(resolved).href)
          console.log(`  loaded  ${name} (esm)`)
        } catch (esmError) {
          failure(`failed to import ${name}: ${esmError.code ?? esmError.message}`)
        }
      } else {
        failure(`failed to load ${name}: ${error.code ?? error.message}`)
      }
    }
  }
}

function exerciseNativeModule() {
  let Database
  try {
    Database = req("better-sqlite3")
  } catch (error) {
    failure(`better-sqlite3 did not load from the packaged bundle: ${error.message}`)
    return
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-probe-"))
  const file = path.join(dir, "probe.sqlite")
  try {
    const db = new Database(file)
    db.exec("CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
    db.prepare("INSERT INTO probe (value) VALUES (?)").run("packaged")
    const row = db.prepare("SELECT value FROM probe WHERE id = 1").get()
    db.close()
    if (row?.value !== "packaged") {
      failure(`better-sqlite3 read-back returned ${JSON.stringify(row)}, expected value "packaged"`)
    } else {
      console.log("  native better-sqlite3: CREATE + INSERT + read-back OK")
    }
  } catch (error) {
    failure(`better-sqlite3 failed to execute against a real database file: ${error.message}`)
  } finally {
    fs.rmSync(dir, {recursive: true, force: true})
  }
}

;(async () => {
  await loadRoots()
  exerciseNativeModule()
  if (failures > 0) {
    console.error(`runtime probe FAILED with ${failures} problem(s)`)
    process.exit(1)
  }
  console.log("runtime probe passed")
})()
