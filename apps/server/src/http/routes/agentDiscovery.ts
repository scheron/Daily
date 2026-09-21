import {AGENT_ENDPOINT_PATH} from "@daily/protocol"

import {AGENT_OAUTH_PATHS, agentUrls} from "../../agents/agentUrls"
import {respondAgentsNotAccepted, respondJson} from "../../agents/http/agentResponses"

import type {Route, RouteContext} from "../createHttpServer"
import type {RESPONSE_SENT} from "../respond"

/** `GET /.well-known/oauth-protected-resource/mcp` — RFC 9728 protected resource metadata, path-suffixed for the resource a client already knows. */
export const protectedResourceMetadataRoute: Route = {
  method: "GET",
  path: `${AGENT_OAUTH_PATHS.protectedResource}${AGENT_ENDPOINT_PATH}`,
  handler: getProtectedResourceMetadata,
}

/** `GET /.well-known/oauth-protected-resource` — the same document at the resource's root, RFC 9728's fallback location. */
export const protectedResourceMetadataRootRoute: Route = {
  method: "GET",
  path: AGENT_OAUTH_PATHS.protectedResource,
  handler: getProtectedResourceMetadata,
}

/** `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata, naming CIMD and `none` so Claude chooses them over Dynamic Client Registration. */
export const authorizationServerMetadataRoute: Route = {
  method: "GET",
  path: AGENT_OAUTH_PATHS.authorizationServer,
  handler: getAuthorizationServerMetadata,
}

async function getProtectedResourceMetadata(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) return respondAgentsNotAccepted(ctx.res)

  return respondJson(ctx.res, 200, {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Daily",
  })
}

async function getAuthorizationServerMetadata(ctx: RouteContext): Promise<typeof RESPONSE_SENT> {
  const urls = agentUrls(ctx.config)
  if (!urls) return respondAgentsNotAccepted(ctx.res)

  return respondJson(ctx.res, 200, {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  })
}
