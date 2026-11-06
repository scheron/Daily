# Release media runtime

Reusable local capture and assembly tools promoted from the approved Daily 0.38.3 project emoji motion runtime. Each release gets its own story, director timeline, inputs, and scene modules. The runtime supplies deterministic capture and encoding; it does not generate a creative template or publish anything.

Use an installed `agent-motion` skill when available to direct and author a fresh feature story. That skill is optional; these tools do not install skills, packages, browsers, or other dependencies.

## Prerequisites

Use the repository's supported Node version and installed workspace dependencies, including the declared Playwright development dependency. Have a compatible Chromium browser already installed through Playwright, or set `MOTION_BROWSER=/absolute/path/to/browser` (also accepted as `render.mjs --browser PATH`). Have `ffmpeg` on `PATH`, or set `MOTION_FFMPEG=/absolute/path/to/ffmpeg`.

Every render launches and closes its own headless browser and loopback HTTP server. It does not attach to a personal browser session. Browser requests outside that server are blocked. Chromium reports its actual GPU configuration in metadata; PNG capture makes no GPU acceleration guarantee. MP4 encoding uses CPU `libx264`.

## Project contract

```text
clip/
  director/timeline.json
  inputs/manifest.json
  inputs/asset.png
  authors/part-01/scene.mjs
  authors/part-02/scene.mjs
```

A minimal director timeline:

```json
{
  "schemaVersion": 1,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "durationFrames": 240,
  "parts": [
    {"id": "part-01", "module": "authors/part-01/scene.mjs", "startFrame": 0, "endFrame": 120},
    {"id": "part-02", "module": "authors/part-02/scene.mjs", "startFrame": 120, "endFrame": 240}
  ]
}
```

The canvas is 1920 × 1080 at 30 fps. Total duration is an integer from 240 to 450 frames (8–15 seconds). Intervals are `[startFrame, endFrame)`. Parts must cover the entire timeline, with unique `part-NN` identifiers. Overlaps require an explicit `transitions` entry with `type: "crossfade"`, `from`, `to`, `start`, and `end` exactly matching the overlap. Independent part assembly requires contiguous hard cuts in timeline order. Explicit `cut` transitions are allowed.

Each asset in `inputs/manifest.json` has a relative `id`, SHA-256 `sha256`, and integer `bytes` count:

```json
{"assets": [{"id": "asset.png", "sha256": "<64 lowercase hexadecimal characters>", "bytes": 12345}]}
```

The tools use `inputs/<id>` rather than absolute provenance paths in a manifest. Every declared asset is verified before preview, capture, or assembly. Only listed inputs are served. Images are decoded before capture; existing `Rubik-Regular.ttf` and `Rubik-SemiBold.ttf` assets are registered and loaded automatically. Author other local fonts in scene CSS when needed. Remote assets are unsupported.

A scene module exports `createScene(root, context)` and returns `{render(localFrame), destroy?()}`. Creation can be asynchronous. The context contains `width`, `height`, `fps`, the part's `durationFrames`, `assetsBase: "../../inputs/"`, `reducedMotion`, and `id`. Resolve assets with `new URL("../../inputs/asset.png", import.meta.url)`. The root fills the canvas.

Keep scene source and its local helper modules inside its own `authors/part-NN/` directory. Keep immutable assets in the manifest. Source fingerprints cover all files inside each selected author directory; part captures reject source requests into other author directories. Cross-part source imports are unsupported. Each `render()` call must completely establish the visual state for that local frame, including backwards and arbitrary seeking. Use frame-derived values rather than wall-clock timers or unseeded randomness. Respect `context.reducedMotion` with semantic still states and instant replacements. Runtime CSS disables transitions and animations during deterministic rendering.

## Preview and capture

Run commands from the repository root. Projects and output directories can live outside the repository. Output directories must be new and their parents must already exist.

```bash
node scripts/release-media/server.mjs --project /absolute/path/to/clip
node scripts/release-media/render.mjs --project /absolute/path/to/clip --out /absolute/path/to/new-output
```

The server prints its loopback preview URL. Optional `--port N` or `MOTION_PORT` chooses a port; the default selects an available port. Preview provides play/pause, frame scrubbing, and reduced motion. Initial reduced motion follows the operating system preference. Capture hides all controls.

Full capture writes `frames/frame-000000.png` onward, `motion.mp4`, `motion.gif`, and `render-metadata.json`. The GIF is 960 × 540 at 15 fps and loops indefinitely. Its frame count is derived from the project duration (rounded up when the source frame count is odd). MP4 uses the full source frame count and no audio.

For parallel author work, capture each completed part separately. Another author's scene need not exist yet:

```bash
node scripts/release-media/render.mjs --project /absolute/path/to/clip --part part-01 --frames-only --out /absolute/path/to/new-part-01
node scripts/release-media/render.mjs --project /absolute/path/to/clip --part part-02 --frames-only --out /absolute/path/to/new-part-02
node scripts/release-media/assemble.mjs --project /absolute/path/to/clip --part-output /absolute/path/to/new-part-01 --part-output /absolute/path/to/new-part-02 --out /absolute/path/to/new-assembly
```

Part frames start at zero locally. `--frames-only` skips encoding; without it a part capture writes `part-NN.mp4`. `--frames 0,29,119` captures only those unique local frames for a part, or global frames without `--part`, and always skips encoding. Such incomplete frame sets cannot be assembled. `--workers 1|2` chooses browser pages within the same dedicated browser; the default is one, and two require at least 12 GiB total host memory.

## Integrity and verification

The renderer writes actual frame progress as JSON lines, a final status, exit code, elapsed time, browser version, host details, process results, file sizes, and frame SHA-256 records. A new output directory and an exclusive lock prevent accidental reuse. The lock is removed after normal success or failure; an interrupted run can retain it. Inspect interrupted outputs and choose a new directory for the next run.

Part metadata fingerprints the raw director timeline, verified input manifest and assets, selected author's source files, and runtime source. Assembly recomputes fingerprints against the current project and rejects stale or mixed results before encoding. It also checks frame dimensions, SHA-256 values, completeness, and successful render status. Source and input changes during rendering or assembly cause failure. Other unfinished author directories do not affect a selected part's fingerprint.

Assembly reuses part PNGs with symlinks, so preserve the part output directories while retaining the assembled frames. The encoded MP4 and GIF are standalone. Encoding checks child exit status and validates nonempty file signatures. A failed command exits nonzero and preserves available failure metadata. Review metadata and inspect the actual encoded media, including first/last frames, seams, loop, captions, reduced motion, and playback timing before choosing release media. Encoding success alone does not establish visual quality or publication approval.

Run the focused public-boundary checks without launching a browser or encoding media:

```bash
pnpm test:release-media
```

They cover duration bounds, timeline coverage, duplicate identifiers, explicit overlap semantics, server scope, input integrity, unfinished author isolation, and source fingerprint changes. Actual browser capture and MP4/GIF playback are separate integration checks.
