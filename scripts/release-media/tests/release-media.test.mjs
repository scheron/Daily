import assert from "node:assert/strict"
import {execFile} from "node:child_process"
import {createHash} from "node:crypto"
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {test} from "node:test"
import {fileURLToPath, pathToFileURL} from "node:url"
import {promisify} from "node:util"

import {fingerprintProject, loadProject} from "../project.mjs"
import {startServer} from "../server.mjs"
import {normalizeTimeline} from "../timeline.mjs"

const execute = promisify(execFile)
const tools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("timeline accepts both duration boundaries and exact hard-cut coverage", () => {
  for (const frames of [240, 450]) {
    const actual = normalizeTimeline(timeline(frames))
    assert.equal(actual.durationFrames, frames)
    assert.equal(actual.parts[1].end, frames)
  }
})

test("timeline rejects gaps, duplicate identifiers, and unexplained overlap", () => {
  const gap = timeline()
  gap.parts[1].startFrame++
  assert.throws(() => normalizeTimeline(gap), /Uncovered/)
  const duplicate = timeline()
  duplicate.parts[1].id = "part-01"
  assert.throws(() => normalizeTimeline(duplicate), /duplicate/)
  const overlap = timeline()
  overlap.parts[1].startFrame--
  assert.throws(() => normalizeTimeline(overlap), /Ambiguous overlap/)
  overlap.transitions = [{type: "crossfade", from: "part-01", to: "part-02", start: 119, end: 120}]
  assert.equal(normalizeTimeline(overlap).transitions.length, 1)
  overlap.transitions[0].end++
  assert.throws(() => normalizeTimeline(overlap), /exactly describe/)
})

test("public server separates runtime from project files and rejects escaping symlinks", async (context) => {
  const project = await fixture(context)
  await symlink(path.join(project.parent, "secret.txt"), path.join(project.root, "authors/part-01/escape.txt"))
  await writeFile(path.join(project.parent, "secret.txt"), "outside project")
  const server = await startServer({project: project.root})
  context.after(() => server.close())
  const index = await fetch(server.origin)
  assert.equal(index.status, 200)
  assert.match(await index.text(), /Release motion preview/)
  assert.equal((await fetch(`${server.origin}/director/timeline.json`)).status, 200)
  assert.equal((await fetch(`${server.origin}/runtime/render.mjs`)).status, 403)
  assert.equal((await fetch(`${server.origin}/authors/part-01/escape.txt`)).status, 400)
  assert.equal((await fetch(`${server.origin}/inputs/unlisted.txt`)).status, 403)
  assert.equal((await fetch(server.origin, {method: "POST"})).status, 405)
})

test("selected-part server rejects cross-author dependencies", async (context) => {
  const project = await fixture(context)
  await mkdir(path.join(project.root, "authors/part-02"))
  await mkdir(path.join(project.root, "authors/part-99"))
  await writeFile(path.join(project.root, "authors/part-99/palette.mjs"), 'export const color = "blue"')
  await writeFile(path.join(project.root, "authors/part-02/palette.mjs"), 'export const color = "red"')
  const server = await startServer({project: project.root, part: "part-01"})
  context.after(() => server.close())
  assert.equal((await fetch(`${server.origin}/authors/part-01/scene.mjs`)).status, 200)
  assert.equal((await fetch(`${server.origin}/authors/part-02/palette.mjs`)).status, 403)
  assert.equal((await fetch(`${server.origin}/project/authors/part-02/palette.mjs`)).status, 403)
  assert.equal((await fetch(`${server.origin}/authors/part-99/palette.mjs`)).status, 403)
  const full = await startServer({project: project.root})
  context.after(() => full.close())
  assert.equal((await fetch(`${full.origin}/authors/part-02/palette.mjs`)).status, 200)
  assert.equal((await fetch(`${full.origin}/authors/part-99/palette.mjs`)).status, 403)
})

test("render preflight verifies manifest bytes before creating output", async (context) => {
  const project = await fixture(context)
  await writeFile(path.join(project.root, "inputs/palette.txt"), "changed input")
  const output = path.join(project.parent, "output")
  await assert.rejects(
    execute(process.execPath, [path.join(tools, "render.mjs"), "--project", project.root, "--part", "part-01", "--frames-only", "--out", output]),
    (error) => error.code === 1 && /Input integrity mismatch: palette.txt/.test(error.stderr),
  )
  await assert.rejects(readFile(path.join(output, "render-metadata.json")), {code: "ENOENT"})
})

