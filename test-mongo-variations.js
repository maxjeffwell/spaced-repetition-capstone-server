require('dotenv').config();
const { MongoClient } = require('mongodb');

const baseUri = process.env.MONGODB_URI;
const variations = [
  {
    name: 'Original',
    uri: baseUri
  },
  {
    name: 'With authSource',
    uri: baseUri + '&authSource=admin'
  },
  {
    name: 'With retryWrites',
    uri: baseUri + '&retryWrites=true&w=majority'
  },
  {
    name: 'With TLS options',
    uri: baseUri + '&tls=true&tlsAllowInvalidCertificates=false'
  },
  {
    name: 'Standard connection (not SRV)',
    uri: baseUri.replace('mongodb+srv://', 'mongodb://').replace('@spaced-repetition.juv8wvf.mongodb.net', '@ac-muhsurn-shard-00-00.juv8wvf.mongodb.net:27017,ac-muhsurn-shard-00-01.juv8wvf.mongodb.net:27017,ac-muhsurn-shard-00-02.juv8wvf.mongodb.net:27017')
  }
];

async function testConnection(variation) {
  const client = new MongoClient(variation.uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });

  try {
    console.log(`\nTesting: ${variation.name}`);
    await client.connect();
    console.log('✅ Success!');
    await client.close();
    return true;
  } catch (err) {
    console.log('❌ Failed:', err.message.substring(0, 80));
    return false;
  }
}

(async () => {
  console.log('Testing different connection string variations...\n');

  for (const variation of variations) {
    const success = await testConnection(variation);
    if (success) {
      console.log('\n🎉 Found working connection!');
      console.log('Use this connection string format.');
      process.exit(0);
    }
  }

  console.log('\n❌ All variations failed.');
  console.log('\nThis strongly suggests the IP whitelist in Atlas is not working.');
  console.log('Next steps:');
  console.log('1. In Atlas, completely DELETE the cluster Network Access rules');
  console.log('2. Wait 1 minute');
  console.log('3. Re-add 0.0.0.0/0');
  console.log('4. Wait 3-5 minutes');
  console.log('5. Try again');
})();
