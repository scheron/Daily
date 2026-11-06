#!/usr/bin/env node
import {mkdir, readFile, symlink} from "node:fs/promises"
import path from "node:path"

import {createOutput, encode, frameRecord} from "./output.mjs"
import {fingerprintProject, loadProject, parseFlags} from "./project.mjs"

const args = process.argv.slice(2),
  parts = [],
  single = []
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--part-output") {
    const value = args[++index]
    if (!value || value.startsWith("--")) throw new Error("Missing value for --part-output")
    parts.push(path.resolve(value))
  } else single.push(args[index])
}
const flags = parseFlags(single, ["--project", "--out"], ["--help"])
if (flags.has("--help")) {
  console.log("node scripts/release-media/assemble.mjs --project DIR --part-output DIR01 --part-output DIR02 --out NEW_DIR")
  process.exit(0)
}
if (!flags.get("--out") || !flags.get("--project") || !parts.length) throw new Error("--project, --part-output, and --out are required.")
const output = path.resolve(flags.get("--out"))
const report = {
  schemaVersion: 1,
  status: "starting",
  pid: process.pid,
  startedAt: new Date().toISOString(),
  audio: "none",
  encoder: "libx264",
  partInputs: [],
  processes: [],
  outputs: [],
}
const emit = (event) => console.log(JSON.stringify(event))
let finalize
try {
  const project = await loadProject(flags.get("--project"))
  const {timeline} = project
  report.project = project.root
  Object.assign(report, {width: timeline.width, height: timeline.height, fps: timeline.fps, durationFrames: timeline.durationFrames})
  if (
    timeline.transitions.some((transition) => transition.type !== "cut") ||
    timeline.parts.some((part, index) => part.start !== (index ? timeline.parts[index - 1].end : 0))
  )
    throw new Error("Assembly from independent part frames requires contiguous hard cuts.")
  if (parts.length !== timeline.parts.length) throw new Error("Provide exactly one output directory per timeline part, in timeline order.")
  const fingerprints = {}
  for (let index = 0; index < parts.length; index++) {
    const spec = timeline.parts[index],
      directory = parts[index],
      metadata = JSON.parse(await readFile(path.join(directory, "render-metadata.json"), "utf8"))
    const expected = await fingerprintProject(project, spec.id)
    fingerprints[spec.id] = expected
    if (JSON.stringify(metadata.fingerprints) !== JSON.stringify(expected)) throw new Error(`Stale or mixed part fingerprints: ${spec.id}`)
    if (
      metadata.status !== "succeeded" ||
      metadata.exitCode !== 0 ||
      metadata.part !== spec.id ||
      metadata.renderedFrames !== spec.end - spec.start ||
      metadata.durationFrames !== spec.end - spec.start ||
      metadata.width !== timeline.width ||
      metadata.height !== timeline.height ||
      metadata.fps !== timeline.fps ||
      metadata.requestedFrames?.length !== spec.end - spec.start
    )
      throw new Error(`Part result does not match the timeline: ${directory}`)
    for (let frame = 0; frame < spec.end - spec.start; frame++) {
      const actual = await frameRecord(path.join(directory, "frames", `frame-${String(frame).padStart(6, "0")}.png`), timeline.width, timeline.height)
      if (JSON.stringify(actual) !== JSON.stringify(metadata.frames?.[frame])) throw new Error(`Frame integrity mismatch: ${spec.id} frame ${frame}`)
    }
    report.partInputs.push({id: spec.id, directory, fingerprints: expected, startedAt: metadata.startedAt, finishedAt: metadata.finishedAt})
  }
  finalize = await createOutput(output, "assembly", report)
  const frames = path.join(output, "frames")
  await mkdir(frames)
  for (let index = 0; index < parts.length; index++) {
    const spec = timeline.parts[index]
    for (let frame = 0; frame < spec.end - spec.start; frame++)
      await symlink(
        path.join(parts[index], "frames", `frame-${String(frame).padStart(6, "0")}.png`),
        path.join(frames, `frame-${String(spec.start + frame).padStart(6, "0")}.png`),
      )
  }
  report.status = "encoding"
  emit({event: "assembly-start", renderedFramesReused: timeline.durationFrames, formats: ["mp4", "gif"]})
  await encode(output, frames, timeline, report)
  const current = await loadProject(project.root)
  for (const spec of timeline.parts)
    if (JSON.stringify(await fingerprintProject(current, spec.id)) !== JSON.stringify(fingerprints[spec.id]))
      throw new Error("Project or runtime changed during assembly; render again.")
  report.status = "succeeded"
  report.exitCode = 0
} catch (error) {
  report.status = "failed"
  report.exitCode = 1
  report.error = error.stack
  process.exitCode = 1
  console.error(error.stack)
} finally {
  report.finishedAt = new Date().toISOString()
  if (finalize) await finalize()
  emit({
    event: "assembly-complete",
    status: report.status,
    exitCode: report.exitCode,
    metadata: finalize ? path.join(output, "assembly-metadata.json") : null,
  })
}
