const mysql = require('mysql2');
require('dotenv').config();

// Read DB config from environment variables. Do NOT commit production credentials.
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'starthere';
const DB_PORT = Number(process.env.DB_PORT || 3306);

if (!DB_PASSWORD) {
    console.warn('WARNING: Database password not set via environment variable DB_PASSWORD');
}

const db = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
}).promise(); // Enables native promise support

// Test database connection (log only high-level result)
db.getConnection()
    .then(connection => {
        console.info('Connected to MySQL Database');
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed:', err.message || err);
    });

module.exports = db; // Export connection as a promise
