// File: backend/start-app.js
const { startMongoDB } = require('./start-mongodb');
const { spawn } = require('child_process');

// Start MongoDB replica set
startMongoDB();

// Give MongoDB some time to initialize before starting the app
console.log('Waiting for MongoDB to initialize...');
setTimeout(() => {
  console.log('Starting Node.js application...');
  
  // Start your Node.js application
  const nodeApp = spawn('node', ['server.js'], { stdio: 'inherit' });
  
  // Handle Node.js application termination
  nodeApp.on('close', (code) => {
    console.log(`Node.js application exited with code ${code}`);
    // Kill MongoDB processes when the application exits
    global.mongoProcesses.forEach(proc => {
      proc.kill('SIGINT');
    });
    process.exit(code);
  });
}, 8000); // Allow 8 seconds for MongoDB to start