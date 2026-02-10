const db = require('../config/db');
const bcrypt = require('bcrypt');

const findUser = async (email) => {
  try {
    const [rows] = await db.query(
      'SELECT id, full_name, email, phone_number, password FROM users WHERE email = ?',
      [email]
    );
    return rows.length ? rows[0] : null;
  } catch (error) {
    console.error('Error in findUser:', error);
    throw error;
  }
};

// Find user by reset token (hashed) and check expiry
const findUserByResetToken = async (hashedToken) => {
  try {
    const [rows] = await db.query(
      `SELECT id, full_name, email 
       FROM users 
       WHERE reset_password_token = ? 
         AND reset_password_expires > NOW()`,
      [hashedToken]
    );
    return rows.length ? rows[0] : null;
  } catch (error) {
    console.error('Error in findUserByResetToken:', error);
    throw error;
  }
};

// Save hashed token + expiry to user row
const saveResetToken = async (userId, hashedToken, expires) => {
  try {
    await db.execute(
      `UPDATE users 
       SET reset_password_token = ?, reset_password_expires = ? 
       WHERE id = ?`,
      [hashedToken, expires, userId]
    );
  } catch (error) {
    console.error('Error in saveResetToken:', error);
    throw error;
  }
};

// Update password and clear reset token fields
const updatePassword = async (userId, hashedPassword) => {
  try {
    await db.execute(
      `UPDATE users 
       SET password = ?, reset_password_token = NULL, reset_password_expires = NULL 
       WHERE id = ?`,
      [hashedPassword, userId]
    );
  } catch (error) {
    console.error('Error in updatePassword:', error);
    throw error;
  }
};

const validatePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const saveToken = async (id, token) => {
  await db.execute(`UPDATE users SET token = ? WHERE id = ?`, [token, id]);
};

const registerUser = async (data) => {
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
};

module.exports = {
  findUser,
  findUserByResetToken,
  saveResetToken,
  updatePassword,
  validatePassword,
  saveToken,
  registerUser
};