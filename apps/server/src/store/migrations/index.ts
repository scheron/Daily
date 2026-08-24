import {v001} from "./v001-initial-schema"
import {v002} from "./v002-snapshot"
import {v003} from "./v003-assets"

import type {Migration} from "../migrate"

export const migrations: Migration[] = [v001, v002, v003]
