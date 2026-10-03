// @ts-nocheck
import {EventEmitter} from "node:events"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {QuickCaptureHelper} from "../../../src/main/quickCaptureHelper/QuickCaptureHelper"

vi.mock("@daily/core", () => ({logger: {error: vi.fn(), warn: vi.fn(), CONTEXT: {APP: "APP"}}}))

function fakeChild() {
  const child = new EventEmitter()
  child.stdin = Object.assign(new EventEmitter(), {writable: true, written: [], write: (line) => child.stdin.written.push(line), end: vi.fn()})
  child.stdout = Object.assign(new EventEmitter(), {setEncoding: vi.fn()})
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe("Daily's quick-capture helper", () => {
  let children = null
  let clock = 0
  let handleRequest = null
  let onReady = null
  let helper = null
  let availability = null

  beforeEach(() => {
    vi.useFakeTimers()
    children = []
    clock = 0
    availability = []
    handleRequest = vi.fn(async () => "answer")
    onReady = vi.fn()
    helper = new QuickCaptureHelper({
      spawn: () => {
        const child = fakeChild()
        children.push(child)
        return child
      },
      handleRequest,
      onReady,
      onAvailabilityChange: (isAvailable) => availability.push(isAvailable),
      now: () => clock,
    })
  })

  afterEach(() => vi.useRealTimers())

  const line = (message) => JSON.stringify(message) + "\n"
  const exit = (child, after = 0) => {
    clock += after
    child.emit("exit", 1, null)
  }

  it("spawns once however often it is started", () => {
    helper.start()
    helper.start()

    expect(children).toHaveLength(1)
  })

  it("runs onReady when the helper says it is ready", () => {
    helper.start()

    children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))

    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it("reports itself available once ready, unavailable when it dies, and again when it comes back", async () => {
    helper.start()
    children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))
    await vi.advanceTimersByTimeAsync(0)
    expect(availability).toEqual([true])

    exit(children[0], 10_000)
    expect(availability).toEqual([true, false])

    await vi.advanceTimersByTimeAsync(500)
    children[1].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))
    await vi.advanceTimersByTimeAsync(0)
    expect(availability).toEqual([true, false, true])
  })

  it("still restarts the helper when an availability listener throws", async () => {
    helper = new QuickCaptureHelper({
      spawn: () => {
        const child = fakeChild()
        children.push(child)
        return child
      },
      handleRequest,
      onReady,
      onAvailabilityChange: (isAvailable) => {
        if (!isAvailable) throw new Error("listener")
      },
      now: () => clock,
    })
    helper.start()
    children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))
    await vi.advanceTimersByTimeAsync(0)

    expect(() => exit(children[0], 10_000)).toThrow("listener")
    await vi.advanceTimersByTimeAsync(10_000)

    expect(children).toHaveLength(2)
  })

  it("stays unavailable while it restarts and after it gives up", async () => {
    helper.start()
    children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))
    await vi.advanceTimersByTimeAsync(0)

    for (let i = 0; i < 4; i++) {
      exit(children.at(-1))
      await vi.advanceTimersByTimeAsync(5000)
    }

    expect(children).toHaveLength(4)
    expect(availability).toEqual([true, false])
  })

  it("answers a request from the helper on its stdin", async () => {
    helper.start()

    children[0].stdout.emit("data", line({kind: "request", id: 7, channel: "tasks:get-all", args: []}))
    await vi.advanceTimersByTimeAsync(0)

    expect(handleRequest).toHaveBeenCalledWith("tasks:get-all", [])
    expect(children[0].stdin.written).toEqual([line({kind: "response", id: 7, ok: true, result: "answer"})])
  })

  it("sends a request to the helper and resolves with its answer", async () => {
    helper.start()

    const pending = helper.request("hotkey:active")
    const {id} = JSON.parse(children[0].stdin.written[0])
    children[0].stdout.emit("data", line({kind: "response", id, ok: true, result: "Command+Alt+Space"}))

    await expect(pending).resolves.toBe("Command+Alt+Space")
  })

  it("rejects a request when the helper is not running", async () => {
    await expect(helper.request("hotkey:active")).rejects.toThrow("not running")
  })

  it("rejects a request in flight when the helper dies", async () => {
    helper.start()
    const pending = helper.request("hotkey:rebind", ["Control+A"])
    const assertion = expect(pending).rejects.toThrow("exited")

    exit(children[0], 60_000)

    await assertion
  })

  it("forwards events to the helper", () => {
    helper.start()

    helper.emit("settings:changed")

    expect(JSON.parse(children[0].stdin.written[0])).toEqual({kind: "event", channel: "settings:changed", args: []})
  })

  it("restarts a helper that exits unexpectedly, after a delay", () => {
    helper.start()

    exit(children[0], 60_000)
    expect(children).toHaveLength(1)

    vi.advanceTimersByTime(500)
    expect(children).toHaveLength(2)
  })

  it("backs off 0.5 s, 2 s, then 5 s between quick failures and gives up on the fourth", () => {
    helper.start()

    exit(children[0], 100)
    vi.advanceTimersByTime(500)
    expect(children).toHaveLength(2)

    exit(children[1], 100)
    vi.advanceTimersByTime(1999)
    expect(children).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(children).toHaveLength(3)

    exit(children[2], 100)
    vi.advanceTimersByTime(4999)
    expect(children).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(children).toHaveLength(4)

    exit(children[3], 100)
    vi.advanceTimersByTime(60_000)
    expect(children).toHaveLength(4)
  })

  it("starts again after giving up when it is started again, as the main window does each time it opens", () => {
    helper.start()
    for (let index = 0; index < 4; index++) {
      exit(children[index], 100)
      vi.advanceTimersByTime(5000)
    }
    expect(children).toHaveLength(4)

    helper.start()

    expect(children).toHaveLength(5)
  })

  it("forgets earlier failures once a helper has run for a while", () => {
    helper.start()
    exit(children[0], 100)
    vi.advanceTimersByTime(500)

    exit(children[1], 60_000)
    vi.advanceTimersByTime(500)

    expect(children).toHaveLength(3)
  })

  it("keeps retrying a spawn that throws, then gives up", () => {
    let attempts = 0
    helper = new QuickCaptureHelper({
      spawn: () => {
        attempts++
        throw new Error("ENOENT")
      },
      handleRequest,
      onReady,
      now: () => clock,
    })

    helper.start()
    vi.advanceTimersByTime(60_000)

    expect(attempts).toBe(4)
  })

  it("lets the helper go on stop: closes its stdin, kills it at once so none is left behind, and never restarts it", () => {
    helper.start()

    helper.stop()
    expect(children[0].stdin.end).toHaveBeenCalled()
    expect(children[0].kill).toHaveBeenCalledTimes(1)

    exit(children[0])
    vi.advanceTimersByTime(60_000)
    expect(children).toHaveLength(1)
  })

  describe("whenReady", () => {
    it("resolves once the helper says it is ready, and at once afterwards", async () => {
      helper.start()
      const waiting = helper.whenReady()

      children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))

      await expect(waiting).resolves.toBeUndefined()
      await expect(helper.whenReady()).resolves.toBeUndefined()
    })

    it("stays pending until the setup run on ready has settled", async () => {
      let finishSetup = null
      onReady.mockImplementation(() => new Promise((resolve) => (finishSetup = resolve)))
      let settled = false
      helper.start()
      const waiting = helper.whenReady().then(() => (settled = true))

      children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)

      finishSetup()
      await waiting
      expect(settled).toBe(true)
    })

    it("resolves even when the setup fails", async () => {
      onReady.mockRejectedValue(new Error("settings broke"))
      helper.start()
      const waiting = helper.whenReady()

      children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))

      await expect(waiting).resolves.toBeUndefined()
    })

    it("rejects when the helper is stopped first", async () => {
      helper.start()
      const waiting = expect(helper.whenReady()).rejects.toThrow("not running")

      helper.stop()

      await waiting
    })

    it("rejects when the helper has given up", async () => {
      helper.start()
      const waiting = expect(helper.whenReady(60_000)).rejects.toThrow("not running")

      for (let index = 0; index < 4; index++) {
        exit(children[index], 100)
        vi.advanceTimersByTime(5000)
      }

      await waiting
    })

    it("rejects when the helper does not get ready in time", async () => {
      helper.start()
      const waiting = expect(helper.whenReady(1000)).rejects.toThrow("did not become ready")

      await vi.advanceTimersByTimeAsync(1000)

      await waiting
    })

    it("is not ready again after the helper exits until the next one says so", async () => {
      helper.start()
      children[0].stdout.emit("data", line({kind: "event", channel: "helper:ready", args: []}))

      exit(children[0], 60_000)
      const waiting = expect(helper.whenReady(1000)).rejects.toThrow("did not become ready")
      await vi.advanceTimersByTimeAsync(1000)

      await waiting
    })
  })

  it("cancels a pending restart on stop", () => {
    helper.start()
    exit(children[0], 60_000)

    helper.stop()
    vi.advanceTimersByTime(60_000)

    expect(children).toHaveLength(1)
  })
})
