import {execFile} from "node:child_process"
import {extname, join, posix} from "node:path"
import fs from "fs-extra"

import {SyncErrorCode} from "@shared/errors/sync/SyncErrorCode"
import {assertKnownSnapshotVersion} from "@/utils/sync/snapshot/assertKnownSnapshotVersion"
import {isValidSnapshot} from "@/utils/sync/snapshot/isValidSnapshot"

import type {IRemoteStorage, Snapshot, SnapshotFile} from "@/types/sync"

export type SshRemoteConfig = {host: string; dir: string}

export type CommandResult = {exitCode: number; stdout: Buffer; stderr: string}

export type CommandRunner = (cmd: string, args: string[], opts?: {stdin?: string}) => Promise<CommandResult>

const SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5"]
const SNAPSHOT_FILENAME = "snapshot.json"
const SNAPSHOT_TMP_FILENAME = ".snapshot.tmp"
const MAX_STDOUT = 200 * 1024 * 1024

/**
 * IRemoteStorage over a directory on an SSH-reachable machine, driven by the
 * system ssh/scp binaries so auth, ports, and users come from ~/.ssh/config and
 * ssh-agent. BatchMode + ConnectTimeout make an unreachable host fail fast and
 * without interactive prompts. Assets travel via ls-diff + scp (portable across
 * macOS rsync variants), preserving copy-what's-missing semantics.
 */
export class SshRemoteAdapter implements IRemoteStorage {
  constructor(
    private readonly config: SshRemoteConfig,
    private readonly run: CommandRunner = execFileRunner,
  ) {}

  async loadSnapshot(): Promise<Snapshot | null> {
    const result = await this.run("ssh", [...SSH_OPTS, this.config.host, `cat ${shellQuote(this.snapshotPath())}`])

    if (result.exitCode !== 0) {
      if (/no such file/i.test(result.stderr)) return null
      throw new Error(`${SyncErrorCode.SnapshotLoadFailed}: ssh exited ${result.exitCode}: ${result.stderr.trim()}`)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(result.stdout.toString("utf-8"))
    } catch {
      return null
    }

    assertKnownSnapshotVersion(parsed)

    if (!isValidSnapshot(parsed as Snapshot)) return null

    const snapshot = parsed as Snapshot
    snapshot.docs.branches = snapshot.docs.branches ?? []
    snapshot.docs.events = snapshot.docs.events ?? []
    return snapshot
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const dir = shellQuote(this.config.dir)
    const assetsDir = shellQuote(posix.join(this.config.dir, "assets"))
    const tmp = shellQuote(posix.join(this.config.dir, SNAPSHOT_TMP_FILENAME))
    const dst = shellQuote(this.snapshotPath())

    const result = await this.run("ssh", [...SSH_OPTS, this.config.host, `mkdir -p ${dir} ${assetsDir} && cat > ${tmp} && mv ${tmp} ${dst}`], {
      stdin: JSON.stringify(snapshot, null, 2),
    })

    if (result.exitCode !== 0) {
      throw new Error(`${SyncErrorCode.SnapshotSaveFailed}: ssh exited ${result.exitCode}: ${result.stderr.trim()}`)
    }
  }

  async syncAssets(localAssetsDir: string, fileManifest: SnapshotFile[]): Promise<void> {
    if (!fileManifest.length) return

    const remoteAssetsDir = posix.join(this.config.dir, "assets")
    const listResult = await this.run("ssh", [
      ...SSH_OPTS,
      this.config.host,
      `mkdir -p ${shellQuote(remoteAssetsDir)} && ls -1 ${shellQuote(remoteAssetsDir)}`,
    ])
    if (listResult.exitCode !== 0) {
      throw new Error(`${SyncErrorCode.AssetSyncFailed}: ssh exited ${listResult.exitCode}: ${listResult.stderr.trim()}`)
    }
    const remoteNames = new Set(listResult.stdout.toString("utf-8").split("\n").filter(Boolean))

    const toPush: string[] = []
    const toPull: string[] = []
    for (const file of fileManifest) {
      const ext = extname(file.name).slice(1) || "bin"
      const filename = `${file.id}.${ext}`
      const localExists = await fs.pathExists(join(localAssetsDir, filename))
      if (localExists && !remoteNames.has(filename)) toPush.push(filename)
      else if (!localExists && remoteNames.has(filename)) toPull.push(filename)
    }

    if (toPush.length) {
      const args = [...SSH_OPTS, ...toPush.map((name) => join(localAssetsDir, name)), `${this.config.host}:${remoteAssetsDir}/`]
      const result = await this.run("scp", args)
      if (result.exitCode !== 0) throw new Error(`${SyncErrorCode.AssetSyncFailed}: scp push exited ${result.exitCode}: ${result.stderr.trim()}`)
    }

    if (toPull.length) {
      const args = [...SSH_OPTS, ...toPull.map((name) => `${this.config.host}:${posix.join(remoteAssetsDir, name)}`), `${localAssetsDir}/`]
      const result = await this.run("scp", args)
      if (result.exitCode !== 0) throw new Error(`${SyncErrorCode.AssetSyncFailed}: scp pull exited ${result.exitCode}: ${result.stderr.trim()}`)
    }
  }

  private snapshotPath(): string {
    return posix.join(this.config.dir, SNAPSHOT_FILENAME)
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

async function execFileRunner(cmd: string, args: string[], opts?: {stdin?: string}): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = execFile(cmd, args, {encoding: "buffer", maxBuffer: MAX_STDOUT}, (error, stdout, stderr) => {
      resolvePromise({
        exitCode: child.exitCode ?? (error ? 1 : 0),
        stdout,
        stderr: stderr.toString("utf-8"),
      })
    })
    if (opts?.stdin != null) {
      child.stdin?.write(opts.stdin)
      child.stdin?.end()
    }
  })
}
