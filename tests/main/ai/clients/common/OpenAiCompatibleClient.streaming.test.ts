// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {OpenAiCompatibleClient} from "@main/ai/clients/common/OpenAiCompatibleClient"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

class TestClient extends OpenAiCompatibleClient {
  constructor(private config: any) {
    super()
  }
  updateConfig() {}
  protected getClientName() {
    return "Test"
  }
  protected getConnectionConfig() {
    return {baseUrl: "http://x", apiKey: "k"}
  }
  protected getChatConfig() {
    return {baseUrl: "http://x", apiKey: "k", model: "m"}
  }
}

function sseResponse(events: string[]): Response {
  const text = events.map((e) => `data: ${e}\n\n`).join("") + "data: [DONE]\n\n"
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text))
      c.close()
    },
  })
  return new Response(stream, {status: 200, headers: {"content-type": "text/event-stream"}})
}

describe("OpenAiCompatibleClient.chat (streaming)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("sync path still works without callbacks (regression)", async () => {
    const client = new TestClient({})
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{message: {role: "assistant", content: "hi"}, finish_reason: "stop"}],
          }),
          {status: 200, headers: {"content-type": "application/json"}},
        ),
      ),
    )
    const {message} = await client.chat([{role: "user", content: "hi"}])
    expect(message.content).toBe("hi")
  })

  it("emits content deltas through onDelta callback", async () => {
    const client = new TestClient({})
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            JSON.stringify({choices: [{delta: {role: "assistant"}}]}),
            JSON.stringify({choices: [{delta: {content: "Hello "}}]}),
            JSON.stringify({choices: [{delta: {content: "world"}}]}),
            JSON.stringify({choices: [{finish_reason: "stop"}]}),
          ]),
        ),
    )
    const deltas: any[] = []
    const {message} = await client.chat([{role: "user", content: "hi"}], undefined, undefined, undefined, {
      onDelta: (d) => deltas.push(d),
    })
    expect(deltas).toEqual([
      {kind: "content", text: "Hello "},
      {kind: "content", text: "world"},
    ])
    expect(message.content).toBe("Hello world")
  })

  it("emits reasoning deltas from reasoning_content (DeepSeek path)", async () => {
    const client = new TestClient({})
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            JSON.stringify({choices: [{delta: {reasoning_content: "hmm"}}]}),
            JSON.stringify({choices: [{delta: {content: "the answer"}}]}),
            JSON.stringify({choices: [{finish_reason: "stop"}]}),
          ]),
        ),
    )
    const deltas: any[] = []
    await client.chat([{role: "user", content: "x"}], undefined, undefined, undefined, {
      onDelta: (d) => deltas.push(d),
    })
    expect(deltas).toEqual([
      {kind: "reasoning", text: "hmm"},
      {kind: "content", text: "the answer"},
    ])
  })

  it("retries on 5xx before first delta", async () => {
    const client = new TestClient({})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("server error", {status: 503}))
      .mockResolvedValueOnce(
        sseResponse([JSON.stringify({choices: [{delta: {content: "ok"}}]}), JSON.stringify({choices: [{finish_reason: "stop"}]})]),
      )
    vi.stubGlobal("fetch", fetchMock)

    const deltas: any[] = []
    const p = client.chat([{role: "user", content: "x"}], undefined, undefined, undefined, {
      onDelta: (d) => deltas.push(d),
    })
    await vi.advanceTimersByTimeAsync(1100)
    const {message} = await p

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(message.content).toBe("ok")
  })

  it("throws on 5xx after MAX_RETRIES", async () => {
    const client = new TestClient({})
    const fetchMock = vi.fn().mockResolvedValue(new Response("server error", {status: 503}))
    vi.stubGlobal("fetch", fetchMock)

    const p = client.chat([{role: "user", content: "x"}], undefined, undefined, undefined, {onDelta: () => {}})
    // Attach rejection handler before advancing timers to avoid unhandled rejection warning
    const rejectExpect = expect(p).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_000)
    await rejectExpect
    expect(fetchMock).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it("does NOT retry on 4xx", async () => {
    const client = new TestClient({})
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", {status: 400}))
    vi.stubGlobal("fetch", fetchMock)

    await expect(client.chat([{role: "user", content: "x"}], undefined, undefined, undefined, {onDelta: () => {}})).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does NOT retry after first delta has been emitted", async () => {
    const client = new TestClient({})
    // First call: SSE that emits 1 delta then errors out via a body stream that throws.
    // Use pull-based controller so enqueued chunk is delivered before the error fires
    // (Electron's ReadableStream discards queued chunks when c.error() is called in start()).
    let pulled = 0
    const erroringStream = new ReadableStream({
      pull(c) {
        if (pulled === 0) {
          pulled++
          c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({choices: [{delta: {content: "x"}}]})}\n\n`))
        } else {
          c.error(new Error("connection reset"))
        }
      },
    })
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(erroringStream, {status: 200}))
    vi.stubGlobal("fetch", fetchMock)

    const deltas: any[] = []
    await expect(client.chat([{role: "user", content: "x"}], undefined, undefined, undefined, {onDelta: (d) => deltas.push(d)})).rejects.toThrow(
      /connection reset/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(deltas).toEqual([{kind: "content", text: "x"}])
  })

  it("aborts cleanly mid-stream", async () => {
    const client = new TestClient({})
    const ac = new AbortController()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_, opts) => {
        return new Promise((_, reject) => {
          opts.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        })
      }),
    )

    const p = client.chat([{role: "user", content: "x"}], undefined, ac.signal, undefined, {onDelta: () => {}})
    // Attach rejection handler before advancing timers to avoid unhandled rejection warning
    const rejectExpect = expect(p).rejects.toThrow()
    setTimeout(() => ac.abort(), 10)
    await vi.advanceTimersByTimeAsync(20)
    await rejectExpect
  })
})
