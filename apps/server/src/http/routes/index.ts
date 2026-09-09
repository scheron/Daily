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
import {serverInfoRoute} from "./serverInfo"
import {revisionRoute, snapshotReadRoute, snapshotWriteRoute} from "./snapshot"

import type {Route} from "../createHttpServer"

/** The Daily Sync Protocol route table. Later phases append routes here; there is no second table. */
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
]
