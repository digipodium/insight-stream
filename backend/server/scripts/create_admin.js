const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const adminEmail = 'admin@example.com';
        const adminPassword = 'adminpassword123'; // In a real scenario, this should be hashed if schema doesn't pre-save hash, but User model usually handles it?
        // Let's check User model for pre-save hook.
        // Assuming the app has a registration flow that hashes passwords, we might need to rely on that or manually hash here if we are inserting directly.
        // But for "create_admin", usually we want to find an existing user and promote, or create a new one.

        // Check if admin exists
        let user = await User.findOne({ email: adminEmail });

        if (user) {
            console.log('Admin user already exists');
            user.isAdmin = true;
            await user.save();
            console.log('User updated to Admin');
        } else {
            // Need bcrypt if we are creating raw user
            // const bcrypt = require('bcryptjs');
            // const salt = await bcrypt.genSalt(10);
            // const hashedPassword = await bcrypt.hash(adminPassword, salt);
            // But I don't want to install bcryptjs just for this script if it's not in package.json (it probably is).
            // Let's assume the user can just register via UI and then we run a script to promote them.

            console.log('Creating new admin user...');
            // For now, I will create a user with plain password and hope the Model has a pre-save hook, 
            // OR I will just ask the helper function.
            // Actually, best is to just UPDATE an existing user.
            console.log('Please register a user with email "admin@example.com" first, then run this script again. Or change the script to target your email.');

            // ALternatively, create one:
            // user = await User.create({
            //    name: 'Admin User',
            //    email: adminEmail,
            //    password: adminPassword, // IF User model hashes this in 'save' middleware, we are good.
            //    isAdmin: true
            // });
            // console.log('Admin user created');
        }

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

createAdmin();
