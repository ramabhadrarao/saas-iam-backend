// File: backend/middleware/errorHandler.js
/**
 * Global error handling middleware
 */
exports.errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('Error:', err);
  
  // Check if the error has a status code, otherwise default to 500
  const statusCode = err.statusCode || 500;
  
  // Format the error response
  const errorResponse = {
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
  
  // If there are validation errors, include them
  if (err.errors) {
    errorResponse.errors = err.errors;
  }
  
  // Add request details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.request = {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      body: req.body
    };
  }
  
  res.status(statusCode).json(errorResponse);
};

/**
 * Custom error class with status code
 */
exports.AppError = class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
};

/**
 * Not found middleware for handling 404 errors
 */
exports.notFound = (req, res, next) => {
  const err = new Error(`Not Found - ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

/**
 * Async handler to simplify error handling in async routes
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
exports.asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
    next(err);
  });