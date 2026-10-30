import assert from "node:assert/strict"
import {createHash, randomBytes} from "node:crypto"
import {createServer} from "node:http"
import {setTimeout} from "node:timers/promises"

const issuer = "http://127.0.0.1:18787"
const clientOrigin = "http://127.0.0.1:18788"
const clientId = `${clientOrigin}/client.json`
const redirectUri = `${clientOrigin}/callback`
const verifier = randomBytes(32).toString("base64url")
const challenge = createHash("sha256").update(verifier).digest("base64url")
const state = randomBytes(16).toString("base64url")
const taskId = "task:demo-agent-review"
const metadata = {
  client_id: clientId,
  client_name: "Daily Demo Client",
  redirect_uris: [redirectUri],
  grant_types: ["authorization_code"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
}

const server = createServer((request, response) => {
  if (request.url === "/client.json") {
    response.writeHead(200, {"content-type": "application/json", "cache-control": "no-store"})
    response.end(JSON.stringify(metadata))
    return
  }
  response.writeHead(404)
  response.end()
})

await new Promise((resolve, reject) => {
  server.once("error", reject)
  server.listen(18788, "127.0.0.1", resolve)
})

try {
  const identity = await (await fetch(`${issuer}/v1/server`)).json()
  assert.equal(identity.data?.name, "Orbit Demo Server", "This helper only connects to the isolated Orbit Demo Server.")
  const authorizeUrl = new URL(`${issuer}/oauth/authorize`)
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    resource: `${issuer}/mcp`,
  }).toString()

  const authorization = await fetch(authorizeUrl, {redirect: "manual"})
  assert.equal(authorization.status, 303, "Open Connect an agent in Daily Demo before running this client.")
  const consentUrl = new URL(authorization.headers.get("location"), issuer)
  assert.equal(consentUrl.pathname, "/oauth/consent")
  const initialConsent = await fetch(consentUrl, {redirect: "manual"})
  let returnUrl = initialConsent.status === 303 ? new URL(initialConsent.headers.get("location")) : null
  const consentPage = await initialConsent.text()
  const matchingCode = consentPage.match(/class="bcode">(\d{3} \d{3})</)?.[1]
  console.log("Daily Demo Client requested access. Approve its matching code in Daily Demo.")
  if (matchingCode) console.log(`Matching code: ${matchingCode}`)
  console.log(`Consent page: ${consentUrl.href}`)

  const deadline = Date.now() + 5 * 60_000
  while (!returnUrl && Date.now() < deadline) {
    const statusUrl = new URL(`${issuer}/oauth/consent/status`)
    statusUrl.searchParams.set("id", consentUrl.searchParams.get("id"))
    const statusResponse = await (await fetch(statusUrl)).json()
    const status = statusResponse.data ?? statusResponse
    if (!status.pending) {
      const consent = await fetch(consentUrl, {redirect: "manual"})
      assert.equal(consent.status, 303, "The demo client request was denied or expired.")
      returnUrl = new URL(consent.headers.get("location"))
      break
    }
    await setTimeout(1000)
  }

  assert(returnUrl, "The demo client approval timed out.")
  assert.equal(returnUrl.searchParams.get("state"), state)
  assert.equal(returnUrl.searchParams.get("iss"), issuer)
  const code = returnUrl.searchParams.get("code")
  assert(code, "No OAuth authorization code was returned.")

  const tokenResponse = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: `${issuer}/mcp`,
    }),
  })
  assert.equal(tokenResponse.status, 200, "The OAuth token exchange failed.")
  const grant = await tokenResponse.json()
  assert.equal(typeof grant.access_token, "string")

  let requestId = 0
  async function mcp(method, params) {
    const response = await fetch(`${issuer}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${grant.access_token}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({jsonrpc: "2.0", id: ++requestId, method, params}),
    })
    assert.equal(response.status, 200, `MCP ${method} failed.`)
    const reply = await response.json()
    assert(!reply.error, JSON.stringify(reply.error))
    assert(!reply.result.isError, JSON.stringify(reply.result))
    return reply.result
  }

  const initialized = await mcp("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: {name: "Daily Demo Client", version: "1.0.0"},
  })
  const tools = await mcp("tools/list", {})
  console.log(`Connected to ${initialized.serverInfo.name}; ${tools.tools.length} MCP tools available.`)

  const taskResult = await mcp("tools/call", {name: "get_task", arguments: {id: taskId}})
  const task = JSON.parse(taskResult.content.find((item) => item.type === "text").text)
  assert(task.id === taskId && task.projectName === "Orbit", "The fictional agent review task must be synced to the demo server first.")
  const comment = await mcp("tools/call", {
    name: "save_comment",
    arguments: {
      taskId,
      content: [
        "## Keyboard review notes",
        "",
        "Keep the selected result **visible** and return focus to the project picker when search closes.",
        "",
        "```ts",
        "const nextIndex = Math.min(",
        "  activeIndex + 1,",
        "  results.length - 1,",
        ")",
        "```",
        "",
        "- Review Arrow keys, Enter, and Escape.",
        "- Check empty results and long project names.",
        "- Keep review decisions beside the task.",
        "",
        "*A fictional review note sent through the real MCP connection by Daily Demo Client.*",
      ].join("\n"),
    },
  })
  assert(comment.content.some((item) => item.type === "text"))
  console.log("Published one fictional Markdown review comment through MCP as Daily Demo Client.")
  console.log("OAuth credentials remained in memory and were not written to disk.")
} finally {
  server.close()
}
