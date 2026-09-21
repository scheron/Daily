import {AGENT_OAUTH_PATHS, agentUrls, isAgentResource} from "../../agents/agentUrls"
import {respondAgentsNotAccepted, respondJson} from "../../agents/http/agentResponses"
import {readAgentBody} from "../../agents/http/readAgentBody"
import {exchangeAuthorizationCode, refreshAgentTokens} from "../../agents/oauth/AgentTokenStore"

import type {ServerResponse} from "node:http"
import type {AgentTokenOutcome} from "../../agents/oauth/AgentTokenStore"
import type {Route, RouteContext} from "../createHttpServer"
import type {RESPONSE_SENT} from "../respond"

/**
 * `POST /oauth/token` — exchanges an authorization code under PKCE, and rotates a refresh token on
 * every use. Its body is form-urlencoded, so the route reads it itself; every answer is JSON outside
 * the protocol envelope, sent `no-store`, and every refusal carries OAuth's `error` code.
 */
export const oauthTokenRoute: Route = {
  method: "POST",
  path: AGENT_OAUTH_PATHS.token,
  body: "stream",
  handler: postToken,
}

async function postToken(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) return respondAgentsNotAccepted(ctx.res)

  const mediaType = ctx.req.headers["content-type"]?.split(";")[0].trim().toLowerCase()
  if (mediaType !== "application/x-www-form-urlencoded") {
    return respondTokenError(ctx.res, 400, "invalid_request", "The token request must be application/x-www-form-urlencoded")
  }

  const body = await readAgentBody(ctx.req, 8192)
  if (body === null) return respondTokenError(ctx.res, 413, "invalid_request", "The token request body is too large")

  const params = new URLSearchParams([...new URLSearchParams(body)].filter(([, value]) => value !== ""))
  const repeated = [...new Set(params.keys())].find((name) => name !== "resource" && params.getAll(name).length > 1)
  if (repeated) return respondTokenError(ctx.res, 400, "invalid_request", `${repeated} must not be repeated`)

  const grantType = params.get("grant_type")
  if (!grantType) return respondTokenError(ctx.res, 400, "invalid_request", "grant_type is required")
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return respondTokenError(ctx.res, 400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported")
  }

  if (params.getAll("resource").some((value) => !isAgentResource(urls, value))) {
    return respondTokenError(ctx.res, 400, "invalid_target", `This server serves only ${urls.resource}`)
  }

  let outcome: AgentTokenOutcome
  if (grantType === "authorization_code") {
    const code = params.get("code")
    const clientId = params.get("client_id")
    const codeVerifier = params.get("code_verifier")
    if (!code || !clientId || !codeVerifier) {
      return respondTokenError(ctx.res, 400, "invalid_request", "code, client_id and code_verifier are required")
    }

    outcome = exchangeAuthorizationCode(ctx.store, {code, clientId, redirectUri: params.get("redirect_uri"), codeVerifier}, urls.resource)
  } else {
    const refreshToken = params.get("refresh_token")
    if (!refreshToken) return respondTokenError(ctx.res, 400, "invalid_request", "refresh_token is required")

    outcome = refreshAgentTokens(ctx.store, {refreshToken, clientId: params.get("client_id")}, urls.resource)
  }

  if (!outcome.ok) return respondTokenError(ctx.res, 400, "invalid_grant", outcome.description)

  return respondJson(ctx.res, 200, {
    access_token: outcome.grant.accessToken,
    token_type: "Bearer",
    expires_in: outcome.grant.expiresIn,
    refresh_token: outcome.grant.refreshToken,
  })
}

function respondTokenError(res: ServerResponse, status: number, error: string, description: string): typeof RESPONSE_SENT {
  return respondJson(res, status, {error, error_description: description})
}
