# File: ml-server/data_service.py
import os
import json
import uuid
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional

import pandas as pd
import numpy as np
from fastapi import UploadFile
import io

from models import DatasetUploadResponse, DatasetAnalysisRequest, AnalysisResult

logger = logging.getLogger("data_service")

class DataService:
    def __init__(self):
        self.datasets_dir = "datasets"
        os.makedirs(self.datasets_dir, exist_ok=True)
    
    async def process_uploaded_dataset(self, file: UploadFile, tenant_id: str) -> DatasetUploadResponse:
        """Process an uploaded dataset file"""
        # Generate a unique dataset ID
        dataset_id = str(uuid.uuid4())
        
        # Read the file content
        content = await file.read()
        
        # Determine file type and parse accordingly
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise ValueError(f"Unsupported file format: {file.filename}")
        
        # Save the dataset
        dataset_path = os.path.join(self.datasets_dir, f"{tenant_id}_{dataset_id}.csv")
        df.to_csv(dataset_path, index=False)
        
        # Generate column statistics
        column_stats = {}
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                column_stats[col] = {
                    "dtype": str(df[col].dtype),
                    "count": int(df[col].count()),
                    "mean": float(df[col].mean()) if not df[col].isnull().all() else None,
                    "std": float(df[col].std()) if not df[col].isnull().all() else None,
                    "min": float(df[col].min()) if not df[col].isnull().all() else None,
                    "25%": float(df[col].quantile(0.25)) if not df[col].isnull().all() else None,
                    "50%": float(df[col].quantile(0.5)) if not df[col].isnull().all() else None,
                    "75%": float(df[col].quantile(0.75)) if not df[col].isnull().all() else None,
                    "max": float(df[col].max()) if not df[col].isnull().all() else None,
                    "missing": int(df[col].isnull().sum())
                }
            elif pd.api.types.is_categorical_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
                top_values = df[col].value_counts().head(5).to_dict()
                column_stats[col] = {
                    "dtype": str(df[col].dtype),
                    "count": int(df[col].count()),
                    "unique": int(df[col].nunique()),
                    "top": str(df[col].mode()[0]) if not df[col].isnull().all() else None,
                    "freq": int(df[col].value_counts().iloc[0]) if not df[col].isnull().all() else None,
                    "top_values": {str(k): int(v) for k, v in top_values.items()},
                    "missing": int(df[col].isnull().sum())
                }
            else:
                column_stats[col] = {
                    "dtype": str(df[col].dtype),
                    "count": int(df[col].count()),
                    "missing": int(df[col].isnull().sum())
                }
        
        # Save metadata
        metadata = {
            "dataset_id": dataset_id,
            "tenant_id": tenant_id,
            "filename": file.filename,
            "upload_time": datetime.now().isoformat(),
            "rows": len(df),
            "columns": len(df.columns),
            "column_names": list(df.columns),
            "column_stats": column_stats
        }
        
        metadata_path = os.path.join(self.datasets_dir, f"{tenant_id}_{dataset_id}_metadata.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f)
        
        # Return response
        return DatasetUploadResponse(
            dataset_id=dataset_id,
            tenant_id=tenant_id,
            filename=file.filename,
            rows=len(df),
            columns=len(df.columns),
            preview=df.head(5).to_dict('records'),
            column_stats=column_stats
        )
    
    async def analyze_dataset(self, request: DatasetAnalysisRequest) -> AnalysisResult:
        """Analyze a dataset and return insights"""
        dataset_path = os.path.join(self.datasets_dir, f"{request.tenant_id}_{request.dataset_id}.csv")
        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Dataset not found: {dataset_path}")
        
        # Load dataset
        df = pd.read_csv(dataset_path)
        
        result = AnalysisResult()
        
        # Perform requested operations
        if "summary" in request.operations:
            result.summary = {
                "rows": len(df),
                "columns": len(df.columns),
                "missing_values": int(df.isnull().sum().sum()),
                "duplicate_rows": int(df.duplicated().sum()),
                "numeric_columns": len(df.select_dtypes(include=['number']).columns),
                "categorical_columns": len(df.select_dtypes(include=['object', 'category']).columns),
                "datetime_columns": len(df.select_dtypes(include=['datetime']).columns),
                "memory_usage": int(df.memory_usage(deep=True).sum())
            }
        
        if "correlation" in request.operations:
            # Calculate correlation matrix for numeric columns
            numeric_df = df.select_dtypes(include=['number'])
            if not numeric_df.empty:
                corr_matrix = numeric_df.corr().fillna(0).round(3)
                result.correlation = corr_matrix.to_dict()
            else:
                result.correlation = {}
        
        if "missing_values" in request.operations:
            # Count missing values by column
            missing = df.isnull().sum()
            result.missing_values = {col: int(count) for col, count in missing.items() if count > 0}
        
        if "outliers" in request.operations:
            # Detect outliers using IQR method for numeric columns
            outliers = {}
            for col in df.select_dtypes(include=['number']).columns:
                if df[col].notnull().sum() > 0:
                    Q1 = df[col].quantile(0.25)
                    Q3 = df[col].quantile(0.75)
                    IQR = Q3 - Q1
                    lower_bound = Q1 - 1.5 * IQR
                    upper_bound = Q3 + 1.5 * IQR
                    outlier_indices = df[(df[col] < lower_bound) | (df[col] > upper_bound)].index.tolist()
                    if outlier_indices:
                        outliers[col] = [int(i) for i in outlier_indices]
            
            result.outliers = outliers
        
        if "distributions" in request.operations:
            # Generate distribution statistics for columns
            distributions = {}
            
            # For numeric columns
            for col in df.select_dtypes(include=['number']).columns:
                if df[col].notnull().sum() > 0:
                    # Calculate histogram
                    hist, bin_edges = np.histogram(df[col].dropna(), bins=10)
                    
                    distributions[col] = {
                        "type": "numeric",
                        "histogram": {
                            "counts": hist.tolist(),
                            "bin_edges": [float(x) for x in bin_edges.tolist()]
                        },
                        "skewness": float(df[col].skew()),
                        "kurtosis": float(df[col].kurtosis())
                    }
            
            # For categorical columns
            for col in df.select_dtypes(include=['object', 'category']).columns:
                if df[col].notnull().sum() > 0:
                    value_counts = df[col].value_counts().head(10)
                    
                    distributions[col] = {
                        "type": "categorical",
                        "value_counts": {str(k): int(v) for k, v in value_counts.items()},
                        "unique_count": int(df[col].nunique())
                    }
            
            result.distributions = distributions
        
        return result

    async def get_dataset_info(self, dataset_id: str, tenant_id: str):
        """Get information about a dataset"""
        metadata_path = os.path.join(self.datasets_dir, f"{tenant_id}_{dataset_id}_metadata.json")
        if not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Dataset not found: {dataset_id}")
        
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
            return metadata
    
    async def get_column_values(self, dataset_id: str, tenant_id: str, column_name: str, limit: int = 100):
        """Get unique values for a column in a dataset"""
        dataset_path = os.path.join(self.datasets_dir, f"{tenant_id}_{dataset_id}.csv")
        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Dataset not found: {dataset_id}")
        
        # Load just the requested column
        df = pd.read_csv(dataset_path, usecols=[column_name])
        
        if column_name not in df.columns:
            raise ValueError(f"Column not found: {column_name}")
        
        # Get unique values
        unique_values = df[column_name].dropna().unique().tolist()
        
        # Limit the number of values returned
        if len(unique_values) > limit:
            unique_values = unique_values[:limit]
        
        return {
            "column": column_name,
            "unique_values": [str(val) for val in unique_values],
            "total_unique": df[column_name].nunique(),
            "truncated": len(unique_values) < df[column_name].nunique()
        }

    async def delete_dataset(self, dataset_id: str, tenant_id: str) -> bool:
        """Delete a dataset"""
        dataset_path = os.path.join(self.datasets_dir, f"{tenant_id}_{dataset_id}.csv")
        metadata_path = os.path.join(self.datasets_dir, f"{tenant_id}_{dataset_id}_metadata.json")
        
        if not os.path.exists(dataset_path) or not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Dataset not found: {dataset_id}")
        
        try:
            os.remove(dataset_path)
            os.remove(metadata_path)
            return True
        except Exception as e:
            logger.error(f"Error deleting dataset {dataset_id}: {str(e)}", exc_info=True)
            return False