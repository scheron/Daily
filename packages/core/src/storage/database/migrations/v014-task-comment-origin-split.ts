import type {Migration} from "../scripts/migrate"

/**
 * Splits a comment's single `origin` into `kind` and `provider`.
 *
 * `origin` said which channel a comment came through but not who wrote it, which is what a badge
 * needs. `kind` keeps the channel — `manual` for one typed in the app, `agent` for the built-in
 * agent, `mcp` for one an MCP server sent — and `provider` names the writer inside it: null for
 * `manual`, `daily_agent` for `agent`, and the client's own key for `mcp`.
 *
 * `manual` replaces the old null: written by hand is a fact, not a missing one.
 *
 * This is a separate migration rather than a rewrite of v013 because v013 has already run on
 * development databases, and a migration that has run never runs again. An `mcp` row written
 * before this keeps a null `provider`: which client wrote it was never recorded.
 */
export const v014: Migration = {
  version: 14,
  name: "task-comment-origin-split",
  up: `
    ALTER TABLE task_comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE task_comments ADD COLUMN provider TEXT;

    UPDATE task_comments SET kind = 'mcp' WHERE origin = 'mcp';
    UPDATE task_comments SET kind = 'agent', provider = 'daily_agent' WHERE origin = 'agent';

    ALTER TABLE task_comments DROP COLUMN origin;
  `,
  down: `
    ALTER TABLE task_comments ADD COLUMN origin TEXT;

    UPDATE task_comments SET origin = 'mcp' WHERE kind = 'mcp';
    UPDATE task_comments SET origin = 'agent' WHERE kind = 'agent';

    ALTER TABLE task_comments DROP COLUMN provider;
    ALTER TABLE task_comments DROP COLUMN kind;
  `,
}
