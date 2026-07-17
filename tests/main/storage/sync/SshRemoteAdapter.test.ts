import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SnapshotVersionAheadError} from "@shared/errors/sync/SnapshotVersionAheadError"

import {SshRemoteAdapter} from "@main/storage/sync/adapters/SshRemoteAdapter"
import {buildSnapshot} from "@main/utils/sync/snapshot/buildSnapshot"

import type {CommandResult} from "@main/storage/sync/adapters/SshRemoteAdapter"
import type {SnapshotDocs, SnapshotFile} from "@main/types/sync"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), lifecycle: vi.fn(), CONTEXT: {SYNC_REMOTE: "SYNC_REMOTE"}},
}))

function emptyDocs(): SnapshotDocs {
  return {tasks: [], tags: [], branches: [], files: [], events: [], settings: null}
}

function makeFile(id: string, name: string): SnapshotFile {
  const now = "2026-07-18T10:00:00.000Z"
  return {id, name, mime_type: "text/plain", size: 1, created_at: now, updated_at: now, deleted_at: null}
}

type Call = {cmd: string; args: string[]; stdin?: string}

function makeRunner(script: (call: Call, index: number) => CommandResult) {
  const calls: Call[] = []
  const run = async (cmd: string, args: string[], opts?: {stdin?: string}): Promise<CommandResult> => {
    const call = {cmd, args, stdin: opts?.stdin}
    calls.push(call)
    return script(call, calls.length - 1)
  }
  return {calls, run}
}

const ok = (stdout = ""): CommandResult => ({exitCode: 0, stdout: Buffer.from(stdout), stderr: ""})
const fail = (exitCode: number, stderr: string): CommandResult => ({exitCode, stdout: Buffer.alloc(0), stderr})

describe("SshRemoteAdapter", () => {
  const config = {host: "worker", dir: "/srv/daily-sync"}

  it("loadSnapshot returns the parsed snapshot and uses BatchMode ssh", async () => {
    const snapshot = buildSnapshot(emptyDocs())
    const {calls, run} = makeRunner(() => ok(JSON.stringify(snapshot)))
    const adapter = new SshRemoteAdapter(config, run)

    const loaded = await adapter.loadSnapshot()

    expect(loaded?.meta.hash).toBe(snapshot.meta.hash)
    expect(calls[0].cmd).toBe("ssh")
    expect(calls[0].args).toContain("BatchMode=yes")
    expect(calls[0].args).toContain("worker")
    expect(calls[0].args.at(-1)).toContain("/srv/daily-sync/snapshot.json")
  })

  it("loadSnapshot returns null when the file is missing", async () => {
    const {run} = makeRunner(() => fail(1, "cat: /srv/daily-sync/snapshot.json: No such file or directory"))
    await expect(new SshRemoteAdapter(config, run).loadSnapshot()).resolves.toBeNull()
  })

  it("loadSnapshot throws on other ssh failures (unreachable host)", async () => {
    const {run} = makeRunner(() => fail(255, "ssh: connect to host worker port 22: Connection refused"))
    await expect(new SshRemoteAdapter(config, run).loadSnapshot()).rejects.toThrow("Failed to load snapshot")
  })

  it("loadSnapshot throws SnapshotVersionAheadError on a newer schema", async () => {
    const {run} = makeRunner(() => ok(JSON.stringify({version: 4, docs: {}, meta: {updatedAt: "x", hash: "y"}})))
    await expect(new SshRemoteAdapter(config, run).loadSnapshot()).rejects.toThrow(SnapshotVersionAheadError)
  })

  it("saveSnapshot pipes JSON over stdin into an atomic mkdir+tmp+mv command", async () => {
    const snapshot = buildSnapshot(emptyDocs())
    const {calls, run} = makeRunner(() => ok())
    await new SshRemoteAdapter(config, run).saveSnapshot(snapshot)

    const remoteCommand = calls[0].args.at(-1)!
    expect(remoteCommand).toContain("mkdir -p")
    expect(remoteCommand).toContain(".snapshot.tmp")
    expect(remoteCommand).toContain("mv ")
    expect(calls[0].stdin).toBe(JSON.stringify(snapshot, null, 2))
  })

  describe("syncAssets", () => {
    let assetsDir: string

    beforeEach(() => {
      assetsDir = mkdtempSync(join(tmpdir(), "daily-ssh-assets-"))
    })

    afterEach(() => {
      rmSync(assetsDir, {recursive: true, force: true})
    })

    it("pushes files missing remotely and pulls files missing locally, skipping ones both sides have", async () => {
      await fs.writeFile(join(assetsDir, "local-only.txt"), "x", "utf-8")
      await fs.writeFile(join(assetsDir, "both.txt"), "x", "utf-8")

      const {calls, run} = makeRunner((call, index) => {
        if (index === 0) return ok("remote-only.txt\nboth.txt\n")
        return ok()
      })
      const adapter = new SshRemoteAdapter(config, run)

      await adapter.syncAssets(assetsDir, [makeFile("local-only", "a.txt"), makeFile("remote-only", "b.txt"), makeFile("both", "c.txt")])

      expect(calls[0].cmd).toBe("ssh")
      expect(calls[0].args.at(-1)).toContain("mkdir -p")

      const scpCalls = calls.filter((c) => c.cmd === "scp")
      expect(scpCalls).toHaveLength(2)
      expect(scpCalls[0].args).toContain(join(assetsDir, "local-only.txt"))
      expect(scpCalls[0].args.at(-1)).toBe("worker:/srv/daily-sync/assets/")
      expect(scpCalls[1].args).toContain("worker:/srv/daily-sync/assets/remote-only.txt")
      expect(scpCalls[1].args.at(-1)).toBe(`${assetsDir}/`)
    })

    it("does nothing with an empty manifest", async () => {
      const {calls, run} = makeRunner(() => ok())
      await new SshRemoteAdapter(config, run).syncAssets(assetsDir, [])
      expect(calls).toHaveLength(0)
    })
  })
})
