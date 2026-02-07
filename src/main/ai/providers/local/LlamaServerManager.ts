import {execFile, spawn} from "node:child_process"
import {createWriteStream} from "node:fs"
import {chmod, rename, unlink} from "node:fs/promises"
import {createServer} from "node:net"
import path from "node:path"
import {Readable} from "node:stream"
import {pipeline} from "node:stream/promises"
import {promisify} from "node:util"
import fs from "fs-extra"

import {LogContext, logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {SERVER_BINARY} from "./manifest"

import type {LocalModelId, LocalRuntimeState} from "@shared/types/ai"
import type {ChildProcess} from "node:child_process"
import type {ModelManifestEntry} from "./manifest"

const execFileAsync = promisify(execFile)

/**
 * Manages the llama-server subprocess.
 *
 * Handles binary download/extraction, spawning, health checks,
 * and graceful shutdown.
 */
export class LlamaServerManager {
  private process: ChildProcess | null = null
  private port: number | null = null
  private currentModelId: LocalModelId | null = null
  private state: LocalRuntimeState = {status: "not_installed"}
  private onStateChange: ((state: LocalRuntimeState) => void) | null = null

  constructor(onStateChange?: (state: LocalRuntimeState) => void) {
    this.onStateChange = onStateChange ?? null
  }

  private setState(state: LocalRuntimeState) {
    this.state = state
    this.onStateChange?.(state)
  }

  getState(): LocalRuntimeState {
    return this.state
  }

  getPort(): number | null {
    return this.port
  }

  getCurrentModelId(): LocalModelId | null {
    return this.currentModelId
  }

  isRunning(): boolean {
    return this.process !== null && this.state.status === "running"
  }

  private getBinaryPath(): string {
    return path.join(fsPaths.binPath(), "llama-server")
  }

  async isBinaryInstalled(): Promise<boolean> {
    return fs.pathExists(this.getBinaryPath())
  }

  private async isCorrectVersion(): Promise<boolean> {
    try {
      const {stdout, stderr} = await execFileAsync(this.getBinaryPath(), ["--version"])
      const output = stdout + stderr
      // llama-server outputs version to stderr; manifest uses "b5200", binary outputs "5200"
      const numericVersion = SERVER_BINARY.version.replace(/^b/, "")
      return output.includes(SERVER_BINARY.version) || output.includes(numericVersion)
    } catch {
      return false
    }
  }

  async ensureBinary(): Promise<void> {
    if (await this.isBinaryInstalled()) {
      if (await this.isCorrectVersion()) return

      // Version mismatch — remove old binary and re-download
      logger.info(LogContext.AI, "llama-server version mismatch, updating binary")
      try {
        await fs.remove(fsPaths.binPath())
      } catch {
        // ignore
      }
    }

    logger.info(LogContext.AI, "Downloading llama-server binary")

    const arch = process.arch as "arm64" | "x64"
    const binaryInfo = SERVER_BINARY.macos[arch]
    if (!binaryInfo) {
      throw new Error(`Unsupported architecture: ${arch}`)
    }

    await fs.ensureDir(fsPaths.binPath())

    const zipPath = path.join(fsPaths.binPath(), "llama-server.zip")

    // Download the zip
    const response = await fetch(binaryInfo.url, {redirect: "follow"})
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download llama-server: HTTP ${response.status}`)
    }

    const nodeStream = Readable.fromWeb(response.body as any)
    const writeStream = createWriteStream(zipPath)
    await pipeline(nodeStream, writeStream)

    // Extract llama-server from zip using macOS built-in unzip
    const extractDir = path.join(fsPaths.binPath(), "_extract")
    await fs.ensureDir(extractDir)

    try {
      await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir])

      // Find the directory containing llama-server (includes required .dylib files)
      const {stdout} = await execFileAsync("find", [extractDir, "-name", "llama-server", "-type", "f"])
      const binarySource = stdout.trim().split("\n")[0]

      if (!binarySource) {
        throw new Error("llama-server binary not found in zip archive")
      }

      // Move all files from the same directory (binary + dylibs + metal shaders)
      const sourceDir = path.dirname(binarySource)
      const {readdir} = await import("node:fs/promises")
      const files = await readdir(sourceDir)

      for (const file of files) {
        const src = path.join(sourceDir, file)
        const dest = path.join(fsPaths.binPath(), file)
        await rename(src, dest)
      }
    } finally {
      // Clean up
      try {
        await fs.remove(extractDir)
      } catch {
        // ignore
      }
      try {
        await unlink(zipPath)
      } catch {
        // ignore
      }
    }

    // Make executable and remove macOS quarantine from all extracted files
    await chmod(this.getBinaryPath(), 0o755)
    try {
      await execFileAsync("xattr", ["-dr", "com.apple.quarantine", fsPaths.binPath()])
    } catch {
      // xattr may fail if attribute doesn't exist — safe to ignore
    }
    try {
      await execFileAsync("xattr", ["-dr", "com.apple.provenance", fsPaths.binPath()])
    } catch {
      // safe to ignore
    }

    logger.info(LogContext.AI, "llama-server binary installed")
  }

  async start(modelPath: string, modelId: LocalModelId, params: ModelManifestEntry["serverArgs"]): Promise<void> {
    // Stop existing process if running
    if (this.process) {
      await this.stop()
    }

    this.setState({status: "starting", modelId})

    try {
      // Find a free port
      this.port = await this.findFreePort()

      const args = [
        "--model",
        modelPath,
        "--port",
        String(this.port),
        "--ctx-size",
        String(params.ctx),
        "--n-gpu-layers",
        String(params.gpuLayers),
        "--host",
        "127.0.0.1",
        "--jinja",
        "--flash-attn",
        "--cont-batching",
        "--mlock",
        "--no-warmup",
        "--cache-reuse",
        "256",
      ]

      logger.info(LogContext.AI, "Starting llama-server", {port: this.port, modelPath, args})

      this.process = spawn(this.getBinaryPath(), args, {
        stdio: ["ignore", "pipe", "pipe"],
      })

      this.currentModelId = modelId

      this.process.on("exit", (code, signal) => {
        logger.info(LogContext.AI, "llama-server exited", {code, signal})
        this.process = null
        this.port = null
        // Only set error if we didn't intentionally stop
        if (this.state.status === "running" || this.state.status === "starting") {
          this.setState({status: "error", modelId, message: `Server exited unexpectedly (code: ${code})`})
        }
      })

      this.process.on("error", (err) => {
        logger.error(LogContext.AI, "llama-server error", err)
        this.process = null
        this.port = null
        this.setState({status: "error", modelId, message: err.message})
      })

      // Capture stderr for debugging
      this.process.stderr?.on("data", (data: Buffer) => {
        logger.debug(LogContext.AI, `llama-server stderr: ${data.toString().trim()}`)
      })

      // Wait for server to be ready
      await this.waitForReady()

      this.setState({
        status: "running",
        modelId,
        port: this.port,
        pid: this.process?.pid,
      })

      logger.info(LogContext.AI, "llama-server is ready", {port: this.port, pid: this.process?.pid})
    } catch (err) {
      await this.stop()
      this.setState({
        status: "error",
        modelId,
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return

    const proc = this.process
    this.process = null

    logger.info(LogContext.AI, "Stopping llama-server")

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill("SIGKILL")
        } catch {
          // ignore
        }
        resolve()
      }, 5000)

      proc.on("exit", () => {
        clearTimeout(timeout)
        resolve()
      })

      try {
        proc.kill("SIGTERM")
      } catch {
        clearTimeout(timeout)
        resolve()
      }
    }).then(() => {
      this.port = null
      const modelId = this.currentModelId
      this.currentModelId = null
      if (modelId) {
        this.setState({status: "installed", modelId})
      } else {
        this.setState({status: "not_installed"})
      }
    })
  }

  private async waitForReady(timeoutMs = 60000): Promise<void> {
    const startTime = Date.now()
    const pollInterval = 500

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/health`, {
          signal: AbortSignal.timeout(2000),
        })

        if (response.ok) {
          const data = (await response.json()) as {status?: string}
          if (data.status === "ok" || data.status === "no slot available") {
            return
          }
        }
      } catch {
        // Server not ready yet
      }

      // Check if process died while waiting
      if (!this.process) {
        throw new Error("llama-server process exited during startup")
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new Error(`llama-server failed to start within ${timeoutMs / 1000}s`)
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.listen(0, "127.0.0.1", () => {
        const address = server.address()
        if (!address || typeof address === "string") {
          server.close()
          reject(new Error("Failed to find free port"))
          return
        }
        const port = address.port
        server.close(() => resolve(port))
      })
      server.on("error", reject)
    })
  }
}
