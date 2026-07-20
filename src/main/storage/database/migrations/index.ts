import {v001} from "./v001-initial-schema"
import {v002} from "./v002-delta-sync"
import {v003} from "./v003-remove-delta-sync"
import {v004} from "./v004-ai-sessions"
import {v005} from "./v005-task-events"
import {v006} from "./v006-ai-turn-usage"
import {v007} from "./v007-repair-activity-and-usage"
import {v008} from "./v008-local-sync-settings"

import type {Migration} from "../scripts/migrate"

export const migrations: Migration[] = [v001, v002, v003, v004, v005, v006, v007, v008]
