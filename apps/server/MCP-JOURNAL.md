# MCP lifecycle journal

Read the journal from the server's data volume. From the Compose directory, run:

```bash
docker compose exec -T daily-server sh -c 'cat "${DAILY_SERVER_DATA_DIR:-/var/lib/daily-server}"/mcp-journal/mcp-*.ndjson'
```

For each authenticated call to a recognized tool, the journal writes a `start` with a
server-generated `id`, UTC timestamp `at`, registered `tool` name, and `searchLength` in UTF-16
code units when present. The matching `end` contains the same `id`, a timestamp, a stable `code`
(`OK` or a tool error code), and total `elapsedMs`. It also includes queue and execution times
when measured. Use the `id` to match records across files. An unmatched start can indicate an
interrupted process, delayed or degraded writing, or rotation. Skip an incomplete JSON line
left by an interrupted write.

The data volume preserves these records across container replacement. Files rotate by UTC day
and at 1 MiB. Retention keeps at most seven UTC dates including today and 8 MiB total, dropping the
oldest files first. The server checks retention at startup, while writing, and hourly. Use a
single server process per data volume.

The log message `MCP journal degraded` means a write failed, the pending queue filled, or the
journal wait exceeded 100 ms. It appears at most once per minute. MCP and sync continue while
journal records may be delayed or dropped.
