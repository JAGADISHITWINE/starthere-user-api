const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');
const { encrypt, decrypt } = require('../service/cryptoHelper')

require('dotenv').config();


async function login(req, res) {
  try {
    // 1. Decrypt incoming payload
    const decryptedBody = decrypt(req.body.encryptedPayload);
    if (!decryptedBody) {
      return res.status(400).json({
        response: false,
        message: 'Invalid request format'
      });
    }

    const { email, password } = decryptedBody;

    // 2. Check if user exists
    const user = await UserModel.findUser(email);
    if (!user) {
      return res.status(401).json({
        response: false,
        message: 'User not found'
      });
    }

    // 3. Validate password
    const isValid = await UserModel.validatePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        response: false,
        message: 'Invalid credentials'
      });
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone_number
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 5. Save token to database
    await UserModel.saveToken(user.id, token);

    // 6. Encrypt the response
    const responseData = {
      response: true,
      message: 'Login successful',
      token: token
    };

    const encryptedResponse = encrypt(responseData);

    // 7. Send encrypted response
    return res.status(200).json({
      data: encryptedResponse
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      response: false,
      message: 'Something went wrong. Please try again.'
    });
  }
}

async function register(req, res) {
  try {

    const decryptedBody = decrypt(req.body.encryptedPayload);
    const { name, email, phone, password } = decryptedBody;

    const exists = await UserModel.findUser(email);
    if (exists) {
      return res.status(409).json({
        response: false,
        message: 'Email already registered'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔥 FIX HERE
    const [result] = await UserModel.registerUser({
      name,
      email,
      phone,
      password: hashedPassword,
      is_active: 1
    });

    const id = result.insertId;

    const token = jwt.sign(
      {
        id: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone_number
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await UserModel.saveToken(id, token);

    return res.status(201).json({
      response: true,
      message: 'Registration successful',
      token
    });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      response: false,
      message: 'Registration failed'
    });
  }
}

module.exports = { login, register };
