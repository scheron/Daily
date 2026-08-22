# @scheron/daily-server

The Self-hosted Daily Sync Server — a Daily Sync Protocol server for people who would rather run
their own sync endpoint than use iCloud Drive. [Daily](https://github.com/scheron/Daily) connects to
one as **Self-hosted Daily**, in Settings → Sync.

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

## Install

The server ships as one artifact: a multi-arch Docker image at `ghcr.io/scheron/daily-server`, built
for `linux/amd64` and `linux/arm64`. There is nothing else to download and nothing to run first.

Copy `deploy/compose.yaml` from this repository onto the machine that will run it, set
`DAILY_SERVER_PUBLIC_URL` for the topology described below, and bring it up:

```bash
docker compose -f compose.yaml up -d
```

The image runs as a non-root user. The data directory is a named volume, so replacing the container
with a newer image — pulling a new tag and bringing the service back up — never touches what it
holds: the SQLite store, the bound devices, and any certificate minted for it all survive.

## Configuration

Everything is read from the environment; there is no configuration file.

| Variable                          | Default                                  | Meaning                                                                                                                        |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DAILY_SERVER_HOST`               | `0.0.0.0`                                | address the server binds                                                                                                       |
| `DAILY_SERVER_PORT`               | `8787`                                   | port the server binds                                                                                                          |
| `DAILY_SERVER_DATA_DIR`           | `/var/lib/daily-server` inside the image | where the SQLite store, the assets, and any minted certificate live                                                            |
| `DAILY_SERVER_PUBLIC_URL`         | unset                                    | the address Daily connects to; also the address this server checks itself against on every start while unclaimed               |
| `DAILY_SERVER_TLS`                | unset (plain HTTP)                       | `self-signed` mints and serves a self-signed certificate covering `DAILY_SERVER_PUBLIC_URL`'s host; any other value is refused |
| `DAILY_SERVER_CERT`               | unset                                    | path to a certificate to serve, already in hand; must be set together with `DAILY_SERVER_KEY`                                  |
| `DAILY_SERVER_KEY`                | unset                                    | path to the private key matching `DAILY_SERVER_CERT`                                                                           |
| `DAILY_SERVER_MAX_ASSET_BYTES`    | 100 MB                                   | largest single attachment the server accepts                                                                                   |
| `DAILY_SERVER_MAX_SNAPSHOT_BYTES` | 32 MB                                    | largest snapshot write body the server accepts                                                                                 |

Serving a certificate already in hand is `DAILY_SERVER_CERT` and `DAILY_SERVER_KEY` together — it is
not a value of `DAILY_SERVER_TLS`, and setting both alongside `DAILY_SERVER_TLS=self-signed` is
refused as contradictory: the server cannot serve two certificates at once. `DAILY_SERVER_TLS`
itself accepts exactly `self-signed`, or is left unset for plain HTTP.

## Behind a reverse proxy

This is the topology `deploy/compose.yaml` is shaped for: a box that already runs a reverse proxy
terminating TLS for other services. Copy the file onto that box, set `DAILY_SERVER_PUBLIC_URL` to
the address the proxy terminates for this server — `https://daily.example.com`, say — and bring the
service up as shown above.

The server itself speaks plain HTTP inside the compose project's own network; the compose file
`expose`s its port to that network only, never to the host. Point the reverse proxy at the
`daily-server` service on the `daily` network the compose file defines — a proxy already running its
own compose project joins that network as an external one, under the same name — and it reaches the
container without anything else published.

## A bare VPS, no reverse proxy

No reverse proxy on this box and no domain in front of it? The compose file marks two lines as a
pair, both commented out: `DAILY_SERVER_TLS: self-signed`, and the block that publishes the port to
the host. Uncomment both, set `DAILY_SERVER_PUBLIC_URL` to an address reaching that published port —
a bare IP address is enough, no domain is required — and bring the service up the same way.

On the first start the server mints its own certificate for `DAILY_SERVER_PUBLIC_URL`'s host, under
its data directory, and reuses that same certificate on every start after. A start that finds a
certificate already on disk covering a different host refuses rather than replacing it, naming both
hosts and the certificate's path. There is no certificate authority behind this certificate, so Daily
pins its SHA-256 fingerprint the first time a device connects and requires the same fingerprint on
every connection after — real encryption without a domain, at the cost of one manual check instead
of a browser's padlock. The fingerprint is printed the moment the certificate is minted.

## Verification

While this server is unclaimed, every start checks whether `DAILY_SERVER_PUBLIC_URL` actually reaches
it, and logs the result beside the claim code: a line confirming the address reaches this server, or
a line naming why it doesn't — unreachable, answered by a different server, or answered by something
that isn't a Daily server at all. A claimed server has nothing left to prove this way and stays quiet
about it on every start after.

The same check runs on demand, against the configured address or one given on the command line:

```bash
docker compose exec daily-server daily-server verify
```

It exits non-zero and prints the same reason when the check fails, so it composes with a script or a
monitor watching the container from outside.

## Recovery

Everything recovery needs is reachable through the container, run against its own data directory:

```bash
docker compose exec daily-server daily-server status
docker compose exec daily-server daily-server claim-code
docker compose exec daily-server daily-server device list
docker compose exec daily-server daily-server device enroll
docker compose exec daily-server daily-server device revoke <id>
```

`status` reports what the server is holding: its identity, whether it is claimed, how many devices
are bound and revoked, the stored snapshot, and the assets on disk. `claim-code` prints the code an
unclaimed server needs to bind its first device; add `--regenerate` to replace it. `device enroll` is
the way back once every bound device is lost: it prints a single-use token, good for fifteen minutes,
that binds a new device directly — no other bound device needs to be online to approve it. `device
list` and `device revoke <id>` manage bound devices the rest of the time — revoking, for instance, a
Mac that was lost or decommissioned.

## Updating

Every published release carries three tags on `ghcr.io/scheron/daily-server`: the exact version,
`latest`, and a rolling `p<N>`, where `N` is this build's own `SYNC_PROTOCOL_VERSION`, read out of
the source at build time rather than typed by hand. `deploy/compose.yaml` pins the image to a `p<N>`
tag rather than to `latest`, on purpose: every build carrying the same `p<N>` tag speaks the same
Daily Sync Protocol, however many releases sit between them, and a build that would speak a different
protocol is published under a different one.

Pulling a newer image under the same `p<N>` tag and bringing the service back up is safe at any time
— it never crosses a protocol boundary. Moving to a different `p<N>` tag is a deliberate edit to the
image reference in the compose file, followed by bringing the service back up, rather than something
that happens on its own.

## License

MIT © Scheron
