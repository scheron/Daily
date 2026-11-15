# @scheron/daily-server

Run your own Daily Sync Protocol endpoint instead of iCloud Drive.
[Daily](https://github.com/scheron/Daily) connects in Settings → Sync → **Self-hosted Daily**.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/deploy/install.sh | sh
```

Run on the VPS. The installer asks for its public address and detects the rest.

### A domain, with 80 and 443 free

Type the domain when asked.

- Confirms the domain already points at this machine.
- Installs Caddy alongside the server; Caddy gets it a Let's Encrypt certificate.
- Prints the address, a six-digit claim code, and the script that manages it from here.

### No domain — just this machine's IP

Press Enter when asked.

- Shows the IP address it found for this machine and asks you to confirm it.
- Installs the server alone, with a self-signed certificate for that address.
- Prints the address, claim code, and SHA-256 fingerprint to compare with the one Daily shows.

### Something already answers on 80 or 443

Type the domain when asked, same as the first scenario.

- Notices the ports are taken and installs the server alone, without a bundled proxy.
- Prints the upstream address, one `docker network connect` command that lets your proxy reach
  it, and the request-size limit to raise past 100 MB, or attachments fail while everything else
  looks healthy.
- The server log confirms routing works; no restart is needed.

## Connecting your Macs

In Settings → Sync, the first Mac claims the server using the installer's six-digit code.
It becomes the sole **Parent**, which approves and revokes **Child** Macs; Children only sync.

Adding a Child takes both Macs, in this order:

1. On the Parent, open Settings → Sync and press **Add a device**. The last row of the device
   table turns into a five-minute countdown; the server accepts one request while it runs.
2. On the new Mac, enter the server's address in Settings → Sync and connect.
3. The Parent shows a card naming the Mac that asked. Approve it, and the two are bound.

If the new Mac sees _"This server is not expecting a new device right now,"_ open the Parent's
window first, then reconnect.

Revoked Children stop syncing, keep their local data, and must repeat enrollment to rejoin.
Revoking the Parent leaves none; the console can appoint another — see [Recovery](#recovery).

## Connecting agents

Agents read and change tasks through this server. Use a domain with a trusted certificate, or a
loopback address for local testing.

1. On any bound Mac, open Settings → Sync and press **Connect an agent**. Copy the address shown.
   The server waits five minutes, even if you leave Settings. Select **Cancel** to close it early.
2. Add the address to your client. Replace `https://your-server/mcp` with the address you copied.
   - Claude Code uses `claude mcp add --transport http daily https://your-server/mcp`. Run
     `/mcp`, pick **daily** and choose **Authenticate**.
   - Codex uses `codex mcp add daily --url https://your-server/mcp`, then `codex mcp login daily`.
   - In the Claude app, go to **Settings → Connectors → Add custom connector** and paste the address.
3. Match the browser's six-digit code on that Mac, check where the browser returns, then approve.
   The displayed name comes from the agent. Approval closes the window and the browser returns to the agent.

Connections keep working after the window closes. The Mac that approved the agent, or the Parent,
can revoke it. Revoking a Mac revokes its agents.

### Client registration and retries

Public OAuth clients can use hosted Client ID Metadata Documents (CIMD) or discover
`/oauth/register` for Dynamic Client Registration (DCR). Both paths require an open window to
start a new connection. DCR gives the client an ID for this server.

- On `403`, open **Connect an agent** and retry.
- On `429`, follow `Retry-After` if present. Open a new window if the current window reached its quota.
- On `503`, registration storage is full. Retry after unused registrations expire.
- If the agent keeps using an expired or wrong-server ID, remove its saved connection and add the address again.

See [ADR 0005](https://github.com/scheron/Daily/blob/main/docs/adr/0005-agent-access-approved-on-a-mac.md) for limits and ID retention.

## Managing it

The installer adds `daily-server` to `PATH`, or prints the script's full path. Both accept:

```
Usage: daily-server <verb>

Verbs:
  status       show the installation's status
  logs         follow the server's logs
  claim-code   print the unclaimed server's claim code
  rename       set the name Daily shows for this server
  upgrade      back up, move to the current release's image, and undo it if that fails
  backup       write a single archive with the database and the assets
  restart      restart the stack
  stop         stop the stack
  uninstall    stop the stack and remove its containers
```

`daily-server rename "My server"` applies immediately. An unnamed server uses the public URL's
host, then the machine's hostname (a container id in Docker); fallback replaces only a bare
container id, never a chosen name. `DAILY_SERVER_NAME` wins on every start and disables `rename`.

`backup` writes a `.tar.gz` of the database and assets beside `daily.sh`; `upgrade` does too.
`uninstall` keeps data volumes unless its confirmation is answered yes.

## Configuration

Configure through environment variables; there is no config file. Do not edit `daily.sh`.

| Variable                             | Default                                  | Meaning                                                                                                       |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DAILY_SERVER_HOST`                  | `0.0.0.0`                                | address the server binds                                                                                      |
| `DAILY_SERVER_PORT`                  | `8787`                                   | port the server binds                                                                                         |
| `DAILY_SERVER_DATA_DIR`              | `/var/lib/daily-server` inside the image | where the SQLite store, the assets, and any minted certificate live                                           |
| `DAILY_SERVER_PUBLIC_URL`            | unset                                    | the address Daily connects to                                                                                 |
| `DAILY_SERVER_TLS`                   | unset (plain HTTP)                       | `self-signed` mints and serves a certificate for `DAILY_SERVER_PUBLIC_URL`'s host; any other value is refused |
| `DAILY_SERVER_NAME`                  | unset                                    | declares the name Daily shows; unset, the name comes from `daily-server rename`, else the public URL's host   |
| `DAILY_SERVER_MAX_ASSET_BYTES`       | 100 MB                                   | largest single attachment the server accepts                                                                  |
| `DAILY_SERVER_MAX_SNAPSHOT_BYTES`    | 32 MiB                                   | largest snapshot write body, measured separately before and after gzip decoding                               |
| `DAILY_SERVER_BACKUP_INTERVAL_HOURS` | `24`                                     | hours between scheduled backups; `0` turns the schedule off                                                   |
| `DAILY_SERVER_BACKUP_KEEP`           | `1`                                      | how many backups to keep; the oldest beyond this are removed                                                  |
| `DAILY_SERVER_BACKUP_DIR`            | `backups` under the data directory       | where scheduled backups are written                                                                           |

### Sync over slow connections

An upgraded app and server allow 15 minutes per snapshot transfer. After 30 seconds without data,
the app times out a download and the server times out an upload. The server accepts two uploads
at a time and asks others to retry. Other request bodies keep a five-minute limit after headers.

Mixed versions still sync within the limits of the older endpoint. An older app keeps its
30-second snapshot deadline. An older server limits uploads to about five minutes.

New bundled Caddy configurations stream bodies and set a one-minute header timeout and
15-minute read and write ceilings. Upgrading the server image preserves the existing Caddyfile.
The original bundled configuration also streams bodies, so it can use the upgraded app and
server deadlines. If you run another proxy, stream snapshot uploads and downloads and allow
at least 15 minutes for progressing transfers. Allow at least 45 seconds for a held revision
probe to respond.

## Backups

Automatic backups run every 24 hours without interrupting service. Only the newest is kept
unless `DAILY_SERVER_BACKUP_KEEP` says otherwise; every bound Mac also holds a full copy.

A backup contains `server.sqlite` and `assets`, costing little disk beyond the database.
To restore: stop the stack, copy both into the data directory, then start it.

Scheduled backups share the data's disk: they cover corruption or unwanted changes, not machine
loss. Keep the archive from `daily-server backup` elsewhere to cover that.

## Monitoring

```bash
curl https://your-server/health
{"status":"ok"}
```

`GET /health` needs no credentials and answers `{"status":"ok"}` and nothing else. It is the
address to give an uptime monitor, and it stays put across protocol versions. [MCP lifecycle journal](MCP-JOURNAL.md)

## Recovery

If the Parent or all bound Macs are lost, use the server console:

```bash
docker compose exec daily-server daily-server device enroll
docker compose exec daily-server daily-server device list
docker compose exec daily-server daily-server device promote <id>
docker compose exec daily-server daily-server device revoke <id>
```

`device enroll` prints a single-use, fifteen-minute token to bind a Mac without a Parent.
`device promote <id>` appoints an existing bound Mac as Parent. `device list` shows roles, names
and last-seen times, with revoked Macs after active ones.

Legacy device ids may begin with `-`. For those, put options before `--`, then the id:
`docker compose exec daily-server daily-server device revoke --data-dir <path> -- <id>`.
The same applies to `device promote`; `--` before options makes commander reject the argument.

## Updating

```bash
daily-server upgrade
```

No manual edits: `upgrade` alone moves the `ghcr.io/scheron/daily-server` image's `p<N>` pin,
which names its sync protocol.

Before upgrading, it always writes `daily-preupgrade-<timestamp>.tar.gz` beside `daily.sh`:
a new image may migrate the database. Startup failure, health timeout or exit restores both
the archive and previous image, then restarts. Failed downloads change nothing. Success removes
older pre-upgrade archives; rollback keeps them.

## Confidentiality

The server stores readable snapshots. Its operator, root user, or anyone with disk or backup
access can read every synced task. End-to-end encryption is neither offered nor planned.
Run it on a machine you control, such as your own VPS, not a shared host operated by others.

## Task workflow through MCP

Agents and Daily Assistant share `list_tasks`, `get_task`, and `save_task`. Statuses are `backlog`,
`todo`, `ready_for_agent`, `in_progress`, `ready_to_merge`, `done`, `cancelled`, independent of Normal / Agents.
To Do means planned work; In Progress means execution has started. To Do and ready states remain
outstanding; scheduling does not start work and preparation does not launch an agent.

```json
{"name":"list_tasks","arguments":{"status":"ready_for_agent"}}
{"name":"save_task","arguments":{"id":"TASK_ID","date":"2026-10-29"}}
{"name":"save_task","arguments":{"id":"TASK_ID","date":null}}
{"name":"save_task","arguments":{"id":"TASK_ID","status":"in_progress","date":"2026-10-29"}}
{"name":"save_task","arguments":{"id":"TASK_ID","status":"ready_to_merge"}}
{"name":"save_comment","arguments":{"taskId":"TASK_ID","content":"Implementation and verification details"}}
{"name":"get_task","arguments":{"id":"TASK_ID"}}
```

Use a returned task id and intended day. Ready for Agent keeps its optional day on entry and stays
ready when that day is assigned or cleared; creation without a date is undated. Backlog has no day.
The other five statuses require one, defaulting to the caller's Mac clock. New tasks default to To Do
on that day, or Backlog when `date` is null. Scheduling Backlog makes it To Do; clearing To Do's date
returns it to Backlog. Rescheduling preserves status; explicit status wins. Use `in_progress` to start work.
`save_task` accepts up to 50 changes as `{"tasks":[...]}` atomically; failure rolls back the batch and history.
Comments and history retain the approved MCP client's authorship.

## License

MIT © Scheron
