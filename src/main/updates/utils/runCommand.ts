import {spawn} from "node:child_process"

import {APP_CONFIG} from "@/config"

import type {CommandResult} from "@/types/updates"

export function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...APP_CONFIG.updates.brewEnv,
      PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`,
    }

    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let didTimeout = false
    let didFinish = false

    const timeout = setTimeout(() => {
      didTimeout = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", (error) => {
      if (didFinish) return
      didFinish = true
      clearTimeout(timeout)
      resolve({
        code: -1,
        stdout,
        stderr: stderr || String(error),
        didTimeout,
      })
    })

    child.on("close", (code) => {
      if (didFinish) return
      didFinish = true
      clearTimeout(timeout)
      resolve({
        code: code ?? -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        didTimeout,
      })
    })
  })
}
