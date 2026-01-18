const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, 'server/.env') });
const connectDB = require('./server/config/db');

fs.writeFileSync('test-result.txt', 'Starting test...\n');

console.log('Testing connection to:', process.env.MONGO_URI);

connectDB().then(() => {
    setTimeout(() => {
        let msg = '';
        if (mongoose.connection.readyState === 1) {
            msg = '✅ Connection verification successful!';
        } else {
            msg = '❌ Connection verification failed (state: ' + mongoose.connection.readyState + ')';
        }
        console.log(msg);
        fs.appendFileSync('test-result.txt', msg + '\n');
        process.exit(0);
    }, 2000);
}).catch(err => {
    fs.appendFileSync('test-result.txt', 'Error: ' + err.message + '\n');
    console.error(err);
    process.exit(1);
});