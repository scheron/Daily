import {claimRoute} from "./claim"
import {enrollApproveRoute, enrollConsoleRoute, enrollDenyRoute, enrollPendingRoute, enrollRequestRoute, enrollStatusRoute} from "./enroll"
import {serverInfoRoute} from "./serverInfo"

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
]
