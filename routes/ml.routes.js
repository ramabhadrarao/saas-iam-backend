// File: routes/ml.routes.js
const express = require('express');
const router = express.Router();
const mlController = require('../controllers/ml.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/errorHandler');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Dataset endpoints
router.post('/datasets/upload', 
  authenticate, 
  authorize(['use_ml']), 
  upload.single('file'),
  asyncHandler(mlController.uploadDataset)
);

router.post('/datasets/analyze', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.analyzeDataset)
);

// Model training endpoints
router.post('/models/train', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.trainModel)
);

router.get('/training/:jobId', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.getTrainingStatus)
);

// Prediction endpoints
router.post('/predict', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.predict)
);

// Model management endpoints
router.get('/models', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.listModels)
);

router.get('/models/:modelId', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.getModelInfo)
);

router.delete('/models/:modelId', 
  authenticate, 
  authorize(['use_ml']), 
  asyncHandler(mlController.deleteModel)
);

module.exports = router;