import type {Migration} from "../scripts/migrate"

export const v009: Migration = {
  version: 9,
  name: "remove-ssh-sync-settings",
  up: `
    UPDATE device_settings SET data = json_remove(data, '$.ssh') WHERE id = 'sync' AND json_valid(data);
  `,
  down: "",
}
