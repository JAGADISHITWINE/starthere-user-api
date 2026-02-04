# Encryption integration (server)

This folder contains the server-side helpers and middleware that pair with the client-side encryption implementation in the Start-Here client.

Overview
- The client encrypts request bodies using AES-GCM and sends them as `{ payload: "<base64>" }` with header `X-Encrypted: 1`.
- This server middleware detects `X-Encrypted: 1`, decrypts `req.body.payload`, and replaces `req.body` with the decrypted object.
- If the incoming request was encrypted, the middleware will also encrypt responses (wrap `res.json`) and set `X-Encrypted: 1` on the response.

Crypto parameters (must match the client)
- PBKDF2 with SHA-256, 100000 iterations, key length 32 bytes
- AES-256-GCM
- IV length 12 bytes
- Auth tag 16 bytes
- Combined format sent over the wire: `base64(iv + ciphertext + authTag)`

Configuration
- Set the following variables in `.env` (this repo's `.env` already contains placeholders):
  - `ENCRYPTION_KEY` — a strong passphrase shared with the client (for development only)
  - `ENCRYPTION_SALT` — salt used for PBKDF2 (defaults to `start-here-salt` if not set)

Security notes
- Embedding a symmetric key in a client application is insecure for production. For production use-cases prefer one of:
  - Keep transport security (HTTPS/TLS) and handle any payload-level encryption on the server side only.
  - Use asymmetric cryptography (client encrypts with server's public key) so the client cannot decrypt server responses.
  - Use authenticated sessions / tokens and server-side encryption for stored data.

Quick test
- Start the server:
  ```bash
  # from start-hereApis/userApis
  npm install
  node server.js
  ```
- In another terminal (ensure `.env` ENCRYPTION_KEY matches the client), run the test encrypt script to call `/api/auth/login` with an encrypted payload:
  ```bash
  node scripts/test-encrypt.js
  ```

If you want, I can add the counterpart Node code in the client repo to run the same derivation for local testing or implement asymmetric encryption for a more secure production-ready setup.

Opt-in per-route
----------------
You can enable encryption only for specific routes by setting `ENCRYPT_ROUTES` in your `.env` file to a comma-separated list of path prefixes. Example:

```
ENCRYPT_ROUTES=/api/auth,/api/secure
```

When `ENCRYPT_ROUTES` is set, the middleware will only decrypt/encrypt requests whose path begins with one of the configured prefixes and when the request includes header `X-Encrypted: 1`.

Asymmetric hybrid example
-------------------------
An example hybrid RSA+AES implementation is included under `src/examples/asymmetric/`.
- The client generates a random AES key, encrypts the payload with AES-GCM and encrypts the AES key using the server RSA public key.
- The server decrypts the AES key with its RSA private key and then decrypts the payload.

Files:
- `src/examples/asymmetric/server_asymmetric_example.js` — small Express endpoint that accepts `{ key, payload }` where `key` is RSA-encrypted AES key (base64) and `payload` is base64(iv + ciphertext + tag).
- `src/examples/asymmetric/client_asymmetric_example.js` — Node script showing how to encrypt the AES key with server public key and payload with AES-GCM.
- `src/examples/asymmetric/keys/*` — placeholder example keys (replace with real keys for testing).

This asymmetric example is illustrative. For production you should manage keys securely (don't commit private keys), use a proper key exchange, and consider TLS in addition to any application-layer crypto.
