#!/bin/sh
set -eu

IMAGE="ghcr.io/scheron/daily-server:p3"
INSTALL_URL="https://raw.githubusercontent.com/scheron/Daily/main/deploy/install.sh"
PROJECT="daily-server"
HEALTH_ATTEMPTS=60
HEALTH_INTERVAL=2

domain=""
ip=""
no_proxy=0
dir=""
dry_run=0
yes=0
write_manager=""
upgrade_dir=""
previous_image=""
upgrade_archive=""

usage() {
  cat <<EOF
Usage: install.sh [--domain <host> | --ip <address>] [--no-proxy] [--dir <path>] [--dry-run] [--yes]

  --domain <host>     install for that domain, with Caddy fronting it on 80/443
  --ip <address>      install with a self-signed certificate for that address
  --no-proxy          do not install Caddy; expose to the daily network only
  --dir <path>        installation directory (default /opt/daily-server, else ~/daily-server)
  --dry-run           write the files and start nothing
  --yes               do not prompt; proceed past a failed pre-flight
  --write-manager <path>
                      rewrite only daily.sh in an existing installation
  --upgrade <path>    move an existing installation to the image pinned above,
                      backing it up first and undoing it if the move fails

Pinned image: $IMAGE
EOF
}

write_compose_caddy() {
  sed "s#__IMAGE__#$IMAGE#g" > "$1/compose.yaml" <<'EOF'
name: daily-server

services:
  daily-server:
    image: __IMAGE__
    restart: unless-stopped
    env_file:
      - .env
    expose:
      - "8787"
    volumes:
      - data:/var/lib/daily-server
    networks:
      - daily
    healthcheck:
      test: ["CMD", "daily-server", "healthcheck"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - daily

volumes:
  data:
  caddy_data:
  caddy_config:

networks:
  daily:
EOF
}

write_compose_self_signed() {
  sed "s#__IMAGE__#$IMAGE#g" > "$1/compose.yaml" <<'EOF'
name: daily-server

services:
  daily-server:
    image: __IMAGE__
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "443:8787"
    volumes:
      - data:/var/lib/daily-server
    healthcheck:
      test: ["CMD", "daily-server", "healthcheck"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  data:
EOF
}

write_compose_no_proxy() {
  sed "s#__IMAGE__#$IMAGE#g" > "$1/compose.yaml" <<'EOF'
name: daily-server

services:
  daily-server:
    image: __IMAGE__
    restart: unless-stopped
    env_file:
      - .env
    expose:
      - "8787"
    volumes:
      - data:/var/lib/daily-server
    networks:
      - daily
    healthcheck:
      test: ["CMD", "daily-server", "healthcheck"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  data:

networks:
  daily:
EOF
}

write_caddyfile() {
  sed "s#__DOMAIN__#$2#g" > "$1/Caddyfile" <<'EOF'
__DOMAIN__ {
	reverse_proxy daily-server:8787
}
EOF
}

write_env_plain() {
  sed "s#__PUBLIC_URL__#$2#g" > "$1/.env" <<'EOF'
DAILY_SERVER_PUBLIC_URL=__PUBLIC_URL__
EOF
}

write_env_self_signed() {
  sed "s#__PUBLIC_URL__#$2#g" > "$1/.env" <<'EOF'
DAILY_SERVER_PUBLIC_URL=__PUBLIC_URL__
DAILY_SERVER_TLS=self-signed
EOF
}

write_daily_sh() {
  sed -e "s#__INSTALL_DIR__#$1#g" -e "s#__INSTALL_URL__#$INSTALL_URL#g" > "$1/.daily.sh.new" <<'EOF'
#!/bin/sh
set -eu

INSTALL_DIR="__INSTALL_DIR__"
INSTALL_URL="__INSTALL_URL__"
COMPOSE_FILE="$INSTALL_DIR/compose.yaml"
cd "$INSTALL_DIR"

usage() {
  cat <<'USAGE'
Usage: daily.sh <verb>

Verbs:
  status       show the installation's status
  logs         follow the server's logs
  claim-code   print the unclaimed server's claim code
  upgrade      back up, move to the current release's image, and undo it if that fails
  backup       write a single archive with the database and the assets
  restart      restart the stack
  stop         stop the stack
  uninstall    stop the stack and remove its containers
USAGE
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

cmd_upgrade() {
  if ! command -v curl > /dev/null 2>&1; then
    echo "daily.sh: curl is needed to upgrade — install it, then run this again." >&2
    exit 1
  fi

  tmp=$(mktemp) || exit 1

  if ! curl -fsSL "$INSTALL_URL" -o "$tmp"; then
    rm -f "$tmp"
    echo "daily.sh: could not download the installer from $INSTALL_URL. Nothing was changed." >&2
    exit 1
  fi

  status=0
  sh "$tmp" --upgrade "$INSTALL_DIR" || status=$?
  rm -f "$tmp"
  exit "$status"
}

cmd_backup() {
  compose stop daily-server
  trap 'compose up -d daily-server >/dev/null 2>&1 || true' EXIT INT TERM

  tmp_dir=$(mktemp -d)
  compose cp daily-server:/var/lib/daily-server "$tmp_dir/data"
  rm -rf "$tmp_dir/data/backups"

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  archive="$INSTALL_DIR/daily-backup-$timestamp.tar.gz"
  (umask 077 && COPYFILE_DISABLE=1 tar -czf "$archive" -C "$tmp_dir" data)
  rm -rf "$tmp_dir"

  trap - EXIT INT TERM
  compose up -d daily-server

  echo "daily.sh: backup written to $archive"
}

cmd_uninstall() {
  printf 'Remove the data volumes too? This deletes the database and all assets. [y/N] '
  read -r reply || reply=""

  case "$reply" in
    [yY]*)
      compose down -v
      ;;
    *)
      compose down
      echo "daily.sh: containers removed; data volumes kept."
      ;;
  esac
}

verb="${1:-}"

case "$verb" in
  status)
    compose exec -T daily-server daily-server status
    ;;
  logs)
    compose logs -f daily-server
    ;;
  claim-code)
    compose exec -T daily-server daily-server claim-code
    ;;
  upgrade)
    cmd_upgrade
    ;;
  backup)
    cmd_backup
    ;;
  restart)
    compose restart
    ;;
  stop)
    compose stop
    ;;
  uninstall)
    cmd_uninstall
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$1/.daily.sh.new"
  mv "$1/.daily.sh.new" "$1/daily.sh"
}

