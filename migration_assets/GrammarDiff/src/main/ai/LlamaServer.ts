import {execFile, spawn} from "node:child_process"
import {createHash} from "node:crypto"
import {createReadStream, createWriteStream} from "node:fs"
import {chmod, readdir, rename, unlink} from "node:fs/promises"
import {createServer} from "node:net"
import path from "node:path"
import {Readable} from "node:stream"
import {pipeline} from "node:stream/promises"
import {promisify} from "node:util"
import fs from "fs-extra"

import {logger} from "@/utils/logger"

import {APP_CONFIG, fsPaths} from "@/config"
import {SERVER_BINARY} from "./manifest"

import type {ModelId, RuntimeState} from "@shared/types/ai"
import type {ChildProcess} from "node:child_process"
import type {ModelManifestEntry} from "./types"

const execFileAsync = promisify(execFile)

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  await pipeline(createReadStream(filePath), hash)
  return hash.digest("hex")
}

export type LlamaServerOptions = {
  binDir?: string
  onStateChange?: (state: RuntimeState) => void
}

/**
 * Wraps the llama-server subprocess: binary install, spawn, /health poll, graceful stop.
 * Phase 2 lands the lifecycle but never calls start() — that arrives in phase 3.
 */
export class LlamaServer {
  private readonly resolveBinDir: () => string
  private readonly onStateChange: ((state: RuntimeState) => void) | null
  private process: ChildProcess | null = null
  private port: number | null = null
  private currentModelId: ModelId | null = null
  private state: RuntimeState = {status: "not_installed"}

  constructor(opts: LlamaServerOptions = {}) {
    const {binDir} = opts
    this.resolveBinDir = binDir ? () => binDir : () => fsPaths.binPath()
    this.onStateChange = opts.onStateChange ?? null
  }

  private get binDir(): string {
    return this.resolveBinDir()
  }

  private setState(state: RuntimeState): void {
    this.state = state
    this.onStateChange?.(state)
  }

  getState(): RuntimeState {
    return this.state
  }

  getPort(): number | null {
    return this.port
  }

  getCurrentModelId(): ModelId | null {
    return this.currentModelId
  }

  isRunning(): boolean {
    return this.process !== null && this.state.status === "running"
  }

  private getBinaryPath(): string {
    return path.join(this.binDir, "llama-server")
  }

  async isBinaryInstalled(): Promise<boolean> {
    return fs.pathExists(this.getBinaryPath())
  }

  private async isCorrectVersion(): Promise<boolean> {
    try {
      const {stdout, stderr} = await execFileAsync(this.getBinaryPath(), ["--version"])
      const output = stdout + stderr
      const numeric = SERVER_BINARY.version.replace(/^b/, "")
      return output.includes(SERVER_BINARY.version) || output.includes(numeric)
    } catch {
      return false
    }
  }

