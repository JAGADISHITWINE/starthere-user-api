const mysql = require('mysql2');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Itwinetech@1234',
    database: 'starthere',
    port: 3306,
}).promise(); // Enables native promise support

// Test database connection
db.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL Database!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err);
    });

module.exports = db; // Export connection as a promise
