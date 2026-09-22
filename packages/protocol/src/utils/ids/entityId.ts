import {customAlphabet} from "nanoid"

/**
 * The two-letter mark every new id carries, so a bare string says what it is when it travels
 * outside the app — a log line, an MCP call, a conversation with an agent.
 *
 * `branch` is the project (see CLAUDE.md): one concept, two names, and `DP` spells the newer one.
 */
export const ENTITY_ID_PREFIX = {
  task: "DT",
  tag: "DG",
  branch: "DP",
  milestone: "DM",
  file: "DF",
  comment: "DC",
} as const

export type EntityIdKind = keyof typeof ENTITY_ID_PREFIX

/**
 * Alphanumeric on purpose. nanoid's default alphabet carries `-` and `_`, which would leave
 * `DT-a-b` ambiguous about where the mark ends; without them the first `-` is always the boundary.
 */
const ENTITY_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const ENTITY_ID_LENGTH = 21

const randomPart = customAlphabet(ENTITY_ID_ALPHABET, ENTITY_ID_LENGTH)

/**
 * A fresh id for one of the synced entities.
 *
 * Ids minted before this existed carry no mark and are never migrated, so a mixed database is the
 * expected state — nothing reads the mark back, and nothing validates the shape of an id.
 *
 * @example createEntityId("task") // "DT-a7Kf9Qm2xVb3Lp8Rt1Wz"
 */
export function createEntityId(kind: EntityIdKind): string {
  return `${ENTITY_ID_PREFIX[kind]}-${randomPart()}`
}
