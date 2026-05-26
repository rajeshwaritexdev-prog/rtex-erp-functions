const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { configDotenv } = require('dotenv');

const app = express();

// Allow requests from your React frontend
// app.use(cors());
app.use(express.json());
configDotenv(); // Load environment variables from .env file (for local development)

// 1. Global variable to cache the MongoDB connection
let cachedDb = null;

async function connectToDatabase() {
  // If we already have a connection, reuse it
  if (cachedDb) {
    return cachedDb;
  }
  
  // Connect using the environment variable set in AWS Lambda
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  
  // Extracts the specific database name from your connection string
  cachedDb = client.db(); 
  return cachedDb;
}

// 2. Define your endpoints just like a normal Express app
app.get('/api/health', (req, res) => {
    console.log('Health check endpoint hit');
  res.json({ status: 'Backend is fully operational and ready to serve requests' });
});

app.get('/api/test', async (req, res) => {
  try {
    const db = await connectToDatabase();
    // Fetch users from a collection named 'users'
    const users = await db.collection('test').find({}).limit(10).toArray();
    console.log('Fetched users:', users);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to connect to database' });
  }
});


if (require.main === module) {
  const PORT = 9000;
  app.listen(PORT, () => {
    console.log("App is running..")
    console.log(`Local backend running at http://localhost:${PORT}`);
  }).on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}


// 3. Wrap and export the Express app for AWS Lambda
module.exports.handler = serverless(app);

