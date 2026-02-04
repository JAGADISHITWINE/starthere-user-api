import CryptoJS from 'crypto-js';

const secretKey = "JagguBoss_Secret_2025!";

export function encrypt(data){
  try {
    return CryptoJS.AES.encrypt(JSON.stringify(data), secretKey).toString();
  } catch (err) {
    console.error('Encrypt error:', err);
    return '';
  }
};

export function decrypt(cipherText) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Decrypt error:', err);
    return null;
  }
};