have() {
  command -v "$1" > /dev/null 2>&1
}

tty_available() {
  { : < /dev/tty; } 2> /dev/null
}

ask() {
  printf '%s' "$1" > /dev/tty
  read -r reply < /dev/tty || reply=""
  [ -n "$reply" ] || reply="$2"
  printf '%s' "$reply"
}

is_ip_address() {
  case "$1" in
    *:*)
      printf '%s' "$1" | grep -Eq '^[0-9a-fA-F:]+$'
      return
      ;;
  esac

  printf '%s' "$1" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
}

normalize_address() {
  found="$1"
  found=${found#http://}
  found=${found#https://}
  found=${found%%/*}
  printf '%s' "$found"
}

detect_machine_address() {
  found=""

  if have curl; then
    found=$(curl -fsS --max-time 5 https://api.ipify.org 2> /dev/null || true)
  fi

  if [ -z "$found" ] && have ip; then
    found=$(ip route get 1.1.1.1 2> /dev/null | sed -n 's/.* src \([^ ]*\).*/\1/p' | head -n 1)
  fi

  is_ip_address "$found" || found=""
  printf '%s' "$found"
}

resolve_domain_addresses() {
  found=""

  if have getent; then
    found=$(getent hosts "$1" 2> /dev/null | awk '{print $1}' || true)
  fi

  if [ -z "$found" ] && have dig; then
    found=$(dig +short "$1" 2> /dev/null | grep -E '^[0-9a-fA-F.:]+$' || true)
  fi

  if [ -z "$found" ] && have host; then
    found=$(host "$1" 2> /dev/null | sed -n 's/.* has address //p' || true)
  fi

  printf '%s' "$found"
}

probe_port_with_docker() {
  if ! have docker; then
    return 1
  fi

  if probe_output=$(docker run --rm -p "$1:$1" --entrypoint true "$IMAGE" 2>&1); then
    return 1
  fi

  case "$probe_output" in
    *"already allocated"* | *"already in use"* | *"bind for"*) return 0 ;;
    *) return 1 ;;
  esac
}

port_listening() {
  if have ss; then
    if ss -ltn 2> /dev/null | awk 'NR > 1 {print $4}' | grep -Eq "[:.]$1\$"; then
      return 0
    fi
    return 1
  fi

  if have netstat; then
    if netstat -ltn 2> /dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; then
      return 0
    fi
    return 1
  fi

  probe_port_with_docker "$1"
}

require_docker() {
  if ! have docker; then
    echo "install.sh: docker is not installed. Install Docker Engine, then run this again." >&2
    exit 1
  fi

  if ! docker compose version > /dev/null 2>&1; then
    echo "install.sh: docker compose is not available. Install the Compose v2 plugin, then run this again." >&2
    exit 1
  fi
}

check_domain_points_here() {
  resolved=$(resolve_domain_addresses "$1")
  machine=$(detect_machine_address)

  if [ -z "$resolved" ]; then
    echo "Could not resolve $1 from this machine, so the DNS check is skipped."
    return 0
  fi

  if [ -z "$machine" ]; then
    echo "Could not work out this machine's external address, so the DNS check is skipped."
    return 0
  fi

  if printf '%s\n' "$resolved" | grep -Fqx "$machine"; then
    echo "$1 points at this machine ($machine)."
    return 0
  fi

  echo "Warning: $1 resolves to $(printf '%s' "$resolved" | tr '\n' ' ')"
  echo "but this machine's external address is $machine."
  echo "A proxied record (Cloudflare) or one that has not propagated yet both look like this."

  if [ "$yes" -eq 1 ]; then
    echo "Proceeding unverified (--yes)."
    return 0
  fi

  if ! tty_available; then
    echo "install.sh: no terminal to ask on. Re-run with --yes to proceed unverified." >&2
    exit 1
  fi

  case "$(ask "Continue anyway? [y/N] " "n")" in
    y | Y | yes | Yes | YES) return 0 ;;
    *)
      echo "Stopped. Nothing was written."
      exit 1
      ;;
  esac
}

