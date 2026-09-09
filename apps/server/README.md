# @scheron/daily-server

The Self-hosted Daily Sync Server — a Daily Sync Protocol server for people who would rather run
their own sync endpoint than use iCloud Drive. [Daily](https://github.com/scheron/Daily) connects
to one as **Self-hosted Daily**, in Settings → Sync.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/scheron/Daily/main/deploy/install.sh | sh
```

Run this on the VPS itself. It asks one question — the address you'll reach this server at — and
decides the rest by looking at the machine.

### A domain, with 80 and 443 free

Type the domain when asked.

- Confirms the domain already points at this machine.
- Installs Caddy alongside the server; Caddy gets it a Let's Encrypt certificate.
- Prints the address, a six-digit claim code, and the script that manages it from here.

### No domain — just this machine's IP

Press Enter when asked.

- Shows the IP address it found for this machine and asks you to confirm it.
- Installs the server alone, with a self-signed certificate for that address.
- Prints the address, the claim code, and the certificate's SHA-256 fingerprint. Daily shows the
  same fingerprint when it connects, so the two can be compared.

### Something already answers on 80 or 443

Type the domain when asked, same as the first scenario.

- Notices the ports are taken and installs the server alone, without a bundled proxy.
- Prints the upstream address, one `docker network connect` command that lets your proxy reach
  it, and the request-size limit to raise past 100 MB, or attachments fail while everything else
  looks healthy.
- Once your proxy is routing, the server's log confirms the address works — nothing needs
  restarting.

## Connecting your Macs

The first Mac claims the server with the six-digit code the install printed, in Settings → Sync.
That Mac becomes the **Parent**. There is exactly one, and only it may let another Mac in or put
one out. Every Mac after it joins as a **Child**, which syncs and nothing more.

Adding a Child takes both Macs, in this order:

1. On the Parent, open Settings → Sync and press **Add a device**. The last row of the device
   table turns into a five-minute countdown; the server accepts one request while it runs.
2. On the new Mac, enter the server's address in Settings → Sync and connect.
3. The Parent shows a card naming the Mac that asked. Approve it, and the two are bound.

In the wrong order the new Mac is turned away with _"This server is not expecting a new device
right now."_ Nothing is broken — the window is simply shut. Open it on the Parent and connect again.

The Parent can revoke any Child: that Mac stops syncing at once and keeps what it had locally, and
rejoining means the three steps again. Revoking the Parent itself leaves the server with none, and
only the console can appoint another — see [Recovery](#recovery).

## Managing it

The install puts a `daily-server` command on your `PATH`. Where it could not — installing as an
ordinary user, say — it prints the full path to the same script instead, and the verbs match:

```
Usage: daily-server <verb>

Verbs:
  status       show the installation's status
  logs         follow the server's logs
  claim-code   print the unclaimed server's claim code
  upgrade      back up, move to the current release's image, and undo it if that fails
  backup       write a single archive with the database and the assets
  restart      restart the stack
  stop         stop the stack
  uninstall    stop the stack and remove its containers
```

`backup` writes one `.tar.gz` beside `daily.sh`, holding the database and the assets directory.
`upgrade` writes one of its own first — see below. `uninstall` asks before it removes the data
volumes, and keeps them unless you answer yes.

## Configuration

Everything is read from the environment; there is no configuration file, and `daily.sh` is not
meant to be hand-edited.

| Variable                             | Default                                  | Meaning                                                                                                       |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DAILY_SERVER_HOST`                  | `0.0.0.0`                                | address the server binds                                                                                      |
| `DAILY_SERVER_PORT`                  | `8787`                                   | port the server binds                                                                                         |
| `DAILY_SERVER_DATA_DIR`              | `/var/lib/daily-server` inside the image | where the SQLite store, the assets, and any minted certificate live                                           |
| `DAILY_SERVER_PUBLIC_URL`            | unset                                    | the address Daily connects to                                                                                 |
| `DAILY_SERVER_TLS`                   | unset (plain HTTP)                       | `self-signed` mints and serves a certificate for `DAILY_SERVER_PUBLIC_URL`'s host; any other value is refused |
| `DAILY_SERVER_MAX_ASSET_BYTES`       | 100 MB                                   | largest single attachment the server accepts                                                                  |
| `DAILY_SERVER_MAX_SNAPSHOT_BYTES`    | 32 MB                                    | largest snapshot write body the server accepts                                                                |
| `DAILY_SERVER_BACKUP_INTERVAL_HOURS` | `24`                                     | hours between scheduled backups; `0` turns the schedule off                                                   |
| `DAILY_SERVER_BACKUP_KEEP`           | `14`                                     | how many backups to keep; the oldest beyond this are removed                                                  |
| `DAILY_SERVER_BACKUP_DIR`            | `backups` under the data directory       | where scheduled backups are written                                                                           |

## Backups

The server backs itself up on a schedule, out of the box — every 24 hours, keeping the last 14.
Nothing needs scheduling by hand, and the server keeps serving while it happens.

Each backup is a directory holding `server.sqlite` and an `assets` directory, and costs almost no
disk beyond the database itself. Restoring one is a file copy: stop the stack, put `server.sqlite`
and `assets` back under the data directory, start it again.

These backups sit on the same disk as the data they protect. That covers a database that got
corrupted, a bad restore, a change you want to undo — not the machine going away. For that, take
the archive `daily-server backup` writes and keep it somewhere else.

## Monitoring

```bash
curl https://your-server/health
{"status":"ok"}
```

`GET /health` needs no credentials and answers `{"status":"ok"}` and nothing else. It is the
address to give an uptime monitor, and it stays put across protocol versions.

## Recovery

When no Mac can get you there — the Parent is gone, or every bound Mac is — the server's own
console can:

```bash
docker compose exec daily-server daily-server device enroll
docker compose exec daily-server daily-server device list
docker compose exec daily-server daily-server device promote <id>
docker compose exec daily-server daily-server device revoke <id>
```

`device enroll` is the way back once every bound Mac is lost: it prints a single-use token, good
for fifteen minutes, that binds a new Mac directly, with no Parent to approve it. `device promote
<id>` hands the Parent role to another bound Mac, for when the one that held it is gone and nothing
left can approve or revoke anything. `device list` shows each Mac's role, name and last-seen time,
with revoked ones after the active ones.

Newly minted device ids never begin with `-`, but an id already in the database might, from before
this was true. If one does, address it with options before the separator, then the id:
`docker compose exec daily-server daily-server device revoke --data-dir <path> -- <id>` (and the
same for `device promote`) — not `--` first, which commander reads as "no more options" and then
refuses the extra argument.

## Updating

```bash
daily-server upgrade
```

One command; nothing is edited by hand. Your server runs `ghcr.io/scheron/daily-server`, pinned to
a `p<N>` tag naming the sync protocol it speaks; that pin never moves on its own, only `upgrade`
moves it.

Before it does, `upgrade` writes `daily-preupgrade-<timestamp>.tar.gz` beside `daily.sh`, asked for
or not: a new image can migrate the database. If it will not start, will not report healthy in
time, or exits on its own, the archive and the previous image both go back and the server is
started again on what it was running. A failed download changes nothing.

## Confidentiality

Whoever controls this server can read the tasks stored on it. The snapshot Daily writes here is kept
in a form the server can parse — not an end-to-end-encrypted blob. End-to-end encryption is not
offered and is not planned.

So anyone with access to this machine — its operator, its root user, anyone who can read its disk
or its backups — can read every task synced through it. Run it only on a machine you control: a VPS
of your own, not a shared or third-party host someone else operates.

## License

MIT © Scheron
