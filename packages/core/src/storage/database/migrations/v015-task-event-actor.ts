import type {Migration} from "../scripts/migrate"

/**
 * Gives a task event an author: `kind` names the channel it came through — `manual` for one made in
 * the app, `agent` for the built-in agent, `mcp` for one an MCP client triggered — and `provider`
 * names the writer inside that channel, the same idiom `v014` already gave comments.
 *
 * `manual` replaces the old absence: every event recorded before this migration was made by hand,
 * and that is a fact, not a gap. No index is added: the server reads events from a one-off
 * in-memory database per call, and the app never queries by author.
 */
export const v015: Migration = {
  version: 15,
  name: "task-event-actor",
  up: `
    ALTER TABLE task_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE task_events ADD COLUMN provider TEXT;
  `,
  down: `
    ALTER TABLE task_events DROP COLUMN provider;
    ALTER TABLE task_events DROP COLUMN kind;
  `,
}