ports_are_free() {
  if port_listening 80 || port_listening 443; then
    return 1
  fi
  return 0
}

prompt_for_address() {
  if ! tty_available; then
    echo "install.sh: no terminal to ask on — stdin is the download itself." >&2
    echo "Re-run with --domain <host>, or --ip <address> for a self-signed certificate." >&2
    exit 1
  fi

  attempt=1
  while [ "$attempt" -le 3 ]; do
    answer=$(ask "Address you will reach this server at (a domain, or Enter for this machine's IP): " "")

    if [ -n "$answer" ]; then
      answer=$(normalize_address "$answer")
      if is_ip_address "$answer"; then
        ip="$answer"
      else
        domain="$answer"
      fi
      return 0
    fi

    detected=$(detect_machine_address)

    if [ -z "$detected" ]; then
      echo "Could not work out this machine's address. Type the domain or IP to use." > /dev/tty
      attempt=$((attempt + 1))
      continue
    fi

    case "$(ask "Use $detected, with a self-signed certificate? [Y/n] " "y")" in
      y | Y | yes | Yes | YES)
        ip="$detected"
        return 0
        ;;
      *) attempt=$((attempt + 1)) ;;
    esac
  done

  echo "install.sh: no address given. Re-run with --domain <host> or --ip <address>." >&2
  exit 1
}

compose() {
  (cd "$dir" && docker compose "$@")
}

compose_field() {
  compose ps --format json "$1" 2> /dev/null \
    | tr ',' '\n' \
    | grep "\"$2\":" \
    | head -n 1 \
    | sed -e 's/^.*: *"//' -e 's/".*$//'
}

wait_for_health() {
  attempt=1

  while [ "$attempt" -le "$HEALTH_ATTEMPTS" ]; do
    health=$(compose_field daily-server Health)

    if [ "$health" = "healthy" ]; then
      echo " ready"
      return 0
    fi

    if [ -z "$health" ] && compose exec -T daily-server daily-server healthcheck > /dev/null 2>&1; then
      echo " ready"
      return 0
    fi

    if container_is_failing; then
      echo ""
      return 1
    fi

    printf '.'
    sleep "$HEALTH_INTERVAL"
    attempt=$((attempt + 1))
  done

  echo ""
  return 1
}

container_id() {
  compose ps -aq daily-server 2> /dev/null | head -n 1
}

