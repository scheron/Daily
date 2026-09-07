#!/bin/sh
set -eu

IMAGE="ghcr.io/scheron/daily-server:p1"
PROJECT="daily-server"
HEALTH_ATTEMPTS=60
HEALTH_INTERVAL=2

domain=""
ip=""
no_proxy=0
dir=""
dry_run=0
yes=0

usage() {
  cat <<EOF
Usage: install.sh [--domain <host> | --ip <address>] [--no-proxy] [--dir <path>] [--dry-run] [--yes]

  --domain <host>     install for that domain, with Caddy fronting it on 80/443
  --ip <address>      install with a self-signed certificate for that address
  --no-proxy          do not install Caddy; expose to the daily network only
  --dir <path>        installation directory (default /opt/daily-server, else ~/daily-server)
  --dry-run           write the files and start nothing
  --yes               do not prompt; proceed past a failed pre-flight

Pinned image: $IMAGE
EOF
}

write_compose_caddy() {
  cat <<'EOF' > "$1/compose.yaml"
name: daily-server

services:
  daily-server:
    image: ghcr.io/scheron/daily-server:p1
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
  cat <<'EOF' > "$1/compose.yaml"
name: daily-server

services:
  daily-server:
    image: ghcr.io/scheron/daily-server:p1
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
  cat <<'EOF' > "$1/compose.yaml"
name: daily-server

services:
  daily-server:
    image: ghcr.io/scheron/daily-server:p1
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
  sed "s#__INSTALL_DIR__#$1#g" > "$1/daily.sh" <<'EOF'
#!/bin/sh
set -eu

INSTALL_DIR="__INSTALL_DIR__"
COMPOSE_FILE="$INSTALL_DIR/compose.yaml"
cd "$INSTALL_DIR"

usage() {
  cat <<'USAGE'
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
USAGE
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

cmd_backup() {
  compose stop daily-server

  tmp_dir=$(mktemp -d)
  compose cp daily-server:/var/lib/daily-server "$tmp_dir/data"

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  archive="$INSTALL_DIR/daily-backup-$timestamp.tar.gz"
  tar -czf "$archive" -C "$tmp_dir" data
  rm -rf "$tmp_dir"

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
    compose pull daily-server
    compose up -d daily-server
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
  chmod +x "$1/daily.sh"
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

    printf '.'
    sleep "$HEALTH_INTERVAL"
    attempt=$((attempt + 1))
  done

  echo ""
  return 1
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
