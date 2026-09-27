// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {OpenAiCompatibleClient} from "../../../../../src/main/ai/clients/common/OpenAiCompatibleClient"

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

class TestClient extends OpenAiCompatibleClient {
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {status: 200, headers: {"content-type": "application/json"}})
}

describe("OpenAiCompatibleClient — an attachment's image content part", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("serialises a tool message as text-only, and the image_url part on the user message right after it, exactly as given", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({choices: [{message: {role: "assistant", content: "ok"}, finish_reason: "stop"}]}))
    vi.stubGlobal("fetch", fetchSpy)

    const client = new TestClient()
    const imageUrl = "data:image/png;base64,QUJD"

    await client.chat([
      {role: "user", content: "what is in this image?"},
      {role: "tool", tool_call_id: "c1", content: JSON.stringify({success: true, data: {id: "f1", name: "shot.png"}})},
      {
        role: "user",
        content: [
          {type: "text", text: 'The image from the attachment "shot.png":'},
          {type: "image_url", image_url: {url: imageUrl}},
        ],
      },
    ])

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]
    const body = JSON.parse(init.body as string)

    const toolMessage = body.messages.find((m: any) => m.role === "tool")
    expect(typeof toolMessage.content).toBe("string")

    const imageMessage = body.messages.at(-1)
    expect(imageMessage.role).toBe("user")
    expect(imageMessage.content).toEqual([
      {type: "text", text: 'The image from the attachment "shot.png":'},
      {type: "image_url", image_url: {url: imageUrl}},
    ])
  })
})
