import {readFile} from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import {fileURLToPath} from "node:url"

import {loadProject, parseFlags, runtimeRoot, scopedFile} from "./project.mjs"

/** An owned, loopback-only server. The caller must close it when finished. */
export async function startServer({project, part, port = 0} = {}) {
  const loaded = await loadProject(project)
  if (part && !loaded.timeline.parts.some((spec) => spec.id === part)) throw new Error(`Unknown part: ${part}`)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Port must be an integer in [0,65535].")
  const types = {
    ".html": "text/html; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405).end()
        return
      }
      if (req.headers.host !== `127.0.0.1:${server.address().port}`) {
        res.writeHead(403).end("Forbidden")
        return
      }
      let pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname)
      if (pathname === "/") pathname = "/runtime/index.html"
      let actual
      if (pathname.startsWith("/runtime/")) {
        const name = pathname.slice("/runtime/".length)
        if (!["index.html", "preview.mjs", "timeline.mjs"].includes(name)) {
          res.writeHead(403).end("Forbidden")
          return
        }
        actual = await scopedFile(runtimeRoot, name)
      } else {
        const relative = pathname.replace(/^\/project\//, "/").slice(1)
        const asset = relative.startsWith("inputs/") ? relative.slice(7) : null
        if (
          !(
            relative === "director/timeline.json" ||
            relative === "inputs/manifest.json" ||
            loaded.manifest.assets.some((item) => item.id === asset) ||
            loaded.timeline.parts.some((spec) => relative.startsWith(`authors/${spec.id}/`) && (!part || spec.id === part))
          )
        ) {
          res.writeHead(403).end("Forbidden")
          return
        }
        actual = await scopedFile(loaded.root, relative)
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(actual)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      })
      if (req.method === "HEAD") res.end()
      else res.end(await readFile(actual))
    } catch (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 400).end("Unavailable")
    }
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = parseFlags(process.argv.slice(2), ["--project", "--port"], ["--help"])
    if (flags.has("--help")) console.log("node scripts/release-media/server.mjs --project DIR [--port 0]")
    else {
      const instance = await startServer({project: flags.get("--project"), port: Number(flags.get("--port") ?? process.env.MOTION_PORT ?? 0)})
      console.log(instance.origin + "/runtime/index.html")
      const close = async () => {
        await instance.close()
        process.exit(0)
      }
      process.on("SIGINT", close)
      process.on("SIGTERM", close)
    }
  } catch (error) {
    console.error(error.stack)
    process.exitCode = 1
  }
}
