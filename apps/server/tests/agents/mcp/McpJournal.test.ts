import {mkdir, mkdtemp, open, readdir, readFile, rm, stat, truncate, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {expect, it, vi} from "vitest"

import {McpJournal} from "../../../src/agents/mcp/McpJournal"

import type * as FsPromises from "node:fs/promises"

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FsPromises>()
  return {...fs, open: vi.fn(fs.open)}
})

it("prunes expired and oldest oversized history while retaining the newest accepted start across recreation", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "daily-mcp-journal-"))
  const dir = join(dataDir, "mcp-journal")
  const today = new Date().toISOString().slice(0, 10)
  const journalPath = join(dir, `mcp-${today}-9.ndjson`)
  await mkdir(dir)
  await writeFile(join(dir, "mcp-2000-01-01-1.ndjson"), "expired\n")
  for (let index = 1; index <= 8; ++index) {
    const path = join(dir, `mcp-${today}-${index}.ndjson`)
    await writeFile(path, "")
    await truncate(path, 1024 * 1024)
  }

  const first = new McpJournal(dataDir)
  try {
    await first.begin("list_tasks", 17)
    const originalStart = JSON.parse((await readFile(journalPath, "utf8")).trim())
    const reopened = new McpJournal(dataDir)
    try {
      const finish = await reopened.begin("list_projects", null)
      finish?.("OK")
      await reopened.close()

      const files = await readdir(dir)
      const retainedBytes = await Promise.all(files.map(async (file) => (await stat(join(dir, file))).size))
      expect(files).not.toContain("mcp-2000-01-01-1.ndjson")
      expect(files).not.toContain(`mcp-${today}-1.ndjson`)
      expect(files).toContain(`mcp-${today}-2.ndjson`)
      expect(retainedBytes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(8 * 1024 * 1024)

      const records = (await readFile(journalPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(records).toHaveLength(3)
      expect(records[0]).toEqual({...originalStart, event: "start", tool: "list_tasks", searchLength: 17})
      expect(records[2]).toMatchObject({event: "end", id: records[1].id, code: "OK"})
      expect(records[2].id).not.toBe(originalStart.id)
    } finally {
      await reopened.close()
    }
  } finally {
    await first.close()
    await rm(dataDir, {recursive: true, force: true})
  }
})

it("limits pending records and releases callers while the disk writer is stalled", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "daily-mcp-journal-"))
  const dir = join(dataDir, "mcp-journal")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const fs = await vi.importActual<typeof FsPromises>("node:fs/promises")
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.mocked(open).mockImplementationOnce(async (...args) => {
    entered.resolve()
    await release.promise
    return fs.open(...args)
  })
  const journal = new McpJournal(dataDir)

  try {
    const first = journal.begin("list_projects", null)
    await entered.promise
    const queued = Array.from({length: 63}, () => journal.begin("list_projects", null))
    expect(await journal.begin("list_projects", null)).toBeNull()

    const admitted = await Promise.all([first, ...queued])
    expect(admitted.every((finish) => typeof finish === "function")).toBe(true)
    expect(await readdir(dir)).toEqual([])
    expect(warn.mock.calls).toEqual([["MCP journal degraded"]])
    release.resolve()

    await vi.waitFor(async () => {
      const [file] = await readdir(dir)
      const text = await readFile(join(dir, file), "utf8")
      expect(text.trim().split("\n")).toHaveLength(64)
    })
  } finally {
    release.resolve()
    await journal.close()
    warn.mockRestore()
    await rm(dataDir, {recursive: true, force: true})
  }
})
