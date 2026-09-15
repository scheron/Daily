import type {AgentMessageSegment} from "@shared/types/ai"

export type ToolSegment = Extract<AgentMessageSegment, {kind: "tool"}>
