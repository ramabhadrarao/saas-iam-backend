// File: controllers/ml.controller.js
const mlServiceClient = require('../services/mlServiceClient');
const { createAuditLog } = require('../utils/auditLogger');
const { processUploadedFile } = require('../utils/fileProcessor');

/**
 * Upload a dataset
 */
exports.uploadDataset = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Process the uploaded file
    const processedFilePath = await processUploadedFile(req.file);

    // Upload to ML service
    const tenantId = req.user.tenantId || null;
    const result = await mlServiceClient.uploadDataset(processedFilePath, tenantId);

    // Log dataset upload
    await createAuditLog({
      userId: req.user.id,
      action: 'UPLOAD',
      module: 'ML',
      description: `Uploaded dataset: ${req.file.originalname}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId
    });

    res.status(200).json({ 
      message: 'Dataset uploaded successfully',
      dataset: result
    });
  } catch (error) {
    console.error('Upload dataset error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Analyze a dataset
 */
exports.analyzeDataset = async (req, res) => {
  try {
    const { datasetId, operations } = req.body;
    
    // Build analysis request
    const analysisRequest = {
      tenant_id: req.user.tenantId || 'master',
      dataset_id: datasetId,
      operations: operations || ['summary', 'correlation', 'missing_values']
    };

    // Call ML service
    const result = await mlServiceClient.analyzeDataset(analysisRequest);

    res.status(200).json({ 
      message: 'Dataset analysis completed',
      analysis: result
    });
  } catch (error) {
    console.error('Analyze dataset error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Start model training
 */
exports.trainModel = async (req, res) => {
  try {
    const { datasetId, modelName, modelType, columns, config, description, tags } = req.body;
    
    // Build training request
    const trainingRequest = {
      tenant_id: req.user.tenantId || 'master',
      dataset_id: datasetId,
      model_name: modelName,
      model_type: modelType,
      columns: columns,
      training_config: config || {},
      description: description || '',
      tags: tags || []
    };

    // Call ML service
    const result = await mlServiceClient.trainModel(trainingRequest);

    // Log training start
    await createAuditLog({
      userId: req.user.id,
      action: 'TRAIN',
      module: 'ML',
      description: `Started training for model: ${modelName}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });

    res.status(200).json({ 
      message: 'Model training started',
      training: result
    });
  } catch (error) {
    console.error('Train model error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get training status
 */
exports.getTrainingStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Call ML service
    const result = await mlServiceClient.getTrainingStatus(jobId, req.user.tenantId || 'master');

    res.status(200).json({ 
      trainingStatus: result
    });
  } catch (error) {
    console.error('Get training status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Make predictions
 */
exports.predict = async (req, res) => {
  try {
    const { modelId, data } = req.body;
    
    // Build prediction request
    const predictionRequest = {
      tenant_id: req.user.tenantId || 'master',
      model_id: modelId,
      data: data
    };

    // Call ML service
    const result = await mlServiceClient.predict(predictionRequest);

    // Log prediction
    await createAuditLog({
      userId: req.user.id,
      action: 'PREDICT',
      module: 'ML',
      description: `Made predictions using model: ${modelId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });

    res.status(200).json({ 
      predictions: result.predictions,
      modelId: result.model_id,
      predictionTime: result.prediction_time
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * List all models
 */
exports.listModels = async (req, res) => {
  try {
    // Call ML service
    const result = await mlServiceClient.listModels(req.user.tenantId || 'master');

    res.status(200).json({ models: result });
  } catch (error) {
    console.error('List models error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get model details
 */
exports.getModelInfo = async (req, res) => {
  try {
    const { modelId } = req.params;
    
    // Call ML service
    const result = await mlServiceClient.getModelInfo(modelId, req.user.tenantId || 'master');

    res.status(200).json({ model: result });
  } catch (error) {
    console.error('Get model info error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete a model
 */
exports.deleteModel = async (req, res) => {
  try {
    const { modelId } = req.params;
    
    // Call ML service
    const result = await mlServiceClient.deleteModel(modelId, req.user.tenantId || 'master');

    // Log model deletion
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      module: 'ML',
      description: `Deleted model: ${modelId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.user.tenantId
    });

    res.status(200).json({ 
      message: 'Model deleted successfully',
      result: result
    });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};