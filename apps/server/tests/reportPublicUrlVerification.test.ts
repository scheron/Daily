import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {reportPublicUrlVerification} from "../src/commands/start"
import {verifyPublicUrl} from "../src/verify/verifyPublicUrl"

import type {ServerConfig} from "../src/config/resolveServerConfig"

vi.mock("../src/verify/verifyPublicUrl", () => ({verifyPublicUrl: vi.fn()}))

const verifyPublicUrlMock = vi.mocked(verifyPublicUrl)

describe("reportPublicUrlVerification", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    verifyPublicUrlMock.mockReset()
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  function config(overrides: Partial<ServerConfig>): ServerConfig {
    return {
      host: "0.0.0.0",
      port: 8787,
      dataDir: "/tmp/does-not-matter",
      tls: null,
      maxAssetBytes: 1,
      maxSnapshotBodyBytes: 1,
      publicUrl: null,
      transport: "plain",
      ...overrides,
    }
  }

  it("skips the check and logs that it did, without calling verifyPublicUrl, when publicUrl is null", () => {
    reportPublicUrlVerification(config({publicUrl: null}), "server-id")

    expect(verifyPublicUrlMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("not set"))
  })

  it("passes allowSelfSigned=false for the plain transport", () => {
    verifyPublicUrlMock.mockResolvedValue({serverId: "server-id", protocol: 1, claimed: false})

    reportPublicUrlVerification(config({publicUrl: "http://example.test", transport: "plain"}), "server-id")

    expect(verifyPublicUrlMock).toHaveBeenCalledWith("http://example.test", "server-id", false)
  })

  it("passes allowSelfSigned=false for the own-certificate transport", () => {
    verifyPublicUrlMock.mockResolvedValue({serverId: "server-id", protocol: 1, claimed: false})

    reportPublicUrlVerification(config({publicUrl: "https://example.test", transport: "own-certificate"}), "server-id")

    expect(verifyPublicUrlMock).toHaveBeenCalledWith("https://example.test", "server-id", false)
  })

  it("passes allowSelfSigned=true for the self-signed transport", () => {
    verifyPublicUrlMock.mockResolvedValue({serverId: "server-id", protocol: 1, claimed: false})

    reportPublicUrlVerification(config({publicUrl: "https://example.test", transport: "self-signed"}), "server-id")

    expect(verifyPublicUrlMock).toHaveBeenCalledWith("https://example.test", "server-id", true)
  })

  it("logs a confirming line once the check resolves, without blocking the caller", async () => {
    verifyPublicUrlMock.mockResolvedValue({serverId: "server-id", protocol: 1, claimed: false})

    reportPublicUrlVerification(config({publicUrl: "https://example.test", transport: "plain"}), "server-id")

    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("https://example.test"))
    })
  })

  it("logs the failure reason once the check rejects, without throwing", async () => {
    verifyPublicUrlMock.mockRejectedValue(new Error("could not reach it: connection refused"))

    reportPublicUrlVerification(config({publicUrl: "https://example.test", transport: "plain"}), "server-id")

    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("could not reach it: connection refused"))
    })
  })

  it("names the reverse-proxy case beside the first failure, so a first start behind an unwired proxy does not read as breakage", async () => {
    verifyPublicUrlMock.mockRejectedValue(new Error("connect ECONNREFUSED"))

    reportPublicUrlVerification(config({publicUrl: "https://daily.example.com", transport: "plain"}), "server-id")

    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("reverse proxy"))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("daily-server verify"))
    })
  })
})

describe("reportPublicUrlVerification — retrying a failed address", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    verifyPublicUrlMock.mockReset()
  })

  afterEach(() => {
    logSpy.mockRestore()
    vi.useRealTimers()
  })

  function retryConfig(): ServerConfig {
    return {
      host: "0.0.0.0",
      port: 8787,
      dataDir: "/tmp/does-not-matter",
      tls: null,
      maxAssetBytes: 1,
      maxSnapshotBodyBytes: 1,
      publicUrl: "https://daily.example.com",
      transport: "plain",
    }
  }

  it("turns the first failure into a confirmation once the proxy answers, with no restart", async () => {
    verifyPublicUrlMock
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValue({serverId: "server-id", protocol: 1, claimed: false})

    reportPublicUrlVerification(retryConfig(), "server-id")
    await vi.advanceTimersByTimeAsync(1)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("verification failed"))
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Public address verified"))

    await vi.advanceTimersByTimeAsync(30_000)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Public address verified: https://daily.example.com"))
    expect(verifyPublicUrlMock).toHaveBeenCalledTimes(2)
  })

  it("says the failure and the hint once, however many retries it takes", async () => {
    verifyPublicUrlMock
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValue({serverId: "server-id", protocol: 1, claimed: false})

    reportPublicUrlVerification(retryConfig(), "server-id")
    await vi.advanceTimersByTimeAsync(60_001)

    const failures = logSpy.mock.calls.filter(([line]) => String(line).includes("verification failed"))
    const hints = logSpy.mock.calls.filter(([line]) => String(line).includes("reverse proxy"))
    expect(failures).toHaveLength(1)
    expect(hints).toHaveLength(1)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Public address verified"))
  })

  it("gives up after ten minutes and says how to re-check, instead of retrying for the life of the process", async () => {
    verifyPublicUrlMock.mockRejectedValue(new Error("connect ECONNREFUSED"))

    reportPublicUrlVerification(retryConfig(), "server-id")
    await vi.advanceTimersByTimeAsync(11 * 60_000)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("still unverified after 10 minutes"))

    const callsAtGiveUp = verifyPublicUrlMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(verifyPublicUrlMock).toHaveBeenCalledTimes(callsAtGiveUp)
  })
})
