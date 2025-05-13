# File: ml-server/models.py
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union
from enum import Enum

class ModelType(str, Enum):
    CLASSIFICATION = "classification"
    REGRESSION = "regression"
    CLUSTERING = "clustering"
    CUSTOM = "custom"

class DataType(str, Enum):
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    TEXT = "text"
    DATETIME = "datetime"
    BOOLEAN = "boolean"

class ColumnDefinition(BaseModel):
    name: str
    data_type: DataType
    is_target: bool = False
    is_feature: bool = True
    nullable: bool = True
    description: Optional[str] = None

class TrainingRequest(BaseModel):
    tenant_id: str
    model_name: str
    model_type: ModelType
    dataset_id: Optional[str] = None
    columns: List[ColumnDefinition]
    training_config: Dict[str, Any] = {}
    description: Optional[str] = None
    tags: List[str] = []

class TrainingResponse(BaseModel):
    model_id: str
    tenant_id: str
    status: str
    training_job_id: str
    message: str

class PredictionRequest(BaseModel):
    tenant_id: str
    model_id: str
    data: List[Dict[str, Any]]

class PredictionResponse(BaseModel):
    predictions: List[Any]
    model_id: str
    prediction_time: str

class TrainingStatus(BaseModel):
    training_job_id: str
    tenant_id: str
    model_id: Optional[str] = None
    status: str
    start_time: str
    end_time: Optional[str] = None
    progress: float
    metrics: Dict[str, Any] = {}
    error_message: Optional[str] = None

class ModelInfo(BaseModel):
    model_id: str
    tenant_id: str
    model_name: str
    model_type: ModelType
    description: Optional[str] = None
    tags: List[str] = []
    created_at: str
    updated_at: str
    metrics: Dict[str, Any] = {}
    feature_importance: Optional[Dict[str, float]] = None
    status: str
    version: int = 1
    size_bytes: Optional[int] = None
    training_time_seconds: Optional[float] = None

class DatasetUploadResponse(BaseModel):
    dataset_id: str
    tenant_id: str
    filename: str
    rows: int
    columns: int
    preview: List[Dict[str, Any]]
    column_stats: Dict[str, Dict[str, Any]]

class DatasetAnalysisRequest(BaseModel):
    tenant_id: str
    dataset_id: str
    operations: List[str] = ["summary", "correlation", "missing_values"]

class AnalysisResult(BaseModel):
    summary: Optional[Dict[str, Any]] = None
    correlation: Optional[Dict[str, Dict[str, float]]] = None
    missing_values: Optional[Dict[str, int]] = None
    outliers: Optional[Dict[str, List[int]]] = None
    distributions: Optional[Dict[str, Dict[str, Any]]] = None
    custom: Optional[Dict[str, Any]] = None

class ModelDeleteResponse(BaseModel):
    model_id: str
    success: bool
    message: str