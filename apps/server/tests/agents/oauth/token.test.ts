import {describe, expect, it, vi} from "vitest"

import {AGENT_ENDPOINT_PATH} from "@daily/protocol"

import {verifyAgentAccessToken} from "../../../src/agents/oauth/AgentTokenStore"
import {
  AGENT_OAUTH_TEST_PATHS,
  authorizeApproveAndReturn,
  bootAgentServer,
  claimParent,
  claudeCodeDocument,
  connectAgent,
  enrollChild,
  exchangeCode,
  makePkcePair,
  openAgentWindowOver,
  postTokenForm,
  readAgentsList,
  refreshTokens,
  registerClientDocument,
  revokeAgentOver,
  revokeDeviceOver,
  startClientDocumentServer,
} from "./harness"

import type {BootedAgentServer, ClientDocumentServer} from "./harness"

function formBodyPaddedTo(base: Record<string, string>, targetBytes: number): string {
  let pad = 0
  for (let attempt = 0; attempt < 4; attempt++) {
    const params = new URLSearchParams({...base, _pad: "x".repeat(pad)})
    const body = params.toString()
    const size = Buffer.byteLength(body, "utf8")
    if (size === targetBytes) return body
    pad += targetBytes - size
  }
  throw new Error(`could not pad a form body to exactly ${targetBytes} bytes`)
}

async function setUp(): Promise<{booted: BootedAgentServer; docs: ClientDocumentServer; parentToken: string; clientId: string}> {
  const booted = await bootAgentServer()
  const docs = await startClientDocumentServer()
  const parent = await claimParent(booted)
  const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)

  return {booted, docs, parentToken: parent.token, clientId}
}

