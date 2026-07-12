import {app} from "electron"

import {createElectronPaths} from "@shared/config/paths"

export const electronPaths = createElectronPaths(app, process.resourcesPath)
