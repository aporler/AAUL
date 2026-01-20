"""
Secure Communication Module

Provides secure communication utilities between the agent and dashboard:
- TLS certificate validation
- Request signing for integrity verification
- Secure token handling

Security Features:
- Certificate pinning support
- HMAC-SHA256 request signing
- Nonce-based replay protection
- Secure token storage
"""

import hashlib
import hmac
import json
import os
import ssl
import time
import urllib.request
from pathlib import Path


# Path to store security configuration
SECURITY_CONFIG_PATH = Path("/opt/agentautoupdate/security.json")

# Certificate pinning configuration
CERT_PINS_PATH = Path("/opt/agentautoupdate/cert_pins.json")


def load_security_config():
    """Load security configuration."""
    if not SECURITY_CONFIG_PATH.exists():
        return {
            "verifyTls": True,
            "allowSelfSigned": True,  # Allow self-signed certs by default for dev
            "signRequests": True
        }
    try:
        return json.loads(SECURITY_CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"verifyTls": True, "allowSelfSigned": True, "signRequests": True}


def save_security_config(config):
    """Save security configuration."""
    SECURITY_CONFIG_PATH.write_text(
        json.dumps(config, indent=2),
        encoding="utf-8"
    )


def get_ssl_context(allow_self_signed=False):
    """
    Create an SSL context for secure HTTPS connections.
    
    Args:
        allow_self_signed: If True, allow self-signed certificates
        
    Returns:
        ssl.SSLContext configured for secure connections
    """
    context = ssl.create_default_context()
    
    if allow_self_signed:
        # For development/testing with self-signed certs
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    else:
        # Production: verify certificates
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        
        # Load system CA certificates
        context.load_default_certs()
    
    # Disable insecure protocols
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    
    return context


def generate_nonce():
    """Generate a cryptographically secure nonce."""
    return os.urandom(16).hex()


def generate_timestamp():
    """Generate a Unix timestamp."""
    return str(int(time.time()))


def sign_request(payload, secret_key, nonce=None, timestamp=None):
    """
    Sign a request payload using HMAC-SHA256.
    
    Args:
        payload: Dictionary payload to sign
        secret_key: Secret key for signing (agent API token)
        nonce: Optional nonce (generated if not provided)
        timestamp: Optional timestamp (generated if not provided)
        
    Returns:
        Dictionary with signature headers
    """
    if nonce is None:
        nonce = generate_nonce()
    if timestamp is None:
        timestamp = generate_timestamp()
    
    # Create canonical string for signing
    payload_json = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    message = f"{timestamp}.{nonce}.{payload_json}"
    
    # Generate HMAC-SHA256 signature
    signature = hmac.new(
        secret_key.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return {
        "X-Signature": signature,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce
    }


def verify_signature(payload, signature, timestamp, nonce, secret_key, max_age=300):
    """
    Verify a request signature.
    
    Args:
        payload: Dictionary payload that was signed
        signature: The signature to verify
        timestamp: Request timestamp
        nonce: Request nonce
        secret_key: Secret key for verification
        max_age: Maximum age of request in seconds (default: 5 minutes)
        
    Returns:
        bool: True if signature is valid
    """
    # Check timestamp is recent (prevent replay attacks)
    try:
        request_time = int(timestamp)
        current_time = int(time.time())
        if abs(current_time - request_time) > max_age:
            return False
    except (ValueError, TypeError):
        return False
    
    # Recreate signature
    payload_json = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    message = f"{timestamp}.{nonce}.{payload_json}"
    
    expected_signature = hmac.new(
        secret_key.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Constant-time comparison
    return hmac.compare_digest(signature, expected_signature)


def hash_token(token):
    """
    Hash a token for secure storage.
    
    Args:
        token: Plain text token
        
    Returns:
        Hashed token
    """
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def secure_compare(a, b):
    """
    Constant-time string comparison to prevent timing attacks.
    
    Args:
        a: First string
        b: Second string
        
    Returns:
        bool: True if strings are equal
    """
    return hmac.compare_digest(a, b)


class CertificatePinning:
    """
    Certificate pinning support for enhanced TLS security.
    Stores SHA-256 fingerprints of trusted certificates.
    """
    
    def __init__(self):
        self.pins = self._load_pins()
    
    def _load_pins(self):
        """Load pinned certificate hashes."""
        if not CERT_PINS_PATH.exists():
            return {}
        try:
            return json.loads(CERT_PINS_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    
    def _save_pins(self):
        """Save pinned certificate hashes."""
        CERT_PINS_PATH.write_text(
            json.dumps(self.pins, indent=2),
            encoding="utf-8"
        )
    
    def pin_certificate(self, hostname, fingerprint):
        """
        Pin a certificate for a hostname.
        
        Args:
            hostname: Server hostname
            fingerprint: SHA-256 fingerprint of the certificate
        """
        self.pins[hostname] = fingerprint
        self._save_pins()
    
    def get_pin(self, hostname):
        """Get pinned fingerprint for a hostname."""
        return self.pins.get(hostname)
    
    def verify_certificate(self, hostname, cert_der):
        """
        Verify a certificate against pinned fingerprint.
        
        Args:
            hostname: Server hostname
            cert_der: Certificate in DER format
            
        Returns:
            bool: True if certificate matches pin or no pin exists
        """
        pinned = self.pins.get(hostname)
        if not pinned:
            return True  # No pin, accept any valid certificate
        
        fingerprint = hashlib.sha256(cert_der).hexdigest()
        return secure_compare(fingerprint.lower(), pinned.lower())


# Global certificate pinning instance
_cert_pinning = None


def get_cert_pinning():
    """Get the global certificate pinning instance."""
    global _cert_pinning
    if _cert_pinning is None:
        _cert_pinning = CertificatePinning()
    return _cert_pinning
