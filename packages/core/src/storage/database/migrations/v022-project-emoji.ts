import type {Migration} from "../scripts/migrate"

export const v022: Migration = {
  version: 22,
  name: "project-emoji",
  up: `ALTER TABLE branches ADD COLUMN emoji TEXT;`,
  down: `ALTER TABLE branches DROP COLUMN emoji;`,
}