container_is_failing() {
  state=$(compose_field daily-server State)
  [ "$state" != "exited" ] || return 0

  cid=$(container_id)
  [ -n "$cid" ] || return 1

  count=$(docker inspect -f '{{.RestartCount}}' "$cid" 2> /dev/null || echo 0)

  case "$count" in
    '' | *[!0-9]*) return 1 ;;
  esac

  [ "$count" -gt 0 ]
}

read_pin() {
  sed -n 's#^[[:space:]]*image:[[:space:]]*\(ghcr\.io/scheron/daily-server:[^[:space:]]*\).*#\1#p' "$1/compose.yaml" 2> /dev/null | head -n 1
}

write_pin() {
  sed "s#^\([[:space:]]*image:[[:space:]]*\)ghcr\.io/scheron/daily-server:[^[:space:]]*#\1$2#" "$1/compose.yaml" > "$1/.compose.yaml.new"
  mv "$1/.compose.yaml.new" "$1/compose.yaml"
}

image_id() {
  docker image inspect -f '{{.Id}}' "$1" 2> /dev/null || true
}

running_image_id() {
  cid=$(container_id)
  [ -n "$cid" ] || return 0
  docker inspect -f '{{.Image}}' "$cid" 2> /dev/null || true
}

data_volume_name() {
  cid=$(container_id)

  if [ -n "$cid" ]; then
    found=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/daily-server"}}{{.Name}}{{end}}{{end}}' "$cid" 2> /dev/null || true)
    if [ -n "$found" ]; then
      printf '%s' "$found"
      return 0
    fi
  fi

  printf '%s' "${PROJECT}_data"
}

create_upgrade_backup() {
  tmp_dir=$(mktemp -d) || return 1

  if ! compose cp daily-server:/var/lib/daily-server "$tmp_dir/data" > /dev/null 2>&1; then
    rm -rf "$tmp_dir"
    return 1
  fi

  rm -rf "$tmp_dir/data/backups"

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  upgrade_archive="$dir/daily-preupgrade-$timestamp.tar.gz"

  if ! (umask 077 && COPYFILE_DISABLE=1 tar -czf "$upgrade_archive" -C "$tmp_dir" data); then
    rm -rf "$tmp_dir" "$upgrade_archive"
    return 1
  fi

  rm -rf "$tmp_dir"
}

put_back_upgrade_backup() {
  volume=$(data_volume_name)
  [ -n "$volume" ] || return 1

  gzip -dc "$upgrade_archive" \
    | docker run --rm -i --user 0 --entrypoint sh -v "$volume:/var/lib/daily-server" "$previous_image" -c \
      'set -e
       owner=$(stat -c "%u:%g" /var/lib/daily-server)
       find /var/lib/daily-server -mindepth 1 -maxdepth 1 ! -name backups -exec rm -rf {} +
       tar -xf - -C /var/lib/daily-server --strip-components=1 --no-same-owner
       chown -R "$owner" /var/lib/daily-server'
}

undo_upgrade() {
  echo "" >&2
  echo "install.sh: $1." >&2
  echo "Putting $previous_image and the pre-upgrade backup back." >&2

  compose stop daily-server > /dev/null 2>&1 || true

  if ! put_back_upgrade_backup; then
    echo "install.sh: the pre-upgrade data could not be put back automatically." >&2
    echo "Nothing in $upgrade_archive has been touched; it holds the database and the assets as they were." >&2
  fi

  mv "$dir/.compose.yaml.rollback" "$dir/compose.yaml"

  if ! compose up -d daily-server; then
    echo "install.sh: $previous_image could not be started again. The pre-upgrade backup is at $upgrade_archive." >&2
    exit 1
  fi

  printf 'Waiting for the server on %s' "$previous_image"

  if ! wait_for_health; then
    echo "install.sh: $previous_image did not become healthy either. The pre-upgrade backup is at $upgrade_archive." >&2
    compose logs --tail 40 daily-server >&2 || true
    exit 1
  fi

  echo ""
  echo "The upgrade was undone. The server is running $previous_image again, with the data it had before."
  echo "The pre-upgrade backup is kept at $upgrade_archive"
  exit 1
}

