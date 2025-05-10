// File: backend/reset-password.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/user.model');

async function resetPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
    
    // New password to set
    const newPassword = 'Admin123!';
    console.log(`Setting password to: ${newPassword}`);
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log(`Generated hash: ${hashedPassword}`);
    
    // Update the admin user's password
    const result = await User.updateOne(
      { email: 'admin@example.com' },
      { $set: { password: hashedPassword } }
    );
    
    if (result.modifiedCount > 0) {
      console.log('Password updated successfully for admin@example.com');
    } else {
      console.log('User not found or password not modified');
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

resetPassword();