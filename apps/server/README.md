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

## Managing it

Every installation gets its own `daily.sh`, printed at the end of the install and left beside the
files it manages:

```
Usage: daily.sh <verb>

Verbs:
  status       show the installation's status
  logs         follow the server's logs
  claim-code   print the unclaimed server's claim code
  upgrade      pull the newer image and restart with the same data
  backup       write a single archive with the database and the assets
  restart      restart the stack
  stop         stop the stack
  uninstall    stop the stack and remove its containers
```

`backup` writes one `.tar.gz` beside `daily.sh`, holding the database and the assets directory.
`upgrade` never touches that data — only the image is replaced. `uninstall` asks before it
removes the data volumes, and keeps them unless you answer yes.

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
Nothing needs to be scheduled by hand, and nothing stops to do it: SQLite's online backup copies a
consistent snapshot of the live database while the server keeps serving.

Each backup is a directory holding `server.sqlite` and an `assets` directory. The assets are
hard-linked rather than copied, so a backup costs one directory entry per attachment instead of a
second copy of the bytes, and still holds the bytes each attachment had when the backup ran.
Restoring one is a file copy: stop the stack, put `server.sqlite` and `assets` back under the data
directory, start it again.

These backups sit on the same disk as the data they protect. That covers a database that got
corrupted, a bad restore, a change you want to undo — not the machine going away. For that, take
the archive `./daily.sh backup` writes and keep it somewhere else.

## Recovery

```bash
docker compose exec daily-server daily-server device enroll
docker compose exec daily-server daily-server device list
docker compose exec daily-server daily-server device revoke <id>
```

`device enroll` is the way back once every bound device is lost: it prints a single-use token,
good for fifteen minutes, that binds a new device directly — no other bound device needs to be
online to approve it. `device list` and `device revoke <id>` manage bound devices the rest of the
time, for a Mac that was lost or decommissioned.

## Updating

```bash
./daily.sh upgrade
```

Every published release carries three tags on `ghcr.io/scheron/daily-server`: the exact version,
`latest`, and a rolling `p<N>`, where `N` is this build's own `SYNC_PROTOCOL_VERSION`. The
generated compose file pins the image to a `p<N>` tag, not `latest`: every build under the same
`p<N>` tag speaks the same Daily Sync Protocol, and a build that would speak a different protocol
is published under a different one, so pulling within a tag is always safe.

## Confidentiality

Whoever controls this server can read the tasks stored on it. The snapshot Daily writes here is kept
in a form the server can parse — not an opaque, end-to-end-encrypted blob, and end-to-end encryption
is not offered and is not planned. This is a permanent property of the design, not a limitation of
the current version: the intended future for this server is one that can act on the data it holds —
task automation, integrations, tools bound to an agent — and none of that is possible against
ciphertext the server itself cannot read.

In practice, that means anyone with access to this machine — its operator, its root user, anyone who
can read its disk or its backups — can read every task synced through it. Run this server only on a
machine whose owner already trusts with the data: a VPS under one's own control, not a shared or
third-party host operated by someone else.

## License

MIT © Scheron
