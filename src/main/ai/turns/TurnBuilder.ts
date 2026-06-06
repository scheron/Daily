import {nanoid} from "nanoid"

import type {AgentStep, AgentTurn, AgentTurnStatus} from "./types"

/**
 * Distributive `Omit` over the AgentStep union so that each variant keeps
 * its own discriminator. Plain `Omit<AgentStep, K>` collapses the union
 * into a synthetic intersection and erases variant-specific fields.
 */
type AgentStepInput = AgentStep extends infer S ? (S extends AgentStep ? Omit<S, "id" | "createdAt"> : never) : never

/**
 * Builder for an AgentTurn. Owned by `AIController.sendMessage` for the
 * duration of one turn. Each step accumulator is monotonic — steps are
 * append-only. Status transitions are explicit.
 */
export class TurnBuilder {
  private turn: AgentTurn

  constructor(userMessage: string, sessionId?: string) {
    this.turn = {
      id: nanoid(),
      sessionId,
      userMessage,
      startedAt: Date.now(),
      status: "running",
      steps: [],
    }
  }

  get id(): string {
    return this.turn.id
  }

  get status(): AgentTurnStatus {
    return this.turn.status
  }

  appendStep(step: AgentStepInput): AgentStep {
    const full = {...step, id: nanoid(), createdAt: Date.now()} as AgentStep
    this.turn.steps.push(full)
    return full
  }

  setStatus(status: AgentTurnStatus): void {
    this.turn.status = status
    if (status !== "running" && status !== "waiting_confirmation" && this.turn.finishedAt == null) {
      this.turn.finishedAt = Date.now()
    }
  }

  setFinalMessage(text: string): void {
    this.turn.finalMessage = text
  }

  setError(message: string): void {
    this.turn.error = message
  }

  /** Deep-clone snapshot for safe handoff (e.g. to Phase 5 persistence later). */
  snapshot(): AgentTurn {
    return JSON.parse(JSON.stringify(this.turn))
  }
}
