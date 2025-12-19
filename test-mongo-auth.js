require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
console.log('Testing connection...\n');

// Parse the connection string to check for issues
try {
  const url = new URL(uri.replace('mongodb+srv://', 'https://'));
  console.log('Parsed connection details:');
  console.log('  Username:', url.username);
  console.log('  Password length:', url.password.length, 'chars');
  console.log('  Host:', url.hostname);
  console.log('  Database:', url.pathname.split('?')[0]);
  console.log('');
} catch (e) {
  console.log('Failed to parse URI:', e.message);
}

// Try with more verbose logging
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 15000,
  maxPoolSize: 1,
  retryWrites: true,
  retryReads: true,
});

// Log connection events
client.on('serverOpening', (event) => {
  console.log(`📡 Opening connection to: ${event.address}`);
});

client.on('serverDescriptionChanged', (event) => {
  console.log(`📊 Server status: ${event.newDescription.type}`);
});

client.on('topologyDescriptionChanged', (event) => {
  console.log(`🌐 Topology changed: ${event.newDescription.type}`);
  if (event.newDescription.error) {
    console.log(`   Error: ${event.newDescription.error.message}`);
  }
});

async function test() {
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('✅ Connected successfully!');

    const admin = client.db().admin();
    const result = await admin.ping();
    console.log('✅ Ping successful:', result);

  } catch (err) {
    console.error('\n❌ Connection failed:');
    console.error('Error:', err.message);
    console.error('\nFull error object:');
    console.error(JSON.stringify(err, null, 2));
  } finally {
    await client.close();
  }
}

test();
