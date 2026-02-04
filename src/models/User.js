const db = require('../config/db');
const bcrypt = require('bcrypt');

const findUser = async (email) => {
    try {
        const [rows] = await db.query('SELECT id, full_name, email, phone_number, password FROM users WHERE email = ?', [email]);
        return rows.length ? rows[0] : null;
    } catch (error) {
        console.error('Error in findUser:', error);
        throw error;
    }
};


// Validate password
async function validatePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
}

async function saveToken(id, token) {
  const query = `UPDATE users SET token = ? WHERE id = ?`;
  await db.execute(query, [token, id]);
}

async function registerUser(data) {
  const sql = `
    INSERT INTO users 
    (full_name, email, phone_number, password, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  `;

  return db.execute(sql, [
    data.name,
    data.email,
    data.phone,
    data.password,
    data.is_active
  ]);
}


module.exports = { findUser, validatePassword, saveToken , registerUser};