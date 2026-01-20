# SSL/TLS Certificates Directory

This directory contains SSL/TLS certificates for HTTPS support.

## Supported Certificate Types

1. **Let's Encrypt** (Recommended for public servers)
2. **Commercial certificates** (DigiCert, Comodo, etc.)
3. **Self-signed certificates** (for testing/internal use)

## File Naming Convention

- `server.key` - Private key file
- `server.crt` - Certificate file
- `ca.crt` - CA chain file (optional, for commercial certs)

## Generating Self-Signed Certificates

```bash
# Generate a self-signed certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=CA/ST=Quebec/L=Montreal/O=AutoUpdateLinux/CN=localhost"
```

## Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt install certbot

# Generate certificate (standalone mode)
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

## Configuration

Set these in your `config.json` or environment variables:

```json
{
  "ssl": {
    "enabled": true,
    "keyPath": "./server/ssl/server.key",
    "certPath": "./server/ssl/server.crt",
    "caPath": "./server/ssl/ca.crt"
  }
}
```

Or via environment:
```bash
SSL_ENABLED=true
SSL_KEY_PATH=./server/ssl/server.key
SSL_CERT_PATH=./server/ssl/server.crt
SSL_CA_PATH=./server/ssl/ca.crt
```
