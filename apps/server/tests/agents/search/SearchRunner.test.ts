import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {ToolErrorCode} from "@daily/tools"

import {SearchRunner} from "../../../src/agents/search/SearchRunner"
import {openServerStore} from "../../../src/store/instance"
import {bindAgent} from "../helpers"

import type {AgentIdentity} from "../../../src/agents/AgentWorkspace"
import type {ServerStore} from "../../../src/store/instance"

const WORKER = `
  const {appendFileSync} = require("node:fs")
  const {join} = require("node:path")
  process.once("message", ({dataDir, input}) => {
    const {search} = JSON.parse(input)
    appendFileSync(join(dataDir, "started"), search + ":" + process.pid + "\\n")
    if (search.startsWith("hang")) for (;;) {}
    if (search === "crash") process.exit(1)
    process.send({ok: true, text: "{}"}, () => process.exit(0))
  })
`

describe("the search runner", () => {
  let dataDir: string
  let workerPath: string
  let store: ServerStore
  let agent: AgentIdentity
  let runner: SearchRunner

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "daily-search-runner-"))
    workerPath = join(dataDir, "searchFixture.cjs")
    writeFileSync(workerPath, WORKER)
    store = openServerStore(dataDir)
    agent = bindAgent(store)
    runner = new SearchRunner(store, {workerPath})
  })

  afterEach(async () => {
    await runner.close()
    store.close()
    rmSync(dataDir, {recursive: true, force: true})
  })

  it.each(["", "  "])("runs a list_tasks search for %j in a child", async (search) => {
    await expect(submit(search).outcome).resolves.toMatchObject({ok: true, text: "{}", timing: {executionMs: expect.any(Number)}})
  })

  it("refuses an oversized phrase before starting a child", async () => {
    await expect(submit("a".repeat(2049)).outcome).resolves.toMatchObject({
      ok: false,
      error: {code: ToolErrorCode.SEARCH_BUDGET_EXCEEDED},
    })
    expect(started()).toEqual([])
  })

  it("admits two calls from one agent, kills a cancelled child, and starts remaining work in order", async () => {
    const first = submit("hang")
    const second = submit("next")
    const third = submit("last", "another-agent")

    const firstPid = await vi.waitFor(() => {
      const [[name, pid]] = started()
      expect(name).toBe("hang")
      return Number(pid)
    })
    expect(started().map(([name]) => name)).toEqual(["hang"])
    first.cancel()

    await expect(first.outcome).resolves.toMatchObject({ok: false, error: {code: ToolErrorCode.SEARCH_CANCELLED}})
    await expect(second.outcome).resolves.toMatchObject({ok: true, text: "{}"})
    await expect(third.outcome).resolves.toMatchObject({ok: true, text: "{}"})
    expect(started().map(([name]) => name)).toEqual(["hang", "next", "last"])
    expect(() => process.kill(firstPid, 0)).toThrow(/ESRCH/)
  })

  it("applies per-agent and global pending limits and frees a cancelled queue position", async () => {
    submit("hang")
    const queued = submit("cancelled")
    submit("agent-pending")
    const otherAgents = Array.from({length: 6}, (_, index) => submit("other", `agent-${index}`))
    const overload = {ok: false, error: {code: ToolErrorCode.SEARCH_OVERLOADED}}

    await expect(submit("too many per agent").outcome).resolves.toMatchObject(overload)
    await expect(submit("too many globally", "fresh-agent").outcome).resolves.toMatchObject(overload)
    queued.cancel()
    const cancelled = await queued.outcome
    expect(cancelled).toMatchObject({ok: false, error: {code: ToolErrorCode.SEARCH_CANCELLED}, timing: {queueMs: expect.any(Number)}})
    expect(cancelled.timing).not.toHaveProperty("executionMs")

    const replacement = submit("replacement")
    await runner.close()
    await expect(replacement.outcome).resolves.toMatchObject({ok: false, error: {code: ToolErrorCode.SEARCH_CANCELLED}})
    await expect(otherAgents[0].outcome).resolves.toMatchObject({ok: false, error: {code: ToolErrorCode.SEARCH_CANCELLED}})
    expect(started().map(([name]) => name)).not.toContain("cancelled")
  })

  it("includes time in the queue in the deadline and recovers after killing a timed-out child", async () => {
    runner = new SearchRunner(store, {workerPath, deadlineMs: 750})
    const active = submit("hang")
    const queued = submit("hang while queued")
    const timeout = {ok: false, error: {code: ToolErrorCode.SEARCH_TIMEOUT}}
    await expect(active.outcome).resolves.toMatchObject({...timeout, timing: {executionMs: expect.any(Number)}})
    const queuedOutcome = await queued.outcome
    expect(queuedOutcome).toMatchObject(timeout)
    expect(queuedOutcome.timing?.queueMs).toBeGreaterThan(500)
    expect(queuedOutcome.timing?.executionMs ?? 0).toBeLessThan(200)

    await expect(submit("after timeout").outcome).resolves.toMatchObject({ok: true})
    expect(started().at(-1)?.[0]).toBe("after timeout")
  })

  it("reports a worker crash once and continues queued work", async () => {
    const crashed = submit("crash")
    const next = submit("next")
    await expect(crashed.outcome).resolves.toMatchObject({ok: false, error: {code: ToolErrorCode.INTERNAL}})
    crashed.cancel()
    await expect(next.outcome).resolves.toMatchObject({ok: true})
    expect(started().map(([name]) => name)).toEqual(["crash", "next"])
  })

  function submit(search: string, agentKey = "agent") {
    return runner.submit(agentKey, agent, {name: "list_tasks", input: {search}})
  }

  function started() {
    const file = join(dataDir, "started")
    if (!existsSync(file)) return []
    return readFileSync(file, "utf-8")
      .trim()
      .split("\n")
      .map((line) => line.split(":"))
  }
})
