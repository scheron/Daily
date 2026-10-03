import {app} from "electron"

import {createElectronPaths} from "@main/config/paths"

export const electronPaths = createElectronPaths(app, process.resourcesPath)
