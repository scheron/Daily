import {constants} from "node:fs"
import {access, readFile, stat} from "node:fs/promises"
import {join} from "node:path"

import {KNOWN_SNAPSHOT_VERSION} from "@/utils/sync/snapshot/assertKnownSnapshotVersion"
import {isValidSnapshot} from "@/utils/sync/snapshot/isValidSnapshot"

import {resolveCliRuntime} from "../config"
import {renderJsonOk} from "../output"

import type {Snapshot} from "@/types/sync"

type DoctorOptions = {json?: boolean}
type FolderStatus = "accessible" | "missing" | "not-directory" | "unreadable"
type SnapshotStatus = "valid" | "missing" | "unreadable" | "invalid-json" | "invalid" | "unsupported-version"

type SnapshotDiagnostic = {
  counts?: {branches: number; files: number; tags: number; tasks: number}
  hash?: string
  path: string
  status: SnapshotStatus
  updatedAt?: string
  version?: number
}

type NodeDoctorDiagnostic = {
  folder: {path: string; status: FolderStatus}
  healthy: boolean
  localDatabase: string
  mode: "node"
  snapshot: SnapshotDiagnostic | null
}

type DirectDoctorDiagnostic = {
  healthy: true
  localDatabase: string
  mode: "direct"
  snapshot: null
}

export type SyncDoctorDiagnostic = DirectDoctorDiagnostic | NodeDoctorDiagnostic

export async function inspectSync(): Promise<SyncDoctorDiagnostic> {
  const runtime = resolveCliRuntime()

  if (runtime.mode === "direct") {
    return {healthy: true, localDatabase: runtime.paths.dbPath(), mode: "direct", snapshot: null}
  }

  const folder = await inspectFolder(runtime.syncDir!)
  const snapshot = folder.status === "accessible" ? await inspectSnapshot(runtime.syncDir!) : null

  return {
    folder,
    healthy: folder.status === "accessible" && snapshot?.status === "valid",
    localDatabase: runtime.paths.dbPath(),
    mode: "node",
    snapshot,
  }
}

export async function runSyncDoctor(opts: DoctorOptions): Promise<void> {
  const diagnostic = await inspectSync()

  if (opts.json) console.log(renderJsonOk(diagnostic))
  else console.log(formatSyncDoctorDiagnostic(diagnostic))

  if (!diagnostic.healthy) process.exit(5)
}

function formatSyncDoctorDiagnostic(diagnostic: SyncDoctorDiagnostic): string {
  if (diagnostic.mode === "direct") {
    return ["Mode: direct (app database)", `Local database: ${diagnostic.localDatabase}`, "Node snapshot: not configured", "Status: healthy"].join(
      "\n",
    )
  }

  const lines = [
    "Mode: node",
    `Configured sync folder: ${diagnostic.folder.path}`,
    `Folder: ${diagnostic.folder.status}`,
    `Local database: ${diagnostic.localDatabase}`,
  ]

  if (diagnostic.snapshot) {
    lines.push(`Snapshot path: ${diagnostic.snapshot.path}`, `Snapshot: ${diagnostic.snapshot.status}`)
    if (diagnostic.snapshot.version !== undefined) lines.push(`Snapshot version: ${diagnostic.snapshot.version}`)
    if (diagnostic.snapshot.hash) lines.push(`Snapshot hash: ${diagnostic.snapshot.hash}`)
    if (diagnostic.snapshot.updatedAt) lines.push(`Snapshot updated: ${diagnostic.snapshot.updatedAt}`)
    if (diagnostic.snapshot.counts) {
      const {branches, files, tags, tasks} = diagnostic.snapshot.counts
      lines.push(`Snapshot document counts: tasks=${tasks}, tags=${tags}, branches=${branches}, files=${files}`)
    }
  } else {
    lines.push("Snapshot: not checked")
  }

  lines.push(`Status: ${diagnostic.healthy ? "healthy" : "blocking problem"}`)
  return lines.join("\n")
}

async function inspectFolder(path: string): Promise<NodeDoctorDiagnostic["folder"]> {
  try {
    const info = await stat(path)
    if (!info.isDirectory()) return {path, status: "not-directory"}
    await access(path, constants.R_OK | constants.W_OK)
    return {path, status: "accessible"}
  } catch (err) {
    return {path, status: isNotFound(err) ? "missing" : "unreadable"}
  }
}

async function inspectSnapshot(folderPath: string): Promise<SnapshotDiagnostic> {
  const path = join(folderPath, "snapshot.json")
  let raw: string

  try {
    raw = await readFile(path, "utf-8")
  } catch (err) {
    return {path, status: isNotFound(err) ? "missing" : "unreadable"}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {path, status: "invalid-json"}
  }

  const version = getSnapshotVersion(parsed)
  if (version !== undefined && version > KNOWN_SNAPSHOT_VERSION) return {path, status: "unsupported-version", version}
  if (!isValidSnapshot(parsed as Snapshot)) return {path, status: "invalid", version}

  const snapshot = parsed as Snapshot
  return {
    counts: {
      branches: snapshot.docs.branches.length,
      files: snapshot.docs.files.length,
      tags: snapshot.docs.tags.length,
      tasks: snapshot.docs.tasks.length,
    },
    hash: snapshot.meta.hash,
    path,
    status: "valid",
    updatedAt: snapshot.meta.updatedAt,
    version: snapshot.version,
  }
}

function getSnapshotVersion(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null || !("version" in value)) return undefined
  const version = value.version
  return typeof version === "number" ? version : undefined
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT")
}
