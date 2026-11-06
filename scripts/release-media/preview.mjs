import {normalizeTimeline} from "./timeline.mjs"

const query = new URLSearchParams(location.search)
const capture = query.has("capture")
if (capture) document.body.classList.add("capture")
const stage = document.querySelector("#stage")
const viewport = document.querySelector("#viewport")
const scrub = document.querySelector("#scrub")
const status = document.querySelector("#status")
const playButton = document.querySelector("#play")
const reduced = document.querySelector("#reduced")
reduced.checked = !capture && matchMedia("(prefers-reduced-motion: reduce)").matches
let timeline,
  parts = [],
  frame = 0,
  duration = 0,
  playing = false,
  playbackOrigin = 0,
  playbackFrame = 0,
  raf
let preloadedImages = []
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

async function awaitAssets() {
  await document.fonts.ready
  await Promise.all(
    [...document.images].map(async (image) => {
      if (!image.complete)
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, {once: true})
          image.addEventListener("error", () => reject(new Error(`Image failed: ${image.src}`)), {once: true})
        })
      if (!image.naturalWidth) throw new Error(`Image failed: ${image.src}`)
      await image.decode()
    }),
  )
}

function fit() {
  const scale = capture ? 1 : Math.min(viewport.clientWidth / 1920, viewport.clientHeight / 1080)
  stage.style.transform = `translate(${capture ? 0 : (viewport.clientWidth - 1920 * scale) / 2}px,${capture ? 0 : (viewport.clientHeight - 1080 * scale) / 2}px) scale(${scale})`
}
addEventListener("resize", fit)

function draw(value) {
  if (!Number.isInteger(value) || value < 0 || value >= duration) throw new RangeError(`Frame must be integer in [0,${duration}).`)
  frame = value
  const globalFrame = query.get("part") ? value + parts[0].spec.start : value
  for (const part of parts) {
    const {spec, root, scene, context} = part
    const localFrame = globalFrame - spec.start
    let opacity = globalFrame >= spec.start && globalFrame < spec.end ? 1 : 0
    for (const transition of timeline.transitions) {
      if (transition.type === "crossfade" && globalFrame >= transition.start && globalFrame < transition.end) {
        const progress = (globalFrame - transition.start) / (transition.end - transition.start)
        if (spec.id === transition.from) opacity = 1
        if (spec.id === transition.to) opacity = progress
      }
    }
    root.style.opacity = String(opacity)
    root.style.visibility = opacity > 0 ? "visible" : "hidden"
    context.reducedMotion = reduced.checked
    scene.render(Math.max(0, Math.min(spec.end - spec.start - 1, localFrame)))
  }
  scrub.value = String(frame)
  status.value = `${frame + 1} / ${duration} · ${(frame / timeline.fps).toFixed(2)}s`
  window.motionFrame = frame
}

window.seekFrame = async (value) => {
  await window.motionReady
  draw(value)
  await awaitAssets()
  await nextPaint()
  return {frame, globalFrame: query.get("part") ? frame + parts[0].spec.start : frame}
}
window.setReducedMotion = async (value) => {
  reduced.checked = Boolean(value)
  await window.seekFrame(frame)
}
window.motionReady = (async () => {
  const response = await fetch("../director/timeline.json")
  if (!response.ok) throw new Error("Director timeline is not ready.")
  timeline = normalizeTimeline(await response.json())
  const manifestResponse = await fetch("../inputs/manifest.json")
  if (!manifestResponse.ok) throw new Error("Input manifest is unavailable.")
  const manifest = await manifestResponse.json()
  preloadedImages = (manifest.assets ?? [])
    .filter((asset) => /\.(png|jpe?g|webp)$/i.test(asset.id))
    .map((asset) => {
      const image = new Image()
      image.src = new URL("../inputs/" + asset.id, import.meta.url).href
      return image
    })
  await Promise.all(preloadedImages.map((image) => image.decode()))
  const fontStyle = document.createElement("style")
  fontStyle.textContent = [
    ["Rubik-Regular.ttf", 400],
    ["Rubik-SemiBold.ttf", 600],
  ]
    .filter(([id]) => manifest.assets.some((asset) => asset.id === id))
    .map(([id, weight]) => `@font-face{font-family:Rubik;src:url('/inputs/${id}') format('truetype');font-weight:${weight};font-display:block}`)
    .join("")
  document.head.append(fontStyle)
  await Promise.all([document.fonts.load("400 16px Rubik"), document.fonts.load("600 16px Rubik")])
  duration = timeline.durationFrames
  let specifications = timeline.parts
  if (query.get("part")) {
    specifications = specifications.filter((part) => part.id === query.get("part"))
    if (specifications.length !== 1) throw new Error(`Unknown part: ${query.get("part")}`)
    duration = specifications[0].end - specifications[0].start
  }
  for (const spec of specifications) {
    const root = document.createElement("div")
    root.className = "motion-part"
    root.style.zIndex = String(spec.start)
    root.dataset.part = spec.id
    stage.append(root)
    const context = {
      width: timeline.width,
      height: timeline.height,
      fps: timeline.fps,
      durationFrames: spec.end - spec.start,
      assetsBase: "../../inputs/",
      reducedMotion: reduced.checked,
      id: spec.id,
    }
    const module = await import(new URL("../" + spec.module, import.meta.url))
    const scene = await module.createScene(root, context)
    if (!scene || typeof scene.render !== "function") throw new Error(`${spec.id} does not provide render(localFrame).`)
    parts.push({spec, root, context, scene})
  }
  window.motionTimeline = timeline
  window.motionDurationFrames = duration
  scrub.max = String(duration - 1)
  draw(0)
  fit()
  await awaitAssets()
  await nextPaint()
  return {width: timeline.width, height: timeline.height, fps: timeline.fps, durationFrames: duration, part: query.get("part")}
})()
window.motionReady.catch((error) => {
  const box = document.querySelector("#error")
  box.textContent = error.stack
  box.style.display = "block"
  status.value = "Preview unavailable"
  console.error(error)
})

function pause() {
  playing = false
  cancelAnimationFrame(raf)
  playButton.textContent = "Play"
  playButton.setAttribute("aria-label", "Play preview")
}
function tick(now) {
  if (!playing) return
  draw((playbackFrame + Math.floor(((now - playbackOrigin) * timeline.fps) / 1000)) % duration)
  raf = requestAnimationFrame(tick)
}
playButton.addEventListener("click", async () => {
  await window.motionReady
  if (playing) {
    pause()
    return
  }
  playing = true
  playbackFrame = frame
  playbackOrigin = performance.now()
  playButton.textContent = "Pause"
  playButton.setAttribute("aria-label", "Pause preview")
  raf = requestAnimationFrame(tick)
})
scrub.addEventListener("input", () => {
  pause()
  window.seekFrame(Number(scrub.value))
})
reduced.addEventListener("change", () => {
  pause()
  window.seekFrame(frame)
})
addEventListener("pagehide", () => {
  pause()
  for (const part of parts) part.scene.destroy?.()
})
