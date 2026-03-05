const crypto = require("crypto");

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function getKey() {
  const secret = process.env.PUBLIC_REF_SECRET || process.env.CRYPTO_SECRET || "";
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function encodePublicRef(entity, id, ttlSeconds = 0) {
  const key = getKey();
  if (!key) return String(id || "");

  const payload = {
    e: String(entity || "").trim(),
    i: String(id || "").trim(),
  };
  if (Number(ttlSeconds) > 0) {
    payload.exp = Math.floor(Date.now() / 1000) + Number(ttlSeconds);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return base64UrlEncode(Buffer.concat([iv, tag, encrypted]));
}

function decodePublicRef(publicRef, expectedEntity) {
  const key = getKey();
  if (!key) return null;

  try {
    const raw = base64UrlDecode(publicRef);
    if (raw.length <= 28) return null;

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decoded = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    const payload = JSON.parse(decoded);
    if (!payload?.e || !payload?.i) return null;
    if (expectedEntity && payload.e !== expectedEntity) return null;
    if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;

    return String(payload.i);
  } catch {
    return null;
  }
}

module.exports = {
  encodePublicRef,
  decodePublicRef,
};
