# File: ml-server/ml_service.py
import os
import json
import joblib
import uuid
import time
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Union

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, r2_score, mean_squared_error, precision_score, recall_score, f1_score

from models import TrainingRequest, ModelInfo, ModelType

logger = logging.getLogger("ml_service")

class MLService:
    def __init__(self):
        self.models_dir = "models"
        self.datasets_dir = "datasets"
        os.makedirs(self.models_dir, exist_ok=True)
        os.makedirs(self.datasets_dir, exist_ok=True)
    
    async def train_model_task(self, request: TrainingRequest, job_id: str, training_jobs: Dict):
        """Background task for model training"""
        try:
            # Update job status
            training_jobs[job_id]["status"] = "in_progress"
            training_jobs[job_id]["progress"] = 0.1
            
            # Load dataset
            dataset_path = os.path.join(self.datasets_dir, f"{request.tenant_id}_{request.dataset_id}.csv")
            if not os.path.exists(dataset_path):
                raise FileNotFoundError(f"Dataset not found: {dataset_path}")
            
            df = pd.read_csv(dataset_path)
            training_jobs[job_id]["progress"] = 0.2
            
            # Identify feature and target columns
            target_col = next((c.name for c in request.columns if c.is_target), None)
            if not target_col:
                raise ValueError("No target column specified")
            
            feature_cols = [c.name for c in request.columns if c.is_feature and c.name != target_col]
            if not feature_cols:
                raise ValueError("No feature columns specified")
            
            # Prepare features and target
            X = df[feature_cols]
            y = df[target_col]
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
            training_jobs[job_id]["progress"] = 0.3
            
            # Prepare preprocessing pipeline
            numeric_features = [c.name for c in request.columns 
                              if c.is_feature and c.data_type == "numeric" and c.name in feature_cols]
            
            categorical_features = [c.name for c in request.columns 
                                  if c.is_feature and c.data_type == "categorical" and c.name in feature_cols]
            
            numeric_transformer = Pipeline(steps=[
                ('imputer', SimpleImputer(strategy='median')),
                ('scaler', StandardScaler())
            ])
            
            categorical_transformer = Pipeline(steps=[
                ('imputer', SimpleImputer(strategy='most_frequent')),
                ('onehot', OneHotEncoder(handle_unknown='ignore'))
            ])
            
            preprocessor = ColumnTransformer(
                transformers=[
                    ('num', numeric_transformer, numeric_features),
                    ('cat', categorical_transformer, categorical_features)
                ]
            )
            
            # Create and train model based on model type
            model = None
            if request.model_type == ModelType.CLASSIFICATION:
                model = Pipeline(steps=[
                    ('preprocessor', preprocessor),
                    ('classifier', RandomForestClassifier(**request.training_config))
                ])
            elif request.model_type == ModelType.REGRESSION:
                model = Pipeline(steps=[
                    ('preprocessor', preprocessor),
                    ('regressor', RandomForestRegressor(**request.training_config))
                ])
            else:
                raise ValueError(f"Unsupported model type: {request.model_type}")
            
            training_jobs[job_id]["progress"] = 0.4
            
            # Train the model
            start_time = time.time()
            model.fit(X_train, y_train)
            training_time = time.time() - start_time
            
            training_jobs[job_id]["progress"] = 0.7
            
            # Evaluate model
            y_pred = model.predict(X_test)
            metrics = {}
            
            if request.model_type == ModelType.CLASSIFICATION:
                metrics["accuracy"] = float(accuracy_score(y_test, y_pred))
                metrics["precision"] = float(precision_score(y_test, y_pred, average='weighted'))
                metrics["recall"] = float(recall_score(y_test, y_pred, average='weighted'))
                metrics["f1"] = float(f1_score(y_test, y_pred, average='weighted'))
            elif request.model_type == ModelType.REGRESSION:
                metrics["r2_score"] = float(r2_score(y_test, y_pred))
                metrics["mse"] = float(mean_squared_error(y_test, y_pred))
                metrics["rmse"] = float(np.sqrt(mean_squared_error(y_test, y_pred)))
            
            training_jobs[job_id]["progress"] = 0.8
            
            # Get feature importance
            feature_importance = None
            if request.model_type == ModelType.CLASSIFICATION:
                feature_importance = self._get_feature_importance(model, feature_cols)
            elif request.model_type == ModelType.REGRESSION:
                feature_importance = self._get_feature_importance(model, feature_cols)
            
            # Generate a unique model ID
            model_id = str(uuid.uuid4())
            
            # Save the model
            model_path = os.path.join(self.models_dir, f"{request.tenant_id}_{model_id}.joblib")
            joblib.dump(model, model_path)
            
            # Save model metadata
            metadata = {
                "model_id": model_id,
                "tenant_id": request.tenant_id,
                "model_name": request.model_name,
                "model_type": request.model_type,
                "description": request.description,
                "tags": request.tags,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "metrics": metrics,
                "feature_importance": feature_importance,
                "status": "active",
                "version": 1,
                "dataset_id": request.dataset_id,
                "columns": [c.dict() for c in request.columns],
                "training_config": request.training_config,
                "size_bytes": os.path.getsize(model_path),
                "training_time_seconds": training_time
            }
            
            metadata_path = os.path.join(self.models_dir, f"{request.tenant_id}_{model_id}_metadata.json")
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f)
            
            training_jobs[job_id]["progress"] = 1.0
            training_jobs[job_id]["status"] = "completed"
            training_jobs[job_id]["end_time"] = datetime.now().isoformat()
            training_jobs[job_id]["model_id"] = model_id
            training_jobs[job_id]["metrics"] = metrics
            
            logger.info(f"Training completed for job {job_id}, model {model_id}")
            
        except Exception as e:
            logger.error(f"Training error in job {job_id}: {str(e)}", exc_info=True)
            training_jobs[job_id]["status"] = "failed"
            training_jobs[job_id]["end_time"] = datetime.now().isoformat()
            training_jobs[job_id]["error_message"] = str(e)
    
    def predict(self, model_id: str, tenant_id: str, data: pd.DataFrame) -> np.ndarray:
        """Make predictions using a trained model"""
        model_path = os.path.join(self.models_dir, f"{tenant_id}_{model_id}.joblib")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        # Load the model
        model = joblib.load(model_path)
        
        # Make predictions
        predictions = model.predict(data)
        return predictions
    
    def list_models(self, tenant_id: str) -> List[ModelInfo]:
        """List all models for a tenant"""
        models = []
        for filename in os.listdir(self.models_dir):
            if filename.startswith(f"{tenant_id}_") and filename.endswith("_metadata.json"):
                with open(os.path.join(self.models_dir, filename), 'r') as f:
                    metadata = json.load(f)
                    models.append(ModelInfo(**metadata))
        
        return models
    
    def get_model_info(self, model_id: str, tenant_id: str) -> Optional[ModelInfo]:
        """Get details for a specific model"""
        metadata_path = os.path.join(self.models_dir, f"{tenant_id}_{model_id}_metadata.json")
        if not os.path.exists(metadata_path):
            return None
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
            return ModelInfo(**metadata)
    
    def delete_model(self, model_id: str, tenant_id: str) -> bool:
        """Delete a trained model"""
        model_path = os.path.join(self.models_dir, f"{tenant_id}_{model_id}.joblib")
        metadata_path = os.path.join(self.models_dir, f"{tenant_id}_{model_id}_metadata.json")
        
        if not os.path.exists(model_path) or not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Model not found: {model_id}")
        
        try:
            os.remove(model_path)
            os.remove(metadata_path)
            return True
        except Exception as e:
            logger.error(f"Error deleting model {model_id}: {str(e)}", exc_info=True)
            return False
    
    def _get_feature_importance(self, model, feature_names):
        """Extract feature importance from a model"""
        try:
            # For RandomForest models
            if hasattr(model, 'steps'):
                if model.steps[-1][0] == 'classifier':
                    estimator = model.steps[-1][1]
                    if hasattr(estimator, 'feature_importances_'):
                        importances = estimator.feature_importances_
                        return dict(zip(feature_names, importances.tolist()))
                elif model.steps[-1][0] == 'regressor':
                    estimator = model.steps[-1][1]
                    if hasattr(estimator, 'feature_importances_'):
                        importances = estimator.feature_importances_
                        return dict(zip(feature_names, importances.tolist()))
            
            return None
        except Exception as e:
            logger.warning(f"Could not extract feature importance: {str(e)}")
            return None