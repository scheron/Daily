import {spawn} from "node:child_process"
import {createHash} from "node:crypto"
import {mkdir, open, readFile, stat, unlink, writeFile} from "node:fs/promises"
import path from "node:path"

export async function createOutput(output, kind, report) {
  await mkdir(output, {recursive: false})
  const lockPath = path.join(output, `.${kind}.lock`)
  const lock = await open(lockPath, "wx")
  await lock.writeFile(JSON.stringify({pid: process.pid, startedAt: report.startedAt}))
  await lock.close()
  return async () => {
    await writeFile(path.join(output, `${kind}-metadata.json`), JSON.stringify(report, null, 2) + "\n")
    await unlink(lockPath)
  }
}

export async function frameRecord(file, width, height) {
  const bytes = await readFile(file)
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(16) !== width ||
    bytes.readUInt32BE(20) !== height
  )
    throw new Error(`Invalid PNG frame: ${file}`)
  return {bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")}
}

export async function encode(output, frames, timeline, report, {part} = {}) {
  const ffmpeg = process.env.MOTION_FFMPEG || "ffmpeg"
  const total = part ? part.end - part.start : timeline.durationFrames
  const input = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-n",
    "-framerate",
    String(timeline.fps),
    "-start_number",
    "0",
    "-i",
    path.join(frames, "frame-%06d.png"),
  ]
  const mp4 = path.join(output, part ? `${part.id}.mp4` : "motion.mp4")
  await run(
    ffmpeg,
    [
      ...input,
      "-an",
      "-frames:v",
      String(total),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    report,
  )
  await recordOutput(mp4, "mp4", report)
  if (!part) {
    const gif = path.join(output, "motion.gif")
    await run(
      ffmpeg,
      [
        ...input,
        "-filter_complex",
        "[0:v]fps=15,scale=960:540:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
        "-frames:v",
        String(Math.ceil((total * 15) / timeline.fps)),
        "-an",
        "-loop",
        "0",
        gif,
      ],
      report,
    )
    await recordOutput(gif, "gif", report)
  }
}

async function recordOutput(file, format, report) {
  const info = await stat(file)
  const handle = await open(file, "r")
  const header = Buffer.alloc(12)
  try {
    await handle.read(header, 0, 12, 0)
  } finally {
    await handle.close()
  }
  if (
    !info.isFile() ||
    !info.size ||
    (format === "gif" ? !["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString()) : header.subarray(4, 8).toString() !== "ftyp")
  )
    throw new Error(`Invalid ${format} output: ${file}`)
  report.outputs.push({format, path: file, bytes: info.size})
}

async function run(command, args, report) {
  const entry = {command, args, startedAt: new Date().toISOString()}
  report.processes ??= []
  report.processes.push(entry)
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ["ignore", "ignore", "pipe"]})
    entry.pid = child.pid
    let tail = ""
    child.stderr.on("data", (chunk) => {
      tail = (tail + String(chunk)).slice(-10000)
    })
    child.once("error", (error) => {
      entry.error = error.message
      reject(error)
    })
    child.once("close", (code, signal) => {
      Object.assign(entry, {exitCode: code, signal, finishedAt: new Date().toISOString()})
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(command)} exited ${code}: ${tail}`))
    })
  })
}
