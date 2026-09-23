import {ACTOR_PROVIDER_MAX_LENGTH, DAILY_AGENT_PROVIDER} from "../../constants/storage"

import type {ActorSource} from "../../types/storage"

/**
 * The `provider` an actor source really means: none for `manual`, this app's agent for one the
 * built-in agent made, and whatever an MCP client called itself — trimmed and clamped, because
 * that value comes from outside.
 */
export function resolveActorProvider(source: ActorSource): string | null {
  if (source.kind === "manual") return null
  if (source.kind === "agent") return source.provider?.trim() || DAILY_AGENT_PROVIDER

  const named = source.provider?.trim()
  return named ? named.slice(0, ACTOR_PROVIDER_MAX_LENGTH) : null
}