describe("POST /oauth/token exchanges a code for a token pair — TC-43", () => {
  it("TC-43: a valid exchange, with or without redirect_uri, answers exactly the token response shape, mints two different pairs, and stores neither plaintext", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      await openAgentWindowOver(booted, parentToken)
      const first = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})
      const firstRes = await exchangeCode(booted, {code: first.code, clientId, verifier: first.verifier, redirectUri: first.redirectUri})
      expect(firstRes.status).toBe(200)
      expect(firstRes.headers.get("cache-control")).toBe("no-store")
      const firstJson = (await firstRes.json()) as Record<string, unknown>
      expect(firstJson).toEqual({access_token: expect.any(String), token_type: "Bearer", expires_in: 3600, refresh_token: expect.any(String)})

      await openAgentWindowOver(booted, parentToken)
      const second = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})
      const secondRes = await exchangeCode(booted, {code: second.code, clientId, verifier: second.verifier})
      expect(secondRes.status).toBe(200)
      const secondJson = (await secondRes.json()) as Record<string, unknown>
      expect(secondJson).toEqual({access_token: expect.any(String), token_type: "Bearer", expires_in: 3600, refresh_token: expect.any(String)})

      expect(secondJson.access_token).not.toBe(firstJson.access_token)
      expect(secondJson.refresh_token).not.toBe(firstJson.refresh_token)

      const plaintexts = [firstJson.access_token, firstJson.refresh_token, secondJson.access_token, secondJson.refresh_token] as string[]
      const rows = booted.store.db.prepare(`SELECT access_token_hash, refresh_token_hash FROM agent_tokens`).all() as {
        access_token_hash: string
        refresh_token_hash: string
      }[]
      for (const row of rows) {
        for (const plaintext of plaintexts) {
          expect(row.access_token_hash).not.toBe(plaintext)
          expect(row.refresh_token_hash).not.toBe(plaintext)
        }
      }
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a code is refused for the usual reasons without being burned — TC-44", () => {
  it("TC-44: a wrong verifier, a mismatched client or redirect, an unknown code, and real expiry are all invalid_grant; the code still succeeds afterward", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      function mintedTokenCount(): number {
        return (booted.store.db.prepare(`SELECT COUNT(*) as n FROM agent_tokens`).get() as {n: number}).n
      }

      await openAgentWindowOver(booted, parentToken)
      const authorized = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const wrongVerifier = await exchangeCode(booted, {
        code: authorized.code,
        clientId,
        verifier: makePkcePair().verifier,
        redirectUri: authorized.redirectUri,
      })
      expect(wrongVerifier.status).toBe(400)
      expect(await wrongVerifier.json()).toMatchObject({error: "invalid_grant"})
      expect(mintedTokenCount()).toBe(0)

      const wrongClient = await exchangeCode(booted, {
        code: authorized.code,
        clientId: docs.urlFor("/other-client.json"),
        verifier: authorized.verifier,
        redirectUri: authorized.redirectUri,
      })
      expect(wrongClient.status).toBe(400)
      expect(await wrongClient.json()).toMatchObject({error: "invalid_grant"})
      expect(mintedTokenCount()).toBe(0)

      const wrongRedirect = await exchangeCode(booted, {
        code: authorized.code,
        clientId,
        verifier: authorized.verifier,
        redirectUri: "http://localhost:1/callback",
      })
      expect(wrongRedirect.status).toBe(400)
      expect(await wrongRedirect.json()).toMatchObject({error: "invalid_grant"})
      expect(mintedTokenCount()).toBe(0)

      await openAgentWindowOver(booted, parentToken)
      const toExpire = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      vi.useFakeTimers({toFake: ["Date"]})
      try {
        vi.setSystemTime(new Date(Date.now() + 61_000))
        const expired = await exchangeCode(booted, {code: toExpire.code, clientId, verifier: toExpire.verifier, redirectUri: toExpire.redirectUri})
        expect(expired.status).toBe(400)
        expect(await expired.json()).toMatchObject({error: "invalid_grant"})
      } finally {
        vi.useRealTimers()
      }
      expect(mintedTokenCount()).toBe(0)

      const unknownCode = await exchangeCode(booted, {
        code: "not-a-real-code",
        clientId,
        verifier: authorized.verifier,
        redirectUri: authorized.redirectUri,
      })
      expect(unknownCode.status).toBe(400)
      expect(await unknownCode.json()).toMatchObject({error: "invalid_grant"})
      expect(mintedTokenCount()).toBe(0)

      const success = await exchangeCode(booted, {
        code: authorized.code,
        clientId,
        verifier: authorized.verifier,
        redirectUri: authorized.redirectUri,
      })
      expect(success.status).toBe(200)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("an otherwise-invalid replay of a used code only refuses; an otherwise-valid one revokes — TC-45", () => {
  it("TC-45: replaying a used code with a wrong verifier leaves the agent active; replaying it correctly revokes it, killing its access and refresh tokens", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      const resource = `${booted.issuer}${AGENT_ENDPOINT_PATH}`
      await openAgentWindowOver(booted, parentToken)
      const connected = await connectAgent(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const wrongVerifierReplay = await exchangeCode(booted, {
        code: connected.code,
        clientId,
        verifier: makePkcePair().verifier,
        redirectUri: connected.redirectUri,
      })
      expect(wrongVerifierReplay.status).toBe(400)
      expect(await wrongVerifierReplay.json()).toMatchObject({error: "invalid_grant"})

      const stillActive = await readAgentsList(booted, parentToken)
      expect(stillActive.agents.every((agent) => agent.revokedAt === null)).toBe(true)
      expect(verifyAgentAccessToken(booted.store, connected.accessToken, resource)).not.toBeNull()

      const correctReplay = await exchangeCode(booted, {
        code: connected.code,
        clientId,
        verifier: connected.verifier,
        redirectUri: connected.redirectUri,
      })
      expect(correctReplay.status).toBe(400)
      expect(await correctReplay.json()).toMatchObject({error: "invalid_grant"})

      const afterRevoke = await readAgentsList(booted, parentToken)
      expect(afterRevoke.agents.find((agent) => agent.revokedAt !== null)).toBeTruthy()
      expect(verifyAgentAccessToken(booted.store, connected.accessToken, resource)).toBeNull()

      const refreshRefused = await refreshTokens(booted, {refreshToken: connected.refreshToken, clientId})
      expect(refreshRefused.status).toBe(400)
      expect(await refreshRefused.json()).toMatchObject({error: "invalid_grant"})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("refreshing rotates the pair, and the previous access token keeps working until its own hour is up — TC-46", () => {
  it("TC-46: each refresh answers a new, different pair; a superseded access token still verifies; the oldest one dies exactly at its own hour", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      const resource = `${booted.issuer}${AGENT_ENDPOINT_PATH}`
      await openAgentWindowOver(booted, parentToken)
      const connected = await connectAgent(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const firstRefresh = await refreshTokens(booted, {refreshToken: connected.refreshToken, clientId})
      expect(firstRefresh.status).toBe(200)
      const pairA2 = (await firstRefresh.json()) as {access_token: string; refresh_token: string}
      expect(pairA2.access_token).not.toBe(connected.accessToken)
      expect(pairA2.refresh_token).not.toBe(connected.refreshToken)

      const secondRefresh = await refreshTokens(booted, {refreshToken: pairA2.refresh_token, clientId})
      expect(secondRefresh.status).toBe(200)
      const pairA3 = (await secondRefresh.json()) as {access_token: string; refresh_token: string}
      expect(pairA3.access_token).not.toBe(pairA2.access_token)
      expect(pairA3.refresh_token).not.toBe(pairA2.refresh_token)

      expect(verifyAgentAccessToken(booted.store, pairA2.access_token, resource)).not.toBeNull()

      vi.useFakeTimers({toFake: ["Date"]})
      try {
        vi.setSystemTime(new Date(Date.now() + 59 * 60_000))
        expect(verifyAgentAccessToken(booted.store, connected.accessToken, resource)).not.toBeNull()

        vi.setSystemTime(new Date(Date.now() + 2 * 60_000))
        expect(verifyAgentAccessToken(booted.store, connected.accessToken, resource)).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("presenting an already-rotated refresh token revokes the agent — TC-47", () => {
  it("TC-47: replaying a rotated refresh token revokes the agent, stopping the newer refresh token and its access token too", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      const resource = `${booted.issuer}${AGENT_ENDPOINT_PATH}`
      await openAgentWindowOver(booted, parentToken)
      const connected = await connectAgent(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const rotated = await refreshTokens(booted, {refreshToken: connected.refreshToken, clientId})
      expect(rotated.status).toBe(200)
      const pairA2 = (await rotated.json()) as {access_token: string; refresh_token: string}

      const replay = await refreshTokens(booted, {refreshToken: connected.refreshToken, clientId})
      expect(replay.status).toBe(400)
      expect(await replay.json()).toMatchObject({error: "invalid_grant"})

      const agents = await readAgentsList(booted, parentToken)
      expect(agents.agents.find((agent) => agent.revokedAt !== null)).toBeTruthy()

      const r2Refused = await refreshTokens(booted, {refreshToken: pairA2.refresh_token, clientId})
      expect(r2Refused.status).toBe(400)
      expect(await r2Refused.json()).toMatchObject({error: "invalid_grant"})

      expect(verifyAgentAccessToken(booted.store, pairA2.access_token, resource)).toBeNull()
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("an unknown or mismatched refresh token refuses without revoking; a Mac's own credential opens nothing — TC-48", () => {
  it("TC-48: an unknown token and a wrong client_id both refuse without revoking; no client_id is accepted; a Mac's device token is refused", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      await openAgentWindowOver(booted, parentToken)
      const connected = await connectAgent(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const unknownToken = await refreshTokens(booted, {refreshToken: "not-a-real-refresh-token", clientId})
      expect(unknownToken.status).toBe(400)
      expect(await unknownToken.json()).toMatchObject({error: "invalid_grant"})
      expect((await readAgentsList(booted, parentToken)).agents.every((agent) => agent.revokedAt === null)).toBe(true)

      const wrongClient = await refreshTokens(booted, {refreshToken: connected.refreshToken, clientId: docs.urlFor("/other-client.json")})
      expect(wrongClient.status).toBe(400)
      expect(await wrongClient.json()).toMatchObject({error: "invalid_grant"})
      expect((await readAgentsList(booted, parentToken)).agents.every((agent) => agent.revokedAt === null)).toBe(true)

      const noClient = await refreshTokens(booted, {refreshToken: connected.refreshToken})
      expect(noClient.status).toBe(200)
      expect(await noClient.json()).toEqual({
        access_token: expect.any(String),
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: expect.any(String),
      })

      const macCredential = await refreshTokens(booted, {refreshToken: parentToken, clientId})
      expect(macCredential.status).toBe(400)
      expect(await macCredential.json()).toMatchObject({error: "invalid_grant"})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("revoking an agent or its whole Mac both stop its refresh — TC-49", () => {
  it("TC-49: revoking one agent stops only its own refresh; revoking its Mac stops the other agent it owns", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      const child = await enrollChild(booted)

      await openAgentWindowOver(booted, child.token)
      const connectedAC = await connectAgent(booted, child.token, {clientId, redirectUri: "http://localhost:5555/callback"})
      const agentsAfterAC = await readAgentsList(booted, child.token)
      const agentAC = agentsAfterAC.agents.find((agent) => agent.revokedAt === null)
      if (!agentAC) throw new Error("expected agent AC to be listed")

      await openAgentWindowOver(booted, child.token)
      const connectedAD = await connectAgent(booted, child.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      const revokeAC = await revokeAgentOver(booted, parentToken, agentAC.id)
      expect(revokeAC.status).toBe(200)

      const acRefreshed = await refreshTokens(booted, {refreshToken: connectedAC.refreshToken, clientId})
      expect(acRefreshed.status).toBe(400)
      expect(await acRefreshed.json()).toMatchObject({error: "invalid_grant"})

      const revokeC = await revokeDeviceOver(booted, parentToken, child.deviceId)
      expect(revokeC.status).toBe(200)

      const adRefreshed = await refreshTokens(booted, {refreshToken: connectedAD.refreshToken, clientId})
      expect(adRefreshed.status).toBe(400)
      expect(await adRefreshed.json()).toMatchObject({error: "invalid_grant"})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("the token endpoint's own shape checks — TC-50", () => {
  it("TC-50: a wrong content type, a missing, unsupported, repeated or oversized field, and an out-of-scope resource all refuse without burning a code; an unknown parameter is ignored, and a repeated-but-matching or omitted resource are both accepted", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      const resource = `${booted.issuer}${AGENT_ENDPOINT_PATH}`

      async function freshAuthorized() {
        await openAgentWindowOver(booted, parentToken)
        return authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})
      }

      const reusable = await freshAuthorized()

      const otherwiseValidAttempt = await freshAuthorized()
      const wrongContentType = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.token}`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: otherwiseValidAttempt.code,
          client_id: clientId,
          code_verifier: otherwiseValidAttempt.verifier,
          redirect_uri: otherwiseValidAttempt.redirectUri,
          resource,
        }).toString(),
      })
      expect(wrongContentType.status).toBe(400)
      expect(await wrongContentType.json()).toMatchObject({error: "invalid_request"})

      const noGrantType = await postTokenForm(booted, {code: reusable.code, client_id: clientId, code_verifier: reusable.verifier})
      expect(noGrantType.status).toBe(400)
      expect(await noGrantType.json()).toMatchObject({error: "invalid_request"})

      const unsupportedGrant = await postTokenForm(booted, {grant_type: "client_credentials", code: reusable.code})
      expect(unsupportedGrant.status).toBe(400)
      expect(await unsupportedGrant.json()).toMatchObject({error: "unsupported_grant_type"})

      const noCode = await postTokenForm(booted, {grant_type: "authorization_code", client_id: clientId, code_verifier: reusable.verifier})
      expect(noCode.status).toBe(400)
      expect(await noCode.json()).toMatchObject({error: "invalid_request"})

      const repeatedCode = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: [reusable.code, reusable.code],
        client_id: clientId,
        code_verifier: reusable.verifier,
      })
      expect(repeatedCode.status).toBe(400)
      expect(await repeatedCode.json()).toMatchObject({error: "invalid_request"})

      const emptyCode = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: "",
        client_id: clientId,
        code_verifier: reusable.verifier,
      })
      expect(emptyCode.status).toBe(400)
      expect(await emptyCode.json()).toMatchObject({error: "invalid_request"})

      const oversizedBody = formBodyPaddedTo({grant_type: "authorization_code", code: reusable.code}, 8193)
      const oversized = await fetch(`${booted.baseUrl}${AGENT_OAUTH_TEST_PATHS.token}`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: oversizedBody,
      })
      expect(oversized.status).toBe(413)
      expect(await oversized.json()).toMatchObject({error: "invalid_request"})

      const outOfScopeResource = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: reusable.code,
        client_id: clientId,
        code_verifier: reusable.verifier,
        redirect_uri: reusable.redirectUri,
        resource: "https://other.example/mcp",
      })
      expect(outOfScopeResource.status).toBe(400)
      expect(await outOfScopeResource.json()).toMatchObject({error: "invalid_target"})

      const withExtraParam = await freshAuthorized()
      const extraParamRes = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: withExtraParam.code,
        client_id: clientId,
        code_verifier: withExtraParam.verifier,
        redirect_uri: withExtraParam.redirectUri,
        resource,
        some_unknown_parameter: "x",
      })
      expect(extraParamRes.status).toBe(200)

      const withRepeatedResource = await freshAuthorized()
      const repeatedResourceRes = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: withRepeatedResource.code,
        client_id: clientId,
        code_verifier: withRepeatedResource.verifier,
        redirect_uri: withRepeatedResource.redirectUri,
        resource: [resource, resource],
      })
      expect(repeatedResourceRes.status).toBe(200)

      const withNoResource = await freshAuthorized()
      const noResourceRes = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: withNoResource.code,
        client_id: clientId,
        code_verifier: withNoResource.verifier,
        redirect_uri: withNoResource.redirectUri,
      })
      expect(noResourceRes.status).toBe(200)

      const finalSuccess = await exchangeCode(booted, {code: reusable.code, clientId, verifier: reusable.verifier, redirectUri: reusable.redirectUri})
      expect(finalSuccess.status).toBe(200)
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a moved public address strands whatever it minted before — TC-51", () => {
  it("TC-51: reopening the same data directory at a different public address refuses that pair's refresh, and its access token no longer verifies for the new address", async () => {
    const atX = await bootAgentServer({}, {deleteDataDirOnClose: false})
    const docs = await startClientDocumentServer()
    let atY: BootedAgentServer | null = null

    try {
      const parent = await claimParent(atX)
      await openAgentWindowOver(atX, parent.token)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const connected = await connectAgent(atX, parent.token, {clientId, redirectUri: "http://localhost/callback"})

      const dataDir = atX.dataDir
      await atX.close()

      atY = await bootAgentServer({dataDir, publicUrl: "https://y.example.com"})

      const refreshAtY = await refreshTokens(atY, {refreshToken: connected.refreshToken, clientId})
      expect(refreshAtY.status).toBe(400)
      expect(await refreshAtY.json()).toMatchObject({error: "invalid_grant"})

      expect(verifyAgentAccessToken(atY.store, connected.accessToken, `https://y.example.com${AGENT_ENDPOINT_PATH}`)).toBeNull()
    } finally {
      await docs.close()
      if (atY) await atY.close()
      else await atX.close()
    }
  })
})

describe("a code exchanges only for the resource it was issued for", () => {
  it("a code issued at one public address is invalid_grant once the same data directory serves another, and mints nothing", async () => {
    const atX = await bootAgentServer({}, {deleteDataDirOnClose: false})
    const docs = await startClientDocumentServer()
    let atY: BootedAgentServer | null = null

    try {
      const parent = await claimParent(atX)
      await openAgentWindowOver(atX, parent.token)
      const clientId = registerClientDocument(docs, "/claude-code.json", claudeCodeDocument)
      const authorized = await authorizeApproveAndReturn(atX, parent.token, {clientId, redirectUri: "http://localhost:5555/callback"})

      const dataDir = atX.dataDir
      await atX.close()

      atY = await bootAgentServer({dataDir, publicUrl: "https://y.example.com"})

      const exchangeAtY = await exchangeCode(atY, {
        code: authorized.code,
        clientId,
        verifier: authorized.verifier,
        redirectUri: authorized.redirectUri,
      })
      expect(exchangeAtY.status).toBe(400)
      expect(await exchangeAtY.json()).toMatchObject({error: "invalid_grant"})
      expect((atY.store.db.prepare(`SELECT COUNT(*) as n FROM agent_tokens`).get() as {n: number}).n).toBe(0)
    } finally {
      await docs.close()
      if (atY) await atY.close()
      else await atX.close()
    }
  })
})

describe("the token endpoint refuses a resource list that names any other resource", () => {
  it("this server's resource beside another one is invalid_target", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      await openAgentWindowOver(booted, parentToken)
      const authorized = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const mixedResource = await exchangeCode(booted, {
        code: authorized.code,
        clientId,
        verifier: authorized.verifier,
        redirectUri: authorized.redirectUri,
        resource: [`${booted.issuer}${AGENT_ENDPOINT_PATH}`, "https://other.example/mcp"],
      })
      expect(mixedResource.status).toBe(400)
      expect(await mixedResource.json()).toMatchObject({error: "invalid_target"})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("a code exchange must name its client", () => {
  it("an otherwise valid authorization_code grant with no client_id is invalid_request", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      await openAgentWindowOver(booted, parentToken)
      const authorized = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const noClient = await postTokenForm(booted, {
        grant_type: "authorization_code",
        code: authorized.code,
        code_verifier: authorized.verifier,
        redirect_uri: authorized.redirectUri,
        resource: `${booted.issuer}${AGENT_ENDPOINT_PATH}`,
      })
      expect(noClient.status).toBe(400)
      expect(await noClient.json()).toMatchObject({error: "invalid_request"})
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})

describe("an empty resource counts as absent at the token endpoint", () => {
  it("an otherwise valid exchange carrying resource= succeeds, its access token bound to this server's own resource", async () => {
    const {booted, docs, parentToken, clientId} = await setUp()
    try {
      await openAgentWindowOver(booted, parentToken)
      const authorized = await authorizeApproveAndReturn(booted, parentToken, {clientId, redirectUri: "http://localhost:5555/callback"})

      const emptyResource = await exchangeCode(booted, {
        code: authorized.code,
        clientId,
        verifier: authorized.verifier,
        redirectUri: authorized.redirectUri,
        resource: "",
      })
      expect(emptyResource.status).toBe(200)
      const {access_token: accessToken} = (await emptyResource.json()) as {access_token: string}
      expect(verifyAgentAccessToken(booted.store, accessToken, `${booted.issuer}${AGENT_ENDPOINT_PATH}`)).not.toBeNull()
    } finally {
      await docs.close()
      await booted.close()
    }
  })
})
