// File: backend/start-mongodb.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to config files
const configPath1 = path.join(__dirname, 'mongodb_conf', 'mongod1.cfg');
const configPath2 = path.join(__dirname, 'mongodb_conf', 'mongod2.cfg');
const configPath3 = path.join(__dirname, 'mongodb_conf', 'mongod3.cfg');

// Create directories if they don't exist
const createDirectories = () => {
  const dirs = ['C:\\data\\db1', 'C:\\data\\db2', 'C:\\data\\db3'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Start MongoDB instances
const startMongoDB = () => {
  createDirectories();

  console.log('Starting MongoDB replica set...');

  // Start 3 MongoDB instances
  const mongod1 = spawn('mongod', ['--config', configPath1], { stdio: 'inherit' });
  const mongod2 = spawn('mongod', ['--config', configPath2], { stdio: 'inherit' });
  const mongod3 = spawn('mongod', ['--config', configPath3], { stdio: 'inherit' });

  // Add to global scope to access in cleanup
  global.mongoProcesses = [mongod1, mongod2, mongod3];
  
  // Wait for MongoDB to start before initializing replica set
  setTimeout(() => {
    initReplicaSet();
  }, 5000);

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Stopping MongoDB replica set...');
    global.mongoProcesses.forEach(proc => {
      proc.kill('SIGINT');
    });
    process.exit(0);
  });
};

// Initialize the replica set
// Updated initReplicaSet function for start-mongodb.js
const initReplicaSet = () => {
  // First check if replica set is already initialized
  const checkRs = spawn('mongosh', ['--eval', 'rs.status()'], { stdio: 'pipe' });
  
  let output = '';
  checkRs.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  checkRs.on('close', (code) => {
    // If rs.status() returns success (code 0) and includes "set" field, it's already initialized
    if (code === 0 && output.includes('"set" : "rs0"')) {
      console.log('MongoDB replica set is already initialized');
      return;
    }
    
    // If not initialized or error occurred, try to initialize it
    console.log('Initializing MongoDB replica set...');
    const mongosh = spawn('mongosh', ['--eval', `
      rs.initiate({
        _id: "rs0",
        members: [
          { _id: 0, host: "127.0.0.1:27017" },
          { _id: 1, host: "127.0.0.1:27018" },
          { _id: 2, host: "127.0.0.1:27019" }
        ]
      })
    `], { stdio: 'inherit' });

    mongosh.on('close', (code) => {
      if (code === 0) {
        console.log('MongoDB replica set initialized successfully');
      } else {
        console.error(`Failed to initialize replica set (exit code: ${code})`);
      }
    });
  });
};
// Execute if this file is run directly
if (require.main === module) {
  startMongoDB();
}

module.exports = { startMongoDB };