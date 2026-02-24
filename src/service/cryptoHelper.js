const CryptoJS = require('crypto-js');
require('dotenv').config();

// Use a runtime secret injected via environment. Do NOT hard-code secrets in repo.
const secretKey = process.env.CRYPTO_SECRET || '';

if (!secretKey) {
  console.warn('CRYPTO_SECRET is not set. encrypt/decrypt will try to operate but this is insecure for production.');
}

function encrypt(data){
  try {
    if (!secretKey) {
      // Fallback: return JSON string (NOT encrypted). This keeps behavior predictable
      // but is insecure — set CRYPTO_SECRET in env for real encryption.
      return JSON.stringify(data);
    }
    return CryptoJS.AES.encrypt(JSON.stringify(data), secretKey).toString();
  } catch (err) {
    console.error('Encrypt error:', err.message || err);
    return '';
  }
};
function decrypt(cipherText) {
  try {
    if (!secretKey) {
      // If secret not set, assume payload may be plaintext JSON
      try {
        return JSON.parse(cipherText);
      } catch (e) {
        console.error('Decrypt error (no secret): payload not JSON');
        return null;
      }
    }
    const bytes = CryptoJS.AES.decrypt(cipherText, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Decrypt error:', err.message || err);
    return null;
  }
};

module.exports = { encrypt, decrypt };

