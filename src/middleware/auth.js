const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: Number(decoded.id),
      type: decoded.type || 'user',
      email: decoded.email
    };

    if (!req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload'
      });
    }

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
}

module.exports = { requireAuth };
