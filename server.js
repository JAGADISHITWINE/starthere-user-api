const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/auth.routes'); 
require('dotenv').config();
const app = express();

app.use(express.json()); // Middleware to parse JSON request bodies
app.use(cors()); // Optional


// Use auth routes
app.use('/api/auth', authRoutes); 

// Default route
app.get('/', (req, res) => {
    res.send('Server is running...');
});

// Start the server
const PORT = process.env.PORT;
console.log(PORT)
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
