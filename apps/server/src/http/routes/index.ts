import {authorizationServerMetadataRoute, protectedResourceMetadataRootRoute, protectedResourceMetadataRoute} from "./agentDiscovery"
import {
  agentApproveRoute,
  agentDenyRoute,
  agentPendingRoute,
  agentRevokeRoute,
  agentsRoute,
  agentWindowCloseRoute,
  agentWindowOpenRoute,
} from "./agents"
import {assetDownloadRoute, assetsManifestRoute, assetUploadRoute} from "./assets"
import {claimRoute} from "./claim"
import {deviceRevokeRoute, devicesRoute} from "./devices"
import {
  enrollApproveRoute,
  enrollConsoleRoute,
  enrollDenyRoute,
  enrollPendingRoute,
  enrollRequestRoute,
  enrollStatusRoute,
  enrollWindowCloseRoute,
  enrollWindowOpenRoute,
} from "./enroll"
import {healthRoute} from "./health"
import {mcpRoute} from "./mcp"
import {oauthAuthorizeRoute, oauthConsentRoute} from "./oauthAuthorize"
import {oauthTokenRoute} from "./oauthToken"
import {serverInfoRoute} from "./serverInfo"
import {revisionRoute, snapshotReadRoute, snapshotWriteRoute} from "./snapshot"

import type {Route} from "../createHttpServer"

/** The server's one route table: the Daily Sync Protocol's routes, then the agent endpoints' OAuth and MCP routes, which are not part of the protocol. Later phases append routes here; there is no second table. */
export const routes: Route[] = [
  healthRoute,
  serverInfoRoute,
  claimRoute,
  enrollRequestRoute,
  enrollStatusRoute,
  enrollPendingRoute,
  enrollApproveRoute,
  enrollDenyRoute,
  enrollWindowOpenRoute,
  enrollWindowCloseRoute,
  enrollConsoleRoute,
  devicesRoute,
  deviceRevokeRoute,
  snapshotReadRoute,
  snapshotWriteRoute,
  revisionRoute,
  assetsManifestRoute,
  assetDownloadRoute,
  assetUploadRoute,
  agentsRoute,
  agentRevokeRoute,
  agentWindowOpenRoute,
  agentWindowCloseRoute,
  agentPendingRoute,
  agentApproveRoute,
  agentDenyRoute,
  protectedResourceMetadataRoute,
  protectedResourceMetadataRootRoute,
  authorizationServerMetadataRoute,
  oauthAuthorizeRoute,
  oauthConsentRoute,
  oauthTokenRoute,
  mcpRoute,
]
