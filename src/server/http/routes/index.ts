import {assetDownloadRoute, assetsManifestRoute, assetUploadRoute} from "./assets"
import {claimRoute} from "./claim"
import {enrollApproveRoute, enrollConsoleRoute, enrollDenyRoute, enrollPendingRoute, enrollRequestRoute, enrollStatusRoute} from "./enroll"
import {serverInfoRoute} from "./serverInfo"
import {revisionRoute, snapshotReadRoute, snapshotWriteRoute} from "./snapshot"

import type {Route} from "../createHttpServer"

/** The Daily Sync Protocol route table. Later phases append routes here; there is no second table. */
export const routes: Route[] = [
  serverInfoRoute,
  claimRoute,
  enrollRequestRoute,
  enrollStatusRoute,
  enrollPendingRoute,
  enrollApproveRoute,
  enrollDenyRoute,
  enrollConsoleRoute,
  snapshotReadRoute,
  snapshotWriteRoute,
  revisionRoute,
  assetsManifestRoute,
  assetDownloadRoute,
  assetUploadRoute,
]
