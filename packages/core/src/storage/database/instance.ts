import {logger} from "../../utils/logger"
import {runMigrations} from "./scripts/migrate"

import type {SqliteDriver} from "../../database/SqliteDriver"

/** Runs the pending migrations on an already-open driver and hands it back, so a caller opens in one expression. */
export function initDatabase(driver: SqliteDriver): SqliteDriver {
  logger.info(logger.CONTEXT.DB, "Running migrations")

  try {
    runMigrations(driver)
  } catch (error) {
    driver.close()
    logger.error(logger.CONTEXT.DB, "Failed to initialize SQLite", error)
    throw error
  }

  logger.lifecycle("SQLite initialized successfully")

  return driver
}
