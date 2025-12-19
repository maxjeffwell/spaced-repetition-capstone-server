require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB connection...');
console.log('Connection string:', process.env.MONGODB_URI.replace(/:[^:]*@/, ':****@'));

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 5000,
})
.then(() => {
  console.log('✅ Successfully connected to MongoDB Atlas!');
  mongoose.connection.close();
  process.exit(0);
})
.catch((err) => {
  console.error('❌ Connection failed:', err.message);
  if (err.message.includes('IP')) {
    console.log('\n💡 Tip: Check Network Access in MongoDB Atlas');
    console.log('   Current IP: Run `curl -s ifconfig.me` to check');
  }
  if (err.message.includes('authentication')) {
    console.log('\n💡 Tip: Check your username and password in the connection string');
  }
  process.exit(1);
});
