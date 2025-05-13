// File: utils/scheduler.js
const cron = require('node-cron');
const ticketService = require('../services/ticketService');

/**
 * Initialize cron jobs for the application
 */
function initScheduler() {
  console.log('Initializing application schedulers...');
  
  // Schedule SLA check to run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('Running scheduled SLA check...');
    await ticketService.runSlaCheck();
  });
  
  // Additional scheduled tasks can be added here
  
  console.log('Application schedulers initialized');
}

module.exports = {
  initScheduler
};