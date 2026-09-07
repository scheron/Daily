import {readUrl} from "./readUrl"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const WEB_TOOLS: RegisteredTool[] = [readUrl]
