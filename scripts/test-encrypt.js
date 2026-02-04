require('dotenv').config();
const { encryptObject } = require('../src/service/crypto');
const fetch = globalThis.fetch || require('node-fetch');

async function run() {
  const payload = { email: 'test@example.com', password: 'Password123' };
  const enc = await encryptObject(payload);
  const res = await fetch(`http://localhost:${process.env.PORT || 4002}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Encrypted': '1'
    },
    body: JSON.stringify({ payload: enc })
  });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Raw response:', text);
}

run().catch(err => console.error(err));
