import type {ToolErrorCode} from "@daily/tools"
import type {AgentIdentity} from "../AgentWorkspace"
import type {AgentToolOutcome} from "../runAgentTool"

export type SearchRequest = {dataDir: string; agent: AgentIdentity; input: string}
type SearchFailure = Extract<AgentToolOutcome, {ok: false}>
export type SearchOutcome = {ok: true; text: string} | SearchFailure

export const MAX_SEARCH_REPLY_BYTES = 512 * 1024

export function searchFailure(code: ToolErrorCode, message: string): SearchFailure {
  return {ok: false, error: {code, message}}
}
