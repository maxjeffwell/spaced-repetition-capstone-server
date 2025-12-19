require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
console.log('Connection URI:', uri.replace(/:[^:]*@/, ':****@'));

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});

async function test() {
  try {
    console.log('\nAttempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully!');

    console.log('\nTesting database operations...');
    const db = client.db('spaced-repetition');
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

  } catch (err) {
    console.error('\n❌ Connection failed:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);

    if (err.message.includes('IP')) {
      console.log('\n🔍 IP Whitelist Issue Detected');
      console.log('This means Atlas is rejecting the connection at the firewall level.');
      console.log('\nThings to check in Atlas:');
      console.log('1. Network Access → Is 0.0.0.0/0 truly active (green check)?');
      console.log('2. Try deleting and re-adding the 0.0.0.0/0 entry');
      console.log('3. Check if the cluster is PAUSED (Clusters → check status)');
    }

    if (err.message.includes('authentication') || err.message.includes('password')) {
      console.log('\n🔑 Authentication Issue Detected');
      console.log('Check Database Access → Users in Atlas');
    }
  } finally {
    await client.close();
  }
}

test();
