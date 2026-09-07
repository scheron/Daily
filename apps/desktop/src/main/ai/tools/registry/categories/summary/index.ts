import {getDaySummary} from "./getDaySummary"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const SUMMARY_TOOLS: RegisteredTool[] = [getDaySummary]
