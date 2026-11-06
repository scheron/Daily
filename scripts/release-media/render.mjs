#!/usr/bin/env node
import {existsSync} from "node:fs"
import {mkdir} from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {createOutput, encode, frameRecord} from "./output.mjs"
import {fingerprintProject, loadProject, parseFlags} from "./project.mjs"
import {startServer} from "./server.mjs"

const flags = parseFlags(process.argv.slice(2), ["--project", "--out", "--part", "--workers", "--frames", "--browser"], ["--frames-only", "--help"])
if (flags.has("--help")) {
  console.log(
    "node scripts/release-media/render.mjs --project DIR --out NEW_DIR [--part part-01] [--workers 1|2] [--frames-only] [--frames 0,89,179] [--browser PATH]\nFrames are local to --part, otherwise global. Full renders encode motion.mp4 and motion.gif; partial renders encode part-NN.mp4 only. Explicit frame selections never encode. Existing frame output is refused.",
  )
  process.exit(0)
}
if (!flags.get("--project")) throw new Error("--project is required.")
if (!flags.get("--out")) throw new Error("--out is required.")
const output = path.resolve(flags.get("--out"))
const partId = flags.get("--part")
const workers = Number(flags.get("--workers") ?? 1)
if (![1, 2].includes(workers)) throw new Error("--workers must be 1 or 2.")
if (workers === 2 && os.totalmem() < 12 * 1024 ** 3) throw new Error("Two page workers require at least 12 GiB total system memory.")
const started = new Date()
const report = {
  schemaVersion: 1,
  status: "starting",
  pid: process.pid,
  startedAt: started.toISOString(),
  part: partId ?? null,
  workers,
  host: {memoryBytes: os.totalmem(), freeBytesAtStart: os.freemem(), logicalCpus: os.cpus().length},
  encoder: "libx264",
  audio: "none",
  outputs: [],
}
let server,
  browser,
  finalize,
  done = 0
const emit = (event) => console.log(JSON.stringify(event))

try {
  const project = await loadProject(flags.get("--project"))
  const {timeline} = project
  report.project = project.root
  report.fingerprints = await fingerprintProject(project, partId)
  const selected = partId ? timeline.parts.find((part) => part.id === partId) : null
  if (partId && !selected) throw new Error(`Unknown part: ${partId}`)
  const total = selected ? selected.end - selected.start : timeline.durationFrames
  let frames = Array.from({length: total}, (_, index) => index)
  if (flags.has("--frames")) {
    frames = flags.get("--frames").split(",").map(Number)
    if (!frames.length || new Set(frames).size !== frames.length || frames.some((frame) => !Number.isInteger(frame) || frame < 0 || frame >= total))
      throw new Error(`--frames must contain unique integers in [0,${total}).`)
  }
  report.width = timeline.width
  report.height = timeline.height
  report.fps = timeline.fps
  report.durationFrames = total
  report.requestedFrames = frames
  finalize = await createOutput(output, "render", report)
  const frameDir = path.join(output, "frames")
  await mkdir(frameDir)
  server = await startServer({project: project.root, part: partId})
  const playwright = {chromium: (await import("playwright")).chromium, module: "playwright"}
  report.playwrightModule = playwright.module
  const browserPath = executable()
  report.browserExecutable = browserPath ?? "Playwright managed browser"
  browser = await playwright.chromium.launch({
    headless: true,
    ...(browserPath ? {executablePath: browserPath} : {}),
    args: ["--no-first-run", "--no-default-browser-check"],
  })
  report.browserVersion = browser.version()
  try {
    const session = await browser.newBrowserCDPSession()
    const info = await session.send("SystemInfo.getInfo")
    report.gpu = {devices: info.gpu.devices, featureStatus: info.gpu.featureStatus}
    await session.detach()
  } catch (error) {
    report.gpu = {inspectionError: String(error.message)}
  }
  const context = await browser.newContext({
    viewport: {width: timeline.width, height: timeline.height},
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  })
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === server.origin ? route.continue() : route.abort("blockedbyclient"),
  )
  const failures = []
  const pages = await Promise.all(
    Array.from({length: Math.min(workers, frames.length)}, async () => {
      const page = await context.newPage()
      page.on("pageerror", (error) => failures.push(error.message))
      page.on("requestfailed", (request) => failures.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`))
      page.on("response", (response) => {
        if (response.status() >= 400) failures.push(`HTTP ${response.status()}: ${response.url()}`)
      })
      const url = new URL("/runtime/index.html", server.origin)
      url.searchParams.set("capture", "1")
      if (partId) url.searchParams.set("part", partId)
      await page.goto(url.href, {waitUntil: "load"})
      await page.evaluate(() => window.motionReady)
      return page
    }),
  )
  if (failures.length) throw new Error(failures.join("\n"))
  report.frames = {}
  report.status = "rendering"
  emit({
    event: "render-start",
    part: partId ?? null,
    total: frames.length,
    workers: pages.length,
    width: timeline.width,
    height: timeline.height,
    fps: timeline.fps,
  })
  const renderStart = performance.now()
  let cursor = 0
  await Promise.all(
    pages.map(async (page) => {
      while (cursor < frames.length) {
        const value = frames[cursor++]
        await page.evaluate((value) => window.seekFrame(value), value)
        if (failures.length) throw new Error(failures.join("\n"))
        await page.screenshot({
          path: path.join(frameDir, `frame-${String(value).padStart(6, "0")}.png`),
          type: "png",
          animations: "disabled",
          omitBackground: false,
          clip: {x: 0, y: 0, width: timeline.width, height: timeline.height},
        })
        report.frames[value] = await frameRecord(path.join(frameDir, `frame-${String(value).padStart(6, "0")}.png`), timeline.width, timeline.height)
        done++
        if (done % 30 === 0 || done === frames.length)
          emit({event: "render-progress", done, total: frames.length, elapsedSeconds: Number(((performance.now() - renderStart) / 1000).toFixed(3))})
      }
    }),
  )
  report.renderSeconds = (performance.now() - renderStart) / 1000
  report.renderedFrames = done
  await browser.close()
  browser = null
  await server.close()
  server = null
  if (!flags.has("--frames-only") && !flags.has("--frames")) {
    report.status = "encoding"
    emit({event: "encode-start", formats: partId ? ["mp4"] : ["mp4", "gif"]})
    await encode(output, frameDir, timeline, report, {part: selected})
  }
  const current = await fingerprintProject(await loadProject(project.root), partId)
  if (JSON.stringify(current) !== JSON.stringify(report.fingerprints)) throw new Error("Project or runtime changed during rendering; render again.")
  report.status = "succeeded"
  report.exitCode = 0
} catch (error) {
  report.status = "failed"
  report.exitCode = 1
  report.error = error.stack
  report.renderedFrames = done
  process.exitCode = 1
  console.error(error.stack)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server) await server.close().catch(() => {})
  report.finishedAt = new Date().toISOString()
  report.elapsedSeconds = (Date.now() - started.getTime()) / 1000
  if (finalize) await finalize()
  emit({
    event: "render-complete",
    status: report.status,
    exitCode: report.exitCode,
    renderedFrames: done,
    metadata: finalize ? path.join(output, "render-metadata.json") : null,
  })
}

function executable() {
  const explicit = flags.get("--browser") ?? process.env.MOTION_BROWSER
  if (explicit && !existsSync(explicit)) throw new Error(`Browser executable does not exist: ${explicit}`)
  return explicit
}
