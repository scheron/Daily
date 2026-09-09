import type {Migration} from "../migrate"

export const v004: Migration = {
  version: 4,
  name: "device-roles",
  up: `
    ALTER TABLE devices ADD COLUMN role TEXT NOT NULL DEFAULT 'child';
    ALTER TABLE server_identity ADD COLUMN enrollment_window_expires_at TEXT;
    ALTER TABLE enrollment_requests ADD COLUMN requested_from_address TEXT;
    UPDATE devices SET role = 'parent' WHERE id = (SELECT id FROM devices WHERE revoked_at IS NULL ORDER BY created_at ASC, rowid ASC LIMIT 1);
    CREATE UNIQUE INDEX idx_devices_one_parent ON devices(role) WHERE role = 'parent';
  `,
}
