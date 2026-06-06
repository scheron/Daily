// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {readFile, stat} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {downloadWithProgress} from "@main/utils/files/downloadWithProgress"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), CONTEXT: {AI: "AI"}},
}))

function makeResponse(body: Buffer, opts: {status?: number; headers?: Record<string, string>} = {}) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(body)
      controller.close()
    },
  })
  return new Response(stream, {
    status: opts.status ?? 200,
    headers: {"content-length": String(body.byteLength), ...opts.headers},
  })
}

describe("downloadWithProgress", () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dl-"))
  })

  it("downloads and renames partial to final on success", async () => {
    const body = Buffer.from("hello world")
    const dest = join(tmp, "out.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(body)))

    const phases: string[] = []
    await downloadWithProgress({
      url: "https://example/x",
      destPath: dest,
      onProgress: (_d, _t, phase) => {
        if (!phases.includes(phase)) phases.push(phase)
      },
    })

    expect((await readFile(dest)).toString()).toBe("hello world")
    expect(phases).toContain("downloading")
    rmSync(tmp, {recursive: true, force: true})
  })

  it("verifies sha256 and renames on success", async () => {
    const body = Buffer.from("verify-me")
    const {createHash} = await import("node:crypto")
    const expected = createHash("sha256").update(body).digest("hex")

    const dest = join(tmp, "v.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(body)))

    const phases: string[] = []
    await downloadWithProgress({
      url: "https://example/v",
      destPath: dest,
      sha256: expected,
      onProgress: (_d, _t, phase) => phases.push(phase),
    })

    expect(await stat(dest)).toBeTruthy()
    expect(phases).toContain("verifying")
    rmSync(tmp, {recursive: true, force: true})
  })

  it("throws and removes partial on sha256 mismatch", async () => {
    const body = Buffer.from("mismatch")
    const dest = join(tmp, "m.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(body)))

    await expect(
      downloadWithProgress({
        url: "https://example/m",
        destPath: dest,
        sha256: "0".repeat(64),
        onProgress: () => {},
      }),
    ).rejects.toThrow(/checksum mismatch/i)

    await expect(stat(dest)).rejects.toThrow()
    await expect(stat(`${dest}.download`)).rejects.toThrow()
    rmSync(tmp, {recursive: true, force: true})
  })

  it("throws on non-2xx HTTP status", async () => {
    const dest = join(tmp, "x.bin")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status: 404, statusText: "Not Found"})))
    await expect(downloadWithProgress({url: "https://example/x", destPath: dest, onProgress: () => {}})).rejects.toThrow(/404/)
    rmSync(tmp, {recursive: true, force: true})
  })

  it("resumes from existing .download partial via Range header", async () => {
    const {writeFileSync} = await import("node:fs")
    const total = Buffer.from("0123456789ABCDEFGHIJ") // 20 bytes
    const partial = total.slice(0, 12)
    const remainder = total.slice(12)

    const dest = join(tmp, "r.bin")
    writeFileSync(`${dest}.download`, partial)

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(remainder)
            c.close()
          },
        }),
        {
          status: 206,
          headers: {"content-length": String(remainder.byteLength), "content-range": `bytes 12-19/${total.byteLength}`},
        },
      ),
    )
    vi.stubGlobal("fetch", fetchSpy)

    await downloadWithProgress({
      url: "https://example/r",
      destPath: dest,
      onProgress: () => {},
    })

    expect((await readFile(dest)).toString()).toBe(total.toString())
    const callArgs = fetchSpy.mock.calls[0][1]
    expect(callArgs.headers.Range).toBe("bytes=12-")
    rmSync(tmp, {recursive: true, force: true})
  })

  it("falls back to fresh download on 416 (range not satisfiable)", async () => {
    const {writeFileSync} = await import("node:fs")
    const total = Buffer.from("abcdef")
    const dest = join(tmp, "f.bin")
    writeFileSync(`${dest}.download`, Buffer.from("zzzzzzzz"))

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {status: 416}))
      .mockResolvedValueOnce(makeResponse(total))
    vi.stubGlobal("fetch", fetchSpy)

    await downloadWithProgress({
      url: "https://example/f",
      destPath: dest,
      onProgress: () => {},
    })

    expect((await readFile(dest)).toString()).toBe("abcdef")
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    rmSync(tmp, {recursive: true, force: true})
  })
})
