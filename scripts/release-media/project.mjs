import {createHash} from "node:crypto"
import {readdir, readFile, realpath, stat} from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"

import {normalizeTimeline} from "./timeline.mjs"

export const runtimeRoot = path.dirname(fileURLToPath(import.meta.url))
const runtimeFiles = ["index.html", "preview.mjs", "timeline.mjs", "project.mjs", "server.mjs", "render.mjs", "assemble.mjs", "output.mjs"]

export function parseFlags(args, values, booleans = []) {
  const flags = new Map()
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (![...values, ...booleans].includes(flag) || flags.has(flag)) throw new Error(`Unknown or duplicate option: ${flag}`)
    if (booleans.includes(flag)) flags.set(flag, true)
    else {
      const value = args[++index]
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`)
      flags.set(flag, value)
    }
  }
  return flags
}

export async function scopedFile(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some((piece) => piece === ".." || piece.startsWith(".")))
    throw new Error(`Unsafe project path: ${relative}`)
  const base = await realpath(root)
  const actual = await realpath(path.resolve(base, relative))
  if (!actual.startsWith(base + path.sep) || !(await stat(actual)).isFile()) throw new Error(`File escapes project: ${relative}`)
  return actual
}

export async function loadProject(directory) {
  if (!directory) throw new Error("--project is required.")
  const root = await realpath(path.resolve(directory))
  const timelineFile = await scopedFile(root, "director/timeline.json")
  const timeline = normalizeTimeline(JSON.parse(await readFile(timelineFile, "utf8")))
  const manifestFile = await scopedFile(root, "inputs/manifest.json")
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"))
  if (!Array.isArray(manifest.assets)) throw new Error("Input manifest must contain an assets array.")
  const ids = new Set()
  for (const asset of manifest.assets) {
    if (
      typeof asset.id !== "string" ||
      ids.has(asset.id) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isInteger(asset.bytes) ||
      asset.bytes < 0
    )
      throw new Error(`Invalid or duplicate input asset: ${asset.id}`)
    ids.add(asset.id)
    const bytes = await readFile(await scopedFile(path.join(root, "inputs"), asset.id))
    if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256) throw new Error(`Input integrity mismatch: ${asset.id}`)
  }
  return {root, timeline, manifest}
}

export async function fingerprintProject(project, partId) {
  const selected = partId ? project.timeline.parts.filter((part) => part.id === partId) : project.timeline.parts
  if (!selected.length) throw new Error(`Unknown part: ${partId}`)
  const sources = []
  for (const part of selected) {
    await scopedFile(project.root, part.module)
    const directory = path.dirname(part.module)
    for (const name of await sourceFiles(project.root, directory)) sources.push([name, hash(await readFile(await scopedFile(project.root, name)))])
  }
  const inputs = [
    ["inputs/manifest.json", hash(await readFile(await scopedFile(project.root, "inputs/manifest.json")))],
    ...project.manifest.assets.map((asset) => [asset.id, asset.sha256, asset.bytes]),
  ]
  const runtime = await Promise.all(runtimeFiles.map(async (name) => [name, hash(await readFile(path.join(runtimeRoot, name)))]))
  return {
    timeline: hash(await readFile(await scopedFile(project.root, "director/timeline.json"))),
    inputs: hash(JSON.stringify(inputs)),
    source: hash(JSON.stringify(sources)),
    runtime: hash(JSON.stringify(runtime)),
  }
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function sourceFiles(root, directory) {
  const entries = await readdir(path.join(root, directory), {withFileTypes: true})
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) files.push(...(await sourceFiles(root, name)))
    else files.push(name)
  }
  return files
}
