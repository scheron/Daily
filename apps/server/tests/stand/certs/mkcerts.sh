#!/bin/sh
# Regenerates the local CA and the reverse proxy's leaf certificate used by the proxy stand.
# The key material is deliberately not kept in the tree.
set -e
cd "$(dirname "$0")"
openssl req -x509 -newkey rsa:2048 -sha256 -days 30 -nodes \
  -keyout ca.key -out ca.pem -subj "/CN=Daily Gate B Local CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl req -newkey rsa:2048 -nodes -keyout proxy.key -out proxy.csr -subj "/CN=daily.test"
cat > leaf.ext <<'EXT'
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:daily.test,DNS:localhost,IP:127.0.0.1
EXT
openssl x509 -req -in proxy.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
  -out proxy.pem -days 30 -sha256 -extfile leaf.ext
chmod 644 proxy.key ca.pem proxy.pem