run_upgrade() {
  if [ ! -f "$dir/compose.yaml" ]; then
    echo "install.sh: $dir holds no compose.yaml, so it is not an installation" >&2
    exit 1
  fi

  require_docker

  previous_image=$(read_pin "$dir")

  if [ -z "$previous_image" ]; then
    echo "install.sh: $dir/compose.yaml pins no ghcr.io/scheron/daily-server image, so this cannot tell what it would be replacing." >&2
    echo "Nothing was changed." >&2
    exit 1
  fi

  write_daily_sh "$dir"

  echo "Installed: $previous_image"
  echo "Release:   $IMAGE"
  echo ""

  was_running=$(running_image_id)
  docker pull "$IMAGE" || {
    echo "install.sh: $IMAGE could not be pulled. Nothing was changed; the server is still running $previous_image." >&2
    exit 1
  }

  if [ "$previous_image" = "$IMAGE" ] && [ -n "$was_running" ] && [ "$was_running" = "$(image_id "$IMAGE")" ]; then
    echo ""
    echo "Already running the current image. Nothing to change."
    exit 0
  fi

  echo ""
  echo "Backing up before anything moves"
  compose stop daily-server

  if ! create_upgrade_backup; then
    compose up -d daily-server > /dev/null 2>&1 || true
    echo "install.sh: the backup could not be taken, so nothing was upgraded." >&2
    exit 1
  fi

  echo "Backup written to $upgrade_archive"

  cp "$dir/compose.yaml" "$dir/.compose.yaml.rollback"
  write_pin "$dir" "$IMAGE"

  if ! compose up -d daily-server; then
    undo_upgrade "the server could not be started on $IMAGE"
  fi

  printf 'Waiting for the server'

  if ! wait_for_health; then
    compose logs --tail 40 daily-server >&2 || true
    undo_upgrade "the server did not become healthy on $IMAGE"
  fi

  rm -f "$dir/.compose.yaml.rollback"

  echo ""
  echo "Upgraded: $previous_image -> $IMAGE"
  echo "The pre-upgrade backup is kept at $upgrade_archive"
}

read_claim_code() {
  compose exec -T daily-server daily-server claim-code 2> /dev/null | tr -d '\r' | head -n 1
}

read_fingerprint() {
  found=$(compose exec -T daily-server sh -c 'echo | openssl s_client -connect 127.0.0.1:8787 2> /dev/null | openssl x509 -noout -fingerprint -sha256 2> /dev/null' 2> /dev/null \
    | tr -d '\r' \
    | sed -n 's/.*Fingerprint=//p' \
    | head -n 1)

  if [ -z "$found" ]; then
    found=$(compose logs daily-server 2> /dev/null \
      | tr -d '\r' \
      | sed -n 's/.*fingerprint (SHA-256): *//p' \
      | tail -n 1)
  fi

  printf '%s' "$found"
}

daily_network_name() {
  found=$(docker network ls --format "{{.Name}}" 2> /dev/null | grep -E "^${PROJECT}[_-]daily\$" | head -n 1 || true)
  [ -n "$found" ] || found="${PROJECT}_daily"
  printf '%s' "$found"
}

