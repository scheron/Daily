---
date: 2026-03-14
slug: sqlite-migration
task_type: refactor
research: .ai-workflow/sqlite-migration/research/2026-03-14-sqlite-migration.research.md
status: approved
---

# Design: Migrate PouchDB to SQLite (better-sqlite3)

## Overview

Replace PouchDB with SQLite (`better-sqlite3`) as the sole persistence layer while preserving all IPC contracts, domain types, and renderer behavior. The migration eliminates tag hydration overhead via SQL JOINs, replaces retry-on-conflict with transactions, moves binary files from base64-in-DB to disk-based streaming, and fixes iCloud sync race conditions. The `IStorageController` interface (40+ methods) and all 35 IPC channels remain unchanged.

## File Index

- [01-architecture.md](01-architecture.md) — ADR-lite decisions and target structure
- [02-data-flow.md](02-data-flow.md) — Data flow: success and error paths
- [03-sequence.md](03-sequence.md) — Sequence diagrams: main and error flows
- [04-contracts.md](04-contracts.md) — Exhaustive API / event / schema contracts
- [05-risks.md](05-risks.md) — Risk register

## Approval Gate

Status: **APPROVED**
