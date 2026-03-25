import {v001} from "./v001-initial-schema"
import {v002} from "./v002-delta-sync"
import {v003} from "./v003-remove-delta-sync"

import type {Migration} from "../scripts/migrate"

export const migrations: Migration[] = [v001, v002, v003]
