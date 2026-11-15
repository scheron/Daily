import type {Migration} from "../migrate"

export const v007: Migration = {
  version: 7,
  name: "agent-client-registrations",
  up: `
    ALTER TABLE server_identity ADD COLUMN agent_window_id TEXT;
    UPDATE server_identity SET agent_window_id = lower(hex(randomblob(16)))
    WHERE agent_window_expires_at IS NOT NULL AND agent_window_device_id IS NOT NULL;

    CREATE TABLE agent_client_registrations (
      client_id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      window_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (window_id, issuer, client_name, redirect_uris)
    );
    CREATE INDEX idx_agent_client_registrations_created_at ON agent_client_registrations(created_at);
    CREATE INDEX idx_agent_authorizations_client_resource ON agent_authorizations(client_id, resource);
  `,
}
