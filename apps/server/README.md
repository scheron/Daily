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
for `linux/amd64` and `linux/arm64`. There is nothing to clone, nothing to build, and nothing to run
first.

### One command

Enough to try the server out, and enough to keep running it on a bare VPS with no reverse proxy in
front of it:

```bash
docker run -d --name daily-server --restart unless-stopped \
  -v daily-data:/var/lib/daily-server \
  -e DAILY_SERVER_PUBLIC_URL=https://203.0.113.10:8787 \
  -e DAILY_SERVER_TLS=self-signed \
  -p 8787:8787 \
  ghcr.io/scheron/daily-server:p1
```

The image carries its own data directory, entry point and default command, so nothing else needs
setting. `docker logs daily-server` prints the claim code Daily asks for, and beside it the result of
this server's check that the address above actually reaches it.

### A compose file

Better for a server meant to stay up, because the file is where the configuration still is when it
needs changing months later. Save this as `compose.yaml`:

```yaml
name: daily-server

services:
  daily-server:
    image: ghcr.io/scheron/daily-server:p1
    restart: unless-stopped
    environment:
      # The address the Daily app connects to. It is also the address the server
      # verifies on every start while it is still unclaimed.
      DAILY_SERVER_PUBLIC_URL: https://daily.example.com
      # No reverse proxy in front of this server? Uncomment the line below and the
      # ports block that follows it. They are a pair: the server then mints a
      # certificate for the public URL's host and serves HTTPS on the published port.
      # DAILY_SERVER_TLS: self-signed
    # ports:
    #   - "8787:8787"
    expose:
      - "8787"
    volumes:
      - data:/var/lib/daily-server
    networks:
      - daily
    healthcheck:
      test:
        - CMD
        - node
        - --no-warnings
        - -e
        - |
          const port = process.env.DAILY_SERVER_PORT || "8787"
          const secure = process.env.DAILY_SERVER_TLS === "self-signed" || Boolean(process.env.DAILY_SERVER_CERT && process.env.DAILY_SERVER_KEY)
          if (secure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
          const url = (secure ? "https" : "http") + "://127.0.0.1:" + port + "/v1/server"
          fetch(url).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  data:

networks:
  # A reverse proxy running in another compose project reaches this server by
  # joining this network as an external one, under the name "daily".
  daily:
    name: daily
```

Then, from the directory holding it:

```bash
docker compose up -d
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

This is the topology the compose file above is shaped for: a box that already runs a reverse proxy
terminating TLS for other services. Set `DAILY_SERVER_PUBLIC_URL` to the address the proxy terminates
for this server — `https://daily.example.com`, say — and bring the service up as shown above.

The server itself speaks plain HTTP inside the compose project's own network; the compose file
`expose`s its port to that network only, never to the host. The proxy reaches it as
`daily-server:8787` on the `daily` network, without anything published to the host at all.

Three edits, in this order. Nothing here is optional and nothing else is needed.

### 1. Bring this server up first

The compose file above is what creates the `daily` network, and a proxy running in its own compose
project joins that same network as an _external_ one. An external network has to exist before
anything can join it, so this server goes up before the proxy is touched:

```bash
docker compose up -d
```

The other order fails with `network daily declared as external, but could not be found`. Nothing is
wrong when that happens except the order — and pre-creating the network by hand does not help, since
Compose refuses a network it did not label itself.

### 2. Join the proxy to that network

In the proxy's own compose file, put the network on the proxy service and declare it external at the
bottom. Only these two fragments change; the rest of that file stays as it is:

```yaml
services:
  caddy:
    networks:
      - daily

networks:
  daily:
    name: daily
    external: true
```

### 3. Route the address to `daily-server:8787`

Caddy, in the `Caddyfile`:

```
daily.example.com {
	reverse_proxy daily-server:8787
}
```

nginx — note the body limit, which has to clear `DAILY_SERVER_MAX_ASSET_BYTES` (100 MB by default)
or attachments fail to upload while everything else looks healthy:

```nginx
server {
	server_name daily.example.com;

	location / {
		proxy_pass http://daily-server:8787;
		proxy_set_header Host $host;
		client_max_body_size 128m;
	}
}
```

Traefik, as labels on this server's own service in the compose file above:

```yaml
labels:
  traefik.enable: "true"
  traefik.http.routers.daily.rule: Host(`daily.example.com`)
  traefik.http.routers.daily.entrypoints: websecure
  traefik.http.routers.daily.tls.certresolver: letsencrypt
  traefik.http.services.daily.loadbalancer.server.port: "8787"
```

Then `docker compose up -d` in the proxy's project. The address is live.

### The first start reports a failed address, and that is expected

Because this server has to come up before the proxy can join its network, the very first start
happens while nothing yet routes to the public address. It says so, right under the claim code:

```
This server is unclaimed. Claim code: 547560
Public address verification failed: Could not reach https://daily.example.com/v1/server: …
```

Nothing is wrong. While the server is unclaimed the check repeats every 30 seconds for ten minutes,
so finishing the proxy in that window turns the failure into a confirmation on its own, with no
restart:

```
Public address verified: https://daily.example.com reaches this server.
```

Past that window, `docker compose exec daily-server daily-server verify` re-checks on demand and
prints the same answer.

## A bare VPS, no reverse proxy

No reverse proxy on this box and no domain in front of it? The single command above is already this
topology, and needs nothing further. Running it from the compose file instead means uncommenting the
two lines it marks as a pair — `DAILY_SERVER_TLS: self-signed`, and the block that publishes the port
to the host — and setting `DAILY_SERVER_PUBLIC_URL` to an address reaching that published port. A
bare IP address is enough; no domain is required.

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
the source at build time rather than typed by hand. The compose file above pins the image to a `p<N>`
tag rather than to `latest`, on purpose: every build carrying the same `p<N>` tag speaks the same
Daily Sync Protocol, however many releases sit between them, and a build that would speak a different
protocol is published under a different one.

Pulling a newer image under the same `p<N>` tag and bringing the service back up is safe at any time
— it never crosses a protocol boundary. Moving to a different `p<N>` tag is a deliberate edit to the
image reference in the compose file, followed by bringing the service back up, rather than something
that happens on its own.

## License

MIT © Scheron
