// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {StdioChannel} from "../../../src/main/quickTask/StdioChannel"

function pair(handlersA = {}, handlersB = {}, timeoutMs) {
  const a = new StdioChannel((line) => b.receive(line), {onRequest: async () => undefined, onEvent: vi.fn(), ...handlersA}, timeoutMs)
  const b = new StdioChannel((line) => a.receive(line), {onRequest: async () => undefined, onEvent: vi.fn(), ...handlersB}, timeoutMs)
  return {a, b}
}

describe("the Quick task process channel", () => {
  describe("framing", () => {
    it("dispatches each complete line and holds a partial one until the rest arrives", () => {
      const onEvent = vi.fn()
      const channel = new StdioChannel(vi.fn(), {onRequest: vi.fn(), onEvent})
      const line = JSON.stringify({kind: "event", channel: "x", args: [1]}) + "\n"

      channel.receive(line.slice(0, 10))
      expect(onEvent).not.toHaveBeenCalled()

      channel.receive(line.slice(10) + line)
      expect(onEvent).toHaveBeenCalledTimes(2)
      expect(onEvent).toHaveBeenCalledWith("x", [1])
    })

    it("writes one JSON object per line", () => {
      const write = vi.fn()
      const channel = new StdioChannel(write, {onRequest: vi.fn(), onEvent: vi.fn()})

      channel.emit("settings:changed")

      expect(write).toHaveBeenCalledWith('{"kind":"event","channel":"settings:changed","args":[]}\n')
    })

    it("reports lines that are not messages and keeps going", () => {
      const onInvalid = vi.fn()
      const onEvent = vi.fn()
      const channel = new StdioChannel(vi.fn(), {onRequest: vi.fn(), onEvent, onInvalid})

      channel.receive('not json\n{"kind":"nope"}\n{"kind":"event","channel":"ok","args":[]}\n')

      expect(onInvalid).toHaveBeenCalledTimes(2)
      expect(onEvent).toHaveBeenCalledWith("ok", [])
    })
  })

  describe("requests", () => {
    it("resolves with the answer, correlating concurrent requests by id", async () => {
      const {a} = pair(
        {},
        {
          onRequest: async (channel, args) =>
            channel === "slow" ? new Promise((r) => setTimeout(() => r("slow:" + args[0]), 5)) : "fast:" + args[0],
        },
      )

      const [slow, fast] = await Promise.all([a.request("slow", [1]), a.request("fast", [2])])

      expect(slow).toBe("slow:1")
      expect(fast).toBe("fast:2")
    })

    it("rejects with the message of an error the peer threw", async () => {
      const {a} = pair(
        {},
        {
          onRequest: async () => {
            throw new Error("nope")
          },
        },
      )

      await expect(a.request("x")).rejects.toThrow("nope")
    })

    it("rejects a request still waiting when the channel closes", async () => {
      const a = new StdioChannel(vi.fn(), {onRequest: vi.fn(), onEvent: vi.fn()})
      const request = a.request("x")

      a.close(new Error("process exited"))

      await expect(request).rejects.toThrow("process exited")
    })

    it("rejects when the write fails", async () => {
      const a = new StdioChannel(
        () => {
          throw new Error("closed")
        },
        {onRequest: vi.fn(), onEvent: vi.fn()},
      )

      await expect(a.request("x")).rejects.toThrow("closed")
    })

    it("ignores a response nobody waits for", () => {
      const a = new StdioChannel(vi.fn(), {onRequest: vi.fn(), onEvent: vi.fn()})

      expect(() => a.receive('{"kind":"response","id":99,"ok":true}\n')).not.toThrow()
    })

    describe("when the peer never answers", () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())

      it("rejects after the timeout", async () => {
        const a = new StdioChannel(vi.fn(), {onRequest: vi.fn(), onEvent: vi.fn()}, 1000)
        const request = a.request("x")
        const assertion = expect(request).rejects.toThrow("timed out")

        await vi.advanceTimersByTimeAsync(1000)

        await assertion
      })
    })
  })

  describe("events", () => {
    it("reaches the peer with its arguments", () => {
      const onEvent = vi.fn()
      const {a} = pair({}, {onEvent})

      a.emit("storage:changed", {tasks: {}})

      expect(onEvent).toHaveBeenCalledWith("storage:changed", [{tasks: {}}])
    })
  })
})
