import {AGENT_OAUTH_PATHS, agentUrls} from "../../agents/agentUrls"
import {respondAgentsNotAccepted, respondJson} from "../../agents/http/agentResponses"
import {readAgentBody} from "../../agents/http/readAgentBody"
import {registerAgentClient} from "../../agents/oauth/AgentClientRegistrationStore"
import {parseRedirectUri} from "../../agents/oauth/clientMetadata"
import {readAgentWindow} from "../../identity/ServerIdentityStore"

import type {Route, RouteContext} from "../createHttpServer"
import type {RESPONSE_SENT} from "../respond"

const GRANT_TYPES = ["authorization_code", "refresh_token"]
const RESPONSE_TYPES = ["code"]
const OPEN_WINDOW_DESCRIPTION = "Open Connect an agent in Daily's sync settings, then try again"

export const oauthRegistrationRoute: Route = {
  method: "POST",
  path: AGENT_OAUTH_PATHS.registration,
  body: "stream",
  bodyDeadlineMs: 10_000,
  handler: postRegistration,
}

async function postRegistration(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) {
    if (!ctx.req.complete) ctx.res.setHeader("connection", "close")
    return respondAgentsNotAccepted(ctx.res)
  }

  const window = readAgentWindow(ctx.store)
  if (!window) return respondRegistrationError(ctx, 403, "access_denied", OPEN_WINDOW_DESCRIPTION)

  const mediaType = ctx.req.headers["content-type"]?.split(";")[0].trim().toLowerCase()
  if (mediaType !== "application/json") {
    return respondRegistrationError(ctx, 400, "invalid_client_metadata", "The registration request must be application/json")
  }

  const maxBodyBytes = 8192
  const body = Number(ctx.req.headers["content-length"]) > maxBodyBytes ? null : await readAgentBody(ctx.req, maxBodyBytes)
  if (body === null) return respondRegistrationError(ctx, 413, "invalid_client_metadata", "The registration request body is too large")

  const fields = readMetadataObject(body)
  if (!fields) return respondRegistrationError(ctx, 400, "invalid_client_metadata", "The registration request must contain a JSON object")

  const redirectUris = fields.redirect_uris
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 8 ||
    !redirectUris.every((uri): uri is string => typeof uri === "string" && uri.length <= 2048 && parseRedirectUri(uri) !== null)
  ) {
    return respondRegistrationError(ctx, 400, "invalid_redirect_uri", "Register one to eight HTTPS or HTTP loopback redirect URIs without fragments")
  }

  const name = fields.client_name === undefined ? "Unnamed agent" : fields.client_name
  const clientName = typeof name === "string" ? name.trim() : ""
  if (!clientName || clientName.length > 100 || /\p{Cc}/u.test(clientName)) {
    return respondRegistrationError(ctx, 400, "invalid_client_metadata", "client_name must be 1 to 100 characters without control characters")
  }

  if (
    (fields.token_endpoint_auth_method !== undefined && fields.token_endpoint_auth_method !== "none") ||
    fields.client_secret !== undefined ||
    fields.client_id !== undefined
  ) {
    return respondRegistrationError(
      ctx,
      400,
      "invalid_client_metadata",
      "Daily assigns client IDs and registers public clients with no client secret",
    )
  }

  if (
    !isSupportedSelection(fields.grant_types, GRANT_TYPES, "authorization_code") ||
    !isSupportedSelection(fields.response_types, RESPONSE_TYPES, "code")
  ) {
    return respondRegistrationError(
      ctx,
      400,
      "invalid_client_metadata",
      "Daily supports the authorization code and refresh token grants with response type code",
    )
  }

  const result = registerAgentClient(ctx.store, {issuer: urls.issuer, windowId: window.id, clientName, redirectUris})
  if (!result.ok) {
    switch (result.reason) {
      case "window_closed":
        return respondRegistrationError(ctx, 403, "access_denied", OPEN_WINDOW_DESCRIPTION)
      case "window_quota":
        return respondRegistrationError(
          ctx,
          429,
          "temporarily_unavailable",
          "The connection window has reached its registration limit. Open a new window to try again",
        )
      case "rate_limited":
        return respondRegistrationError(
          ctx,
          429,
          "temporarily_unavailable",
          "Too many clients registered recently. Try again shortly",
          result.retryAfterSeconds,
        )
      case "capacity":
        return respondRegistrationError(ctx, 503, "temporarily_unavailable", "Daily has reached its client registration capacity. Try again later")
    }
  }

  return respondJson(ctx.res, 201, {
    client_id: result.client.clientId,
    client_id_issued_at: result.issuedAt,
    client_name: result.client.clientName,
    redirect_uris: result.client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: GRANT_TYPES,
    response_types: RESPONSE_TYPES,
  })
}

function readMetadataObject(body: string): Record<string, unknown> | null {
  try {
    const fields: unknown = JSON.parse(body)
    return fields !== null && typeof fields === "object" && !Array.isArray(fields) ? (fields as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function isSupportedSelection(selection: unknown, supported: string[], required: string): boolean {
  return (
    selection === undefined || (Array.isArray(selection) && selection.includes(required) && selection.every((value) => supported.includes(value)))
  )
}

function respondRegistrationError(
  ctx: RouteContext,
  status: number,
  error: string,
  description: string,
  retryAfterSeconds?: number,
): typeof RESPONSE_SENT {
  if (!ctx.req.complete) ctx.res.setHeader("connection", "close")
  if (retryAfterSeconds !== undefined) ctx.res.setHeader("retry-after", retryAfterSeconds)
  return respondJson(ctx.res, status, {error, error_description: description})
}
