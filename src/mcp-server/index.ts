#!/usr/bin/env node

/**
 * Daily MCP Server
 *
 * Provides MCP interface to manage tasks in Daily app.
 * Communicates with Daily's HTTP API.
 */
import {startServer} from "@/server"

startServer().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})
