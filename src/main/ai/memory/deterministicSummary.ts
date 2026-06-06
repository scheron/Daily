import type {ChangedEntity} from "@/ai/tools/types"
import type {AgentStep, AgentTurn} from "@/ai/turns/types"

/**
 * Build a deterministic, model-friendly summary of past turns. The output is
 * a single multi-line string suitable for embedding as a system message.
 *
 * The summary lists user requests in order and, for each turn, the entities
 * the assistant actually touched (drawn from each `tool_result` step's
 * `changedEntities`). Empty when no turns are supplied.
 */
export function summarizeTurns(turns: AgentTurn[]): string {
  if (!turns.length) return ""

  const lines: string[] = ["Session memory summary (compacted):"]

  turns.forEach((turn, idx) => {
    const userLine = `${idx + 1}. user: ${truncate(turn.userMessage, 140)}`
    lines.push(userLine)

    const changes = collectChangedEntities(turn.steps)
    if (changes.length) {
      const grouped = groupChanges(changes)
      lines.push(`   actions: ${grouped}`)
    }

    if (turn.finalMessage) {
      lines.push(`   assistant: ${truncate(turn.finalMessage, 140)}`)
    } else if (turn.status === "failed") {
      lines.push(`   assistant: (failed${turn.error ? `: ${truncate(turn.error, 80)}` : ""})`)
    } else if (turn.status === "cancelled") {
      lines.push(`   assistant: (cancelled)`)
    }
  })

  return lines.join("\n")
}

function collectChangedEntities(steps: AgentStep[]): ChangedEntity[] {
  const out: ChangedEntity[] = []
  for (const step of steps) {
    if (step.type !== "tool_result") continue
    const entities = step.result?.changedEntities
    if (entities && entities.length) out.push(...entities)
  }
  return out
}

function groupChanges(changes: ChangedEntity[]): string {
  // Group by (type, action) and count.
  const counts = new Map<string, number>()
  for (const c of changes) {
    const key = `${c.action} ${c.type}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([key, count]) => `${count}x ${key}`)
    .join(", ")
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + "…"
}
