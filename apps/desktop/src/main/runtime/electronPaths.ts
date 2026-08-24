import {app} from "electron"

import {createElectronPaths} from "../config/paths"

export const electronPaths = createElectronPaths(app, process.resourcesPath)
