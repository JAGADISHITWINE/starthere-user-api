const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');                         // ← was missing
const UserModel = require('../models/User');
const { encrypt, decrypt } = require('../service/cryptoHelper');
require('dotenv').config();
const emailService = require('../service/emailService');

async function login(req, res) {
  try {
    const decryptedBody = decrypt(req.body.encryptedPayload);
    if (!decryptedBody) {
      return res.status(400).json({ response: false, message: 'Invalid request format' });
    }

    const { email, password } = decryptedBody;

    const user = await UserModel.findUser(email);
    if (!user) {
      return res.status(401).json({ response: false, message: 'User not found' });
    }

    const isValid = await UserModel.validatePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ response: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id:    user.id,
        name:  user.full_name,
        email: user.email,
        phone: user.phone_number
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await UserModel.saveToken(user.id, token);

    const encryptedResponse = encrypt({ response: true, message: 'Login successful', token });

    return res.status(200).json({ data: encryptedResponse });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ response: false, message: 'Something went wrong.' });
  }
}


// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
async function register(req, res) {
  try {
    const decryptedBody = decrypt(req.body.encryptedPayload);
    const { name, email, phone, password } = decryptedBody;

    const exists = await UserModel.findUser(email);
    if (exists) {
      return res.status(409).json({ response: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await UserModel.registerUser({
      name,
      email,
      phone,
      password: hashedPassword,
      is_active: 1
    });

    const id = result.insertId;

    // ← Fix: use local variables, not undefined `user`
    const token = jwt.sign(
      { id, name, email, phone },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await UserModel.saveToken(id, token);

    return res.status(201).json({ response: true, message: 'Registration successful', token });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ response: false, message: 'Registration failed' });
  }
}


// ─────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ response: false, message: 'Email is required' });
    }

    const user = await UserModel.findUser(email.toLowerCase());

    // Return same response whether user exists or not (prevents email enumeration)
    if (!user) {
      return res.status(200).json({
        response: true,
        message: 'If this email is registered, you will receive a reset link shortly.',
      });
    }

    // Generate raw token → send in email
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash token → store in DB (so raw token in email is useless if DB is breached)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Expiry: 1 hour from now
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await UserModel.saveResetToken(user.id, hashedToken, expires);

    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

    await emailService.sendPasswordResetEmail(user.email, resetLink, user.full_name);

    return res.status(200).json({
      response: true,
      message: 'If this email is registered, you will receive a reset link shortly.',
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}


// ─────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ response: false, message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ response: false, message: 'Password must be at least 6 characters' });
    }

    // Hash the raw token from the URL to compare against DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid (non-expired) token
    const user = await UserModel.findUserByResetToken(hashedToken);

    if (!user) {
      return res.status(400).json({
        response: false,
        message: 'Invalid or expired reset token. Please request a new one.',
      });
    }

    const salt          = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update password + clear token columns in one query
    await UserModel.updatePassword(user.id, hashedPassword);

    return res.status(200).json({
      response: true,
      message: 'Password has been reset successfully. You can now log in.',
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}


// ─────────────────────────────────────────────
// POST /api/auth/validate-reset-token
// ─────────────────────────────────────────────
async function validateResetToken(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ response: false, message: 'Token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await UserModel.findUserByResetToken(hashedToken);

    if (!user) {
      return res.status(400).json({ response: false, message: 'Invalid or expired token' });
    }

    return res.status(200).json({ response: true, message: 'Token is valid' });

  } catch (error) {
    console.error('Validate token error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}


module.exports = { login, register, forgotPassword, resetPassword, validateResetToken };