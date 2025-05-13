// File: routes/ticket.routes.js
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticket.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');

// Create a ticket
router.post('/', 
  authenticate, 
  authorize(['create_ticket']), 
  asyncHandler(ticketController.createTicket)
);

// Get all tickets with filtering
router.get('/', 
  authenticate, 
  authorize(['read_ticket']), 
  asyncHandler(ticketController.getTickets)
);

// Get a single ticket by ID
router.get('/:id', 
  authenticate, 
  authorize(['read_ticket']), 
  asyncHandler(ticketController.getTicketById)
);

// Update a ticket
router.put('/:id', 
  authenticate, 
  authorize(['update_ticket']), 
  asyncHandler(ticketController.updateTicket)
);

// Add a comment to a ticket
router.post('/:id/comments', 
  authenticate, 
  authorize(['update_ticket']), 
  asyncHandler(ticketController.addComment)
);

// Get ticket metrics
router.get('/metrics/statistics', 
  authenticate, 
  authorize(['read_ticket']), 
  asyncHandler(ticketController.getTicketMetrics)
);

// Get ticket settings
router.get('/settings', 
  authenticate, 
  authorize(['read_ticket_settings']), 
  asyncHandler(ticketController.getTicketSettings)
);

// Update ticket settings
router.put('/settings', 
  authenticate, 
  authorize(['update_ticket_settings']), 
  asyncHandler(ticketController.updateTicketSettings)
);

module.exports = router;