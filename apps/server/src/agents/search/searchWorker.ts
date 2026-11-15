import {SYNC_PROTOCOL_CONFIG} from "@daily/protocol"
import {findTool, ToolError, ToolErrorCode} from "@daily/tools"

import {openReadOnlyServerStore} from "../../store/instance"
import {runInAgentWorkspace} from "../AgentWorkspace"
import {MAX_SEARCH_REPLY_BYTES, searchFailure} from "./searchProtocol"

import type {SearchOutcome, SearchRequest} from "./searchProtocol"

const SEARCH_WORK_BUDGET = 150_000_000
const SQLITE_HEAP_BYTES = 128 * 1024 * 1024
const WORKER_FAILED = searchFailure(ToolErrorCode.INTERNAL, "The search worker could not complete the search. Try again.")

process.once("disconnect", () => process.exit(1))
process.once("message", (request: SearchRequest) => {
  void executeSearch(request).then(sendOutcome, () => sendOutcome(WORKER_FAILED))
})

async function executeSearch({dataDir, agent, input}: SearchRequest): Promise<SearchOutcome> {
  const tool = findTool("list_tasks")
  if (tool?.mode !== "read") return WORKER_FAILED

  const store = openReadOnlyServerStore(dataDir)
  try {
    store.db.pragma(`hard_heap_limit = ${SQLITE_HEAP_BYTES}`)
    const args = JSON.parse(input) as Record<string, unknown>
    const data = await runInAgentWorkspace({store, maxReadSnapshotBytes: SYNC_PROTOCOL_CONFIG.maxSnapshotBodyBytes}, agent, "read", (ctx) =>
      tool.run(args, {...ctx, searchWorkBudget: SEARCH_WORK_BUDGET}),
    )
    const text = JSON.stringify(data)
    if (Buffer.byteLength(text) > MAX_SEARCH_REPLY_BYTES) {
      return searchFailure(ToolErrorCode.SEARCH_BUDGET_EXCEEDED, "The search page is too large. Try a smaller page size or narrower filters.")
    }
    return {ok: true, text}
  } catch (error) {
    if (error instanceof ToolError) return searchFailure(error.code, error.message)
    return WORKER_FAILED
  } finally {
    store.close()
  }
}

function sendOutcome(outcome: SearchOutcome): void {
  if (!process.send) process.exit(1)
  process.send(outcome, (error) => process.exit(error ? 1 : 0))
}