print_report() {
  claim_code=$(read_claim_code)

  echo ""
  echo "Daily sync server installed in $dir"
  echo ""
  echo "  Address:     $public_url"

  if [ -n "$claim_code" ]; then
    echo "  Claim code:  $claim_code"
  else
    echo "  Claim code:  already claimed — $dir/daily.sh claim-code"
  fi

  echo "  Manage it:   $dir/daily.sh"

  case "$topology" in
    self-signed)
      fingerprint=$(read_fingerprint)
      if [ -n "$fingerprint" ]; then
        echo "  Certificate fingerprint (SHA-256): $fingerprint"
        echo ""
        echo "The app shows the same fingerprint when it connects, so the two can be compared."
      else
        echo ""
        echo "The certificate fingerprint could not be read here; $dir/daily.sh logs prints it at startup."
      fi
      ;;
    caddy)
      echo ""
      echo "Caddy is asking Let's Encrypt for a certificate; the address answers once it has one."
      ;;
    no-proxy)
      echo ""
      echo "Route your own proxy to this server:"
      echo ""
      echo "  Upstream:    http://daily-server:8787"
      echo "  Reach it:    docker network connect $(daily_network_name) <your-proxy-container>"
      echo "  Body limit:  raise it past 100 MB (nginx: client_max_body_size 128m), or attachments fail while everything else looks healthy"
      ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      [ $# -ge 2 ] || { echo "install.sh: --domain needs a value" >&2; exit 1; }
      domain="$2"
      shift 2
      ;;
    --ip)
      [ $# -ge 2 ] || { echo "install.sh: --ip needs a value" >&2; exit 1; }
      ip="$2"
      shift 2
      ;;
    --no-proxy)
      no_proxy=1
      shift
      ;;
    --dir)
      [ $# -ge 2 ] || { echo "install.sh: --dir needs a value" >&2; exit 1; }
      dir="$2"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --yes)
      yes=1
      shift
      ;;
    --write-manager)
      [ $# -ge 2 ] || { echo "install.sh: --write-manager needs a value" >&2; exit 1; }
      write_manager="$2"
      shift 2
      ;;
    --upgrade)
      [ $# -ge 2 ] || { echo "install.sh: --upgrade needs a value" >&2; exit 1; }
      upgrade_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install.sh: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -n "$write_manager" ]; then
  if [ ! -f "$write_manager/compose.yaml" ]; then
    echo "install.sh: $write_manager holds no compose.yaml, so it is not an installation" >&2
    exit 1
  fi

  write_daily_sh "$write_manager"

  pinned=$(read_pin "$write_manager")

  if [ -n "$pinned" ] && [ "$pinned" != "$IMAGE" ]; then
    echo "This installation runs $pinned; this release is $IMAGE."
    echo "Run $write_manager/daily.sh upgrade once more to move it across."
  fi

  exit 0
fi

if [ -n "$upgrade_dir" ]; then
  dir="$upgrade_dir"
  run_upgrade
  exit 0
fi

if [ -n "$domain" ] && [ -n "$ip" ]; then
  echo "install.sh: pass only one of --domain or --ip" >&2
  exit 1
fi

if [ -z "$domain" ] && [ -z "$ip" ]; then
  if [ "$yes" -eq 1 ]; then
    echo "install.sh: --yes answers no questions, so pass --domain <host> or --ip <address>." >&2
    exit 1
  fi
  prompt_for_address
fi

if [ -z "$dir" ]; then
  if [ -w /opt ]; then
    dir="/opt/daily-server"
  else
    dir="$HOME/daily-server"
  fi
fi

if [ "$dry_run" -eq 0 ]; then
  require_docker

  if [ "$no_proxy" -eq 0 ] && ! ports_are_free; then
    echo "Something already listens on 80 or 443 here, so no proxy of ours is installed."
    echo "The server is installed on its own; the lines to route your own proxy to it are printed at the end."
    no_proxy=1
  fi

  if [ -n "$domain" ]; then
    check_domain_points_here "$domain"
  fi
fi

if [ "$no_proxy" -eq 1 ]; then
  topology="no-proxy"
elif [ -n "$ip" ]; then
  topology="self-signed"
else
  topology="caddy"
fi

if [ -n "$domain" ]; then
  public_host="$domain"
else
  public_host="$ip"
fi

public_url="https://$public_host"

mkdir -p "$dir"

case "$topology" in
  caddy)
    write_compose_caddy "$dir"
    write_caddyfile "$dir" "$domain"
    write_env_plain "$dir" "$public_url"
    ;;
  self-signed)
    write_compose_self_signed "$dir"
    write_env_self_signed "$dir" "$public_url"
    ;;
  no-proxy)
    write_compose_no_proxy "$dir"
    write_env_plain "$dir" "$public_url"
    ;;
esac

write_daily_sh "$dir"

if [ "$dry_run" -eq 1 ]; then
  echo "Wrote installation to $dir (dry run — nothing started)"
  exit 0
fi

echo "Starting the stack in $dir"
compose up -d

printf 'Waiting for the server'

if ! wait_for_health; then
  echo "install.sh: the server did not become healthy within $((HEALTH_ATTEMPTS * HEALTH_INTERVAL)) seconds." >&2
  compose logs --tail 40 daily-server >&2 || true
  exit 1
fi

if [ "$topology" = "caddy" ]; then
  caddy_state=$(compose_field caddy State)
  case "$caddy_state" in
    running) ;;
    *)
      echo "install.sh: caddy did not stay up (state: ${caddy_state:-unknown})." >&2
      compose logs --tail 40 caddy >&2 || true
      exit 1
      ;;
  esac
fi

print_report
