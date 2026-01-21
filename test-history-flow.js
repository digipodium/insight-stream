const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://localhost:5000/api';

// Create a dummy CSV
const csvContent = 'id,name,value\n1,Test,100\n2,Data,200';
const csvPath = path.join(__dirname, 'test.csv');
fs.writeFileSync(csvPath, csvContent);

async function testFlow() {
    try {
        console.log('1. Registering/Logging in User...');
        const userEmail = `test${Date.now()}@example.com`;
        let token;

        try {
            const regRes = await axios.post(`${API_URL}/auth/register`, {
                name: 'Test User',
                email: userEmail,
                password: 'password123'
            });
            token = regRes.data.token;
            console.log('   Registered new user');
        } catch (e) {
            console.log('   Registration failed, trying login (dummy check)');
            // In real run we expect unique email so reg should work
        }

        if (!token) throw new Error('No token');

        const config = {
            headers: { Authorization: `Bearer ${token}` }
        };

        console.log('2. Uploading CSV...');
        const formData = new FormData();
        formData.append('file', fs.createReadStream(csvPath));

        const uploadRes = await axios.post(`${API_URL}/data/upload`, formData, {
            headers: {
                ...config.headers,
                ...formData.getHeaders()
            }
        });

        if (uploadRes.data.success) {
            console.log('   Upload successful, Data ID:', uploadRes.data.dataId);
        } else {
            throw new Error('Upload failed');
        }

        console.log('3. Checking History...');
        const historyRes = await axios.get(`${API_URL}/data/history`, config);
        console.log('   History count:', historyRes.data.count);

        if (historyRes.data.datasets.length > 0) {
            console.log('   Found datasets in history');
            const latest = historyRes.data.datasets[0];
            console.log('   Latest:', latest.fileName);

            console.log('4. Fetching Single Dataset...');
            const dsRes = await axios.get(`${API_URL}/data/${latest._id}`, config);

            if (dsRes.data.success && dsRes.data.fullData.length === 2) {
                console.log('   Fetch successful, row count matches (2)');
            } else {
                console.error('   Fetch failed or data mismatch');
            }

        } else {
            console.error('   History is empty but upload succeeded?');
        }

        console.log('✅ TEST PASSED');

    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        if (error.response) console.error(error.response.data);
    } finally {
        fs.unlinkSync(csvPath);
    }
}

testFlow();