test("part preflight tolerates another unfinished author and fingerprints source changes", async (context) => {
  const project = await fixture(context)
  const output = path.join(project.parent, "part-01-output")
  await assert.rejects(
    execute(process.execPath, [
      path.join(tools, "render.mjs"),
      "--project",
      project.root,
      "--part",
      "part-01",
      "--frames-only",
      "--browser",
      path.join(project.parent, "missing-browser"),
      "--out",
      output,
    ]),
    (error) => error.code === 1 && /Browser executable does not exist/.test(error.stderr),
  )
  const metadata = JSON.parse(await readFile(path.join(output, "render-metadata.json"), "utf8"))
  assert.equal(metadata.status, "failed")
  assert.match(metadata.fingerprints.source, /^[a-f0-9]{64}$/)
  assert.equal(metadata.part, "part-01")
  await assert.rejects(readFile(path.join(output, ".render.lock")), {code: "ENOENT"})
  await writeFile(path.join(project.root, "authors/part-01/scene.mjs"), "export function createScene() { return { render() { return 1 } } }")
  const current = await fingerprintProject(await loadProject(project.root), "part-01")
  assert.notEqual(current.source, metadata.fingerprints.source)
  assert.equal(current.inputs, metadata.fingerprints.inputs)
  assert.equal(current.runtime, metadata.fingerprints.runtime)
})

test("preview seek keeps the outgoing scene opaque beneath a crossfade", async (context) => {
  const project = await fixture(context)
  const runtime = path.join(project.root, "runtime")
  await mkdir(runtime)
  for (const name of ["preview.mjs", "timeline.mjs"]) await writeFile(path.join(runtime, name), await readFile(path.join(tools, name)))
  await mkdir(path.join(project.root, "authors/part-02"))
  await writeFile(path.join(project.root, "authors/part-02/scene.mjs"), "export function createScene() { return {render() {}} }")
  const timing = timeline()
  timing.parts[0].endFrame = 130
  timing.parts.reverse()
  timing.transitions = [{type: "crossfade", from: "part-01", to: "part-02", start: 120, end: 130}]
  const elements = new Map()
  const element = () => ({
    style: {},
    dataset: {},
    value: "0",
    checked: false,
    clientWidth: 1920,
    clientHeight: 1080,
    children: [],
    append(child) {
      this.children.push(child)
    },
    addEventListener() {},
    setAttribute() {},
  })
  for (const id of ["stage", "viewport", "scrub", "status", "play", "reduced", "error"]) elements.set(id, element())
  const globals = {
    window: {},
    location: {search: "?capture=1"},
    document: {
      body: {classList: {add() {}}},
      head: element(),
      fonts: {ready: Promise.resolve(), load: async () => []},
      images: [],
      querySelector: (selector) => elements.get(selector.slice(1)),
      createElement: element,
    },
    fetch: async (url) => ({ok: true, json: async () => (url.includes("timeline") ? timing : {assets: []})}),
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
    addEventListener() {},
  }
  const saved = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true})
  context.after(() => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  await import(pathToFileURL(path.join(runtime, "preview.mjs")).href)
  await window.motionReady
  await window.seekFrame(125)
  const roots = elements.get("stage").children
  const outgoing = roots.find((root) => root.dataset.part === "part-01")
  const incoming = roots.find((root) => root.dataset.part === "part-02")
  assert.equal(outgoing.style.opacity, "1")
  assert.equal(incoming.style.opacity, "0.5")
  assert.ok(Number(incoming.style.zIndex) > Number(outgoing.style.zIndex))
  await window.seekFrame(130)
  assert.equal(outgoing.style.visibility, "hidden")
  assert.equal(incoming.style.opacity, "1")
})

function timeline(frames = 240) {
  const split = Math.floor(frames / 2)
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    durationFrames: frames,
    parts: [
      {id: "part-01", module: "authors/part-01/scene.mjs", startFrame: 0, endFrame: split},
      {id: "part-02", module: "authors/part-02/scene.mjs", startFrame: split, endFrame: frames},
    ],
  }
}

async function fixture(context) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "release-media-test-"))
  context.after(() => rm(parent, {recursive: true, force: true}))
  const root = path.join(parent, "clip")
  await Promise.all(["director", "inputs", "authors/part-01"].map((directory) => mkdir(path.join(root, directory), {recursive: true})))
  await writeFile(path.join(root, "director/timeline.json"), JSON.stringify(timeline()))
  const bytes = Buffer.from("a small local input")
  await writeFile(path.join(root, "inputs/palette.txt"), bytes)
  await writeFile(
    path.join(root, "inputs/manifest.json"),
    JSON.stringify({assets: [{id: "palette.txt", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")}]}),
  )
  await writeFile(path.join(root, "authors/part-01/scene.mjs"), "export function createScene() { return { render() {} } }")
  return {root, parent}
}