  async ensureBinary(): Promise<void> {
    if (await this.isBinaryInstalled()) {
      if (await this.isCorrectVersion()) return
      logger.info(logger.CONTEXT.AI, "llama-server version mismatch, reinstalling")
      try {
        await fs.remove(this.binDir)
      } catch {
        void 0
      }
    }

    const arch = process.arch as "arm64" | "x64"
    const binaryInfo = SERVER_BINARY.macos[arch]
    if (!binaryInfo) throw new Error(`Unsupported architecture: ${arch}`)

    logger.info(logger.CONTEXT.AI, "Downloading llama-server binary", {arch})

    await fs.ensureDir(this.binDir)
    const archivePath = path.join(this.binDir, "llama-server.tar.gz")

    const response = await fetch(binaryInfo.url, {redirect: "follow"})
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download llama-server: HTTP ${response.status}`)
    }

    const nodeStream = Readable.fromWeb(response.body as any)
    const writeStream = createWriteStream(archivePath)
    await pipeline(nodeStream, writeStream)

    const actual = await sha256File(archivePath)
    if (actual !== binaryInfo.sha256) {
      await unlink(archivePath).catch(() => {})
      throw new Error(`llama-server checksum mismatch: expected ${binaryInfo.sha256}, got ${actual}`)
    }

    const extractDir = path.join(this.binDir, "_extract")
    await fs.ensureDir(extractDir)

    try {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir])

      const {stdout} = await execFileAsync("find", [extractDir, "-name", "llama-server", "-type", "f"])
      const binarySource = stdout.trim().split("\n")[0]
      if (!binarySource) throw new Error("llama-server binary not found in archive")

      const sourceDir = path.dirname(binarySource)
      const files = await readdir(sourceDir)
      for (const file of files) {
        await rename(path.join(sourceDir, file), path.join(this.binDir, file))
      }
    } finally {
      try {
        await fs.remove(extractDir)
      } catch {
        void 0
      }
      try {
        await unlink(archivePath)
      } catch {
        void 0
      }
    }

    await chmod(this.getBinaryPath(), 0o755)
    try {
      await execFileAsync("xattr", ["-dr", "com.apple.quarantine", this.binDir])
    } catch {
      void 0
    }
    try {
      await execFileAsync("xattr", ["-dr", "com.apple.provenance", this.binDir])
    } catch {
      void 0
    }

    logger.info(logger.CONTEXT.AI, "llama-server binary installed")
  }

  async start(modelPath: string, modelId: ModelId, params: ModelManifestEntry["serverArgs"]): Promise<void> {
    if (this.process) await this.stop()

    this.setState({status: "starting", modelId})

    try {
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
        APP_CONFIG.ai.runtime.local.host,
        "--jinja",
        "--flash-attn",
        "on",
        "--cont-batching",
        "--mlock",
        "--no-warmup",
        "--cache-reuse",
        "256",
      ]

      logger.info(logger.CONTEXT.AI, "Starting llama-server", {port: this.port, modelPath})

      this.process = spawn(this.getBinaryPath(), args, {stdio: ["ignore", "pipe", "pipe"]})
      this.currentModelId = modelId

      this.process.on("exit", (code, signal) => {
        logger.info(logger.CONTEXT.AI, "llama-server exited", {code, signal})
        this.process = null
        this.port = null
        if (this.state.status === "running" || this.state.status === "starting") {
          this.setState({status: "error", modelId, message: `Server exited unexpectedly (code: ${code})`})
        }
      })

      this.process.on("error", (err) => {
        logger.error(logger.CONTEXT.AI, "llama-server error", err)
        this.process = null
        this.port = null
        this.setState({status: "error", modelId, message: err.message})
      })

      this.process.stderr?.on("data", (data: Buffer) => {
        logger.debug(logger.CONTEXT.AI, `llama-server stderr: ${data.toString().trim()}`)
      })

      await this.waitForReady()

      this.setState({status: "running", modelId, port: this.port, pid: this.process?.pid})
      logger.info(logger.CONTEXT.AI, "llama-server is ready", {port: this.port, pid: this.process?.pid})
    } catch (err) {
      this.setState({status: "error", modelId, message: err instanceof Error ? err.message : String(err)})
      await this.stop()
      throw err
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return
    const proc = this.process
    this.process = null

    logger.info(logger.CONTEXT.AI, "Stopping llama-server")

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill("SIGKILL")
        } catch {
          void 0
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
    })

    this.port = null
    const modelId = this.currentModelId
    this.currentModelId = null
    if (this.state.status === "error") return
    if (modelId) this.setState({status: "installed", modelId})
    else this.setState({status: "not_installed"})
  }

  async unload(): Promise<void> {
    await this.stop()
    this.currentModelId = null
    this.setState({status: "not_installed"})
  }

  private async waitForReady(timeoutMs = 60_000): Promise<void> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://${APP_CONFIG.ai.runtime.local.host}:${this.port}/health`, {
          signal: AbortSignal.timeout(2000),
        })
        if (response.ok) {
          const data = (await response.json()) as {status?: string}
          if (data.status === "ok" || data.status === "no slot available") return
        }
      } catch {
        void 0
      }
      if (!this.process) throw new Error("llama-server process exited during startup")
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`llama-server failed to start within ${timeoutMs / 1000}s`)
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.listen(0, APP_CONFIG.ai.runtime.local.host, () => {
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
