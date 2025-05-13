# File: ml-server/main.py
import logging
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any

import pandas as pd
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models import (
    TrainingRequest, TrainingResponse, PredictionRequest, PredictionResponse,
    ModelInfo, DatasetUploadResponse, DatasetAnalysisRequest, AnalysisResult,
    ModelDeleteResponse, TrainingStatus
)
from ml_service import MLService
from data_service import DataService
from auth import verify_api_key, get_tenant_id

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("ml_server")

# Create directories if they don't exist
os.makedirs("models", exist_ok=True)
os.makedirs("datasets", exist_ok=True)
os.makedirs("training_jobs", exist_ok=True)

# Create FastAPI app
app = FastAPI(
    title="Multi-Tenant SaaS ML Service", 
    description="Machine Learning service for multi-tenant SaaS platform",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
ml_service = MLService()
data_service = DataService()

# Training job status storage (in-memory for demo, use database in production)
training_jobs = {}

@app.get("/")
async def root():
    """Root endpoint to check if service is running"""
    return {"message": "ML Service is operational", "version": "1.0.0"}

@app.post("/train", response_model=TrainingResponse)
async def train_model(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id)
):
    """Start a new model training job"""
    # Verify tenant_id matches the authenticated tenant
    if request.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Tenant ID mismatch")
    
    # Generate a unique job ID
    job_id = str(uuid.uuid4())
    
    # Set up initial job status
    training_jobs[job_id] = {
        "training_job_id": job_id,
        "tenant_id": tenant_id,
        "status": "queued",
        "start_time": datetime.now().isoformat(),
        "end_time": None,
        "progress": 0.0,
        "metrics": {},
        "error_message": None
    }
    
    # Start training in background
    background_tasks.add_task(
        ml_service.train_model_task,
        request, 
        job_id, 
        training_jobs
    )
    
    return TrainingResponse(
        model_id="pending",  # Will be updated when training completes
        tenant_id=tenant_id,
        status="queued",
        training_job_id=job_id,
        message="Training job queued successfully"
    )

@app.get("/training-status/{job_id}", response_model=TrainingStatus)
async def get_training_status(
    job_id: str,
    tenant_id: str = Depends(get_tenant_id)
):
    """Get the status of a training job"""
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Training job not found")
    
    job = training_jobs[job_id]
    
    # Check tenant ownership
    if job["tenant_id"] != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied to this training job")
    
    return TrainingStatus(**job)

@app.post("/predict", response_model=PredictionResponse)
async def predict(
    request: PredictionRequest,
    tenant_id: str = Depends(get_tenant_id)
):
    """Make predictions using a trained model"""
    # Verify tenant_id matches the authenticated tenant
    if request.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Tenant ID mismatch")
    
    try:
        # Convert input data to DataFrame
        input_df = pd.DataFrame(request.data)
        
        # Get predictions
        predictions = ml_service.predict(request.model_id, tenant_id, input_df)
        
        # Format response
        return PredictionResponse(
            predictions=predictions.tolist() if isinstance(predictions, np.ndarray) else predictions,
            model_id=request.model_id,
            prediction_time=datetime.now().isoformat()
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Model not found")
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.post("/upload-dataset", response_model=DatasetUploadResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id)
):
    """Upload a dataset for analysis or training"""
    try:
        # Process uploaded file
        result = await data_service.process_uploaded_dataset(file, tenant_id)
        return result
    except Exception as e:
        logger.error(f"Dataset upload error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Dataset upload error: {str(e)}")

@app.post("/analyze-dataset", response_model=AnalysisResult)
async def analyze_dataset(
    request: DatasetAnalysisRequest,
    tenant_id: str = Depends(get_tenant_id)
):
    """Analyze a previously uploaded dataset"""
    # Verify tenant_id matches the authenticated tenant
    if request.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Tenant ID mismatch")
    
    try:
        # Perform dataset analysis
        result = await data_service.analyze_dataset(request)
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Dataset not found")
    except Exception as e:
        logger.error(f"Dataset analysis error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Dataset analysis error: {str(e)}")

@app.get("/models", response_model=List[ModelInfo])
async def list_models(
    tenant_id: str = Depends(get_tenant_id)
):
    """List all models for a tenant"""
    try:
        models = ml_service.list_models(tenant_id)
        return models
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error listing models: {str(e)}")

@app.get("/models/{model_id}", response_model=ModelInfo)
async def get_model(
    model_id: str,
    tenant_id: str = Depends(get_tenant_id)
):
    """Get details for a specific model"""
    try:
        model = ml_service.get_model_info(model_id, tenant_id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        return model
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Model not found")
    except Exception as e:
        logger.error(f"Error getting model: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting model: {str(e)}")

@app.delete("/models/{model_id}", response_model=ModelDeleteResponse)
async def delete_model(
    model_id: str,
    tenant_id: str = Depends(get_tenant_id)
):
    """Delete a trained model"""
    try:
        result = ml_service.delete_model(model_id, tenant_id)
        return ModelDeleteResponse(
            model_id=model_id,
            success=result,
            message="Model deleted successfully" if result else "Failed to delete model"
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Model not found")
    except Exception as e:
        logger.error(f"Error deleting model: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting model: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)