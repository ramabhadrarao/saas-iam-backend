// File: services/mlServiceClient.js
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { AppError } = require('../middleware/errorHandler');

/**
 * Client for interacting with the ML Service
 */
class MLServiceClient {
  constructor() {
    this.baseUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    this.apiKey = process.env.ML_SERVICE_API_KEY || 'master_sk_1234567890';
  }

  /**
   * Get API headers including authentication
   * @param {string} tenantId - Tenant ID for tenant-specific API keys
   * @returns {Object} Headers object
   */
  getHeaders(tenantId = null) {
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };

    if (tenantId) {
      // In production, you would get a tenant-specific API key
      headers['X-Tenant-ID'] = tenantId;
    }

    return headers;
  }

  /**
   * Upload a dataset for analysis or training
   * @param {string} filePath - Path to the dataset file
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Dataset info
   */
  async uploadDataset(filePath, tenantId) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));

      const response = await axios.post(
        `${this.baseUrl}/upload-dataset`,
        form,
        {
          headers: {
            ...this.getHeaders(tenantId),
            ...form.getHeaders(),
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error uploading dataset');
    }
  }

  /**
   * Analyze a dataset
   * @param {Object} analysisRequest - Analysis request
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeDataset(analysisRequest) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/analyze-dataset`,
        analysisRequest,
        { headers: this.getHeaders(analysisRequest.tenant_id) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error analyzing dataset');
    }
  }

  /**
   * Start model training
   * @param {Object} trainingRequest - Training request
   * @returns {Promise<Object>} Training job info
   */
  async trainModel(trainingRequest) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/train`,
        trainingRequest,
        { headers: this.getHeaders(trainingRequest.tenant_id) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error starting model training');
    }
  }

  /**
   * Get training job status
   * @param {string} jobId - Training job ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Training job status
   */
  async getTrainingStatus(jobId, tenantId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/training-status/${jobId}`,
        { headers: this.getHeaders(tenantId) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error getting training status');
    }
  }

  /**
   * Make predictions using a trained model
   * @param {Object} predictionRequest - Prediction request
   * @returns {Promise<Object>} Predictions
   */
  async predict(predictionRequest) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/predict`,
        predictionRequest,
        { headers: this.getHeaders(predictionRequest.tenant_id) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error making predictions');
    }
  }

  /**
   * List all models for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Array>} List of models
   */
  async listModels(tenantId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/models`,
        { headers: this.getHeaders(tenantId) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error listing models');
    }
  }

  /**
   * Get details for a specific model
   * @param {string} modelId - Model ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Model details
   */
  async getModelInfo(modelId, tenantId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/models/${modelId}`,
        { headers: this.getHeaders(tenantId) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error getting model info');
    }
  }

  /**
   * Delete a trained model
   * @param {string} modelId - Model ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteModel(modelId, tenantId) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/models/${modelId}`,
        { headers: this.getHeaders(tenantId) }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Error deleting model');
    }
  }

  /**
   * Handle API errors
   * @param {Error} error - Error object
   * @param {string} defaultMessage - Default error message
   * @throws {AppError} Formatted error
   */
  handleError(error, defaultMessage) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data.detail || error.response.data.message || defaultMessage;
      
      throw new AppError(message, status);
    }
    
    throw new AppError(error.message || defaultMessage, 500);
  }
}

module.exports = new MLServiceClient();