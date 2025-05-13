# File: ml-server/auth.py
import os
import json
import logging
from typing import Optional
from fastapi import Header, HTTPException, Depends

logger = logging.getLogger("ml_auth")

# In a production environment, you would store API keys in a database
# For this example, we'll use a simple JSON file
API_KEYS_FILE = "api_keys.json"

def load_api_keys():
    """Load API keys from file"""
    if not os.path.exists(API_KEYS_FILE):
        # Create default API keys file
        default_keys = {
            "master_key": {
                "key": "master_sk_1234567890",
                "tenant_id": None,
                "permissions": ["admin"]
            }
        }
        
        for i in range(1, 5):
            tenant_id = f"tenant_{i}"
            default_keys[f"tenant_{i}_key"] = {
                "key": f"tenant_{i}_sk_{i}0987654321",
                "tenant_id": tenant_id,
                "permissions": ["read", "write"]
            }
        
        with open(API_KEYS_FILE, 'w') as f:
            json.dump(default_keys, f, indent=2)
        
        return default_keys
    
    try:
        with open(API_KEYS_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading API keys: {str(e)}")
        return {}

def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify API key and return API key details"""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required")
    
    api_keys = load_api_keys()
    
    for key_info in api_keys.values():
        if key_info["key"] == x_api_key:
            return key_info
    
    raise HTTPException(status_code=401, detail="Invalid API key")

def get_tenant_id(api_key_info: dict = Depends(verify_api_key)):
    """Get tenant ID from API key"""
    # Master key can access all tenants
    if "admin" in api_key_info["permissions"]:
        return api_key_info.get("tenant_id", "master")
    
    if not api_key_info.get("tenant_id"):
        raise HTTPException(status_code=403, detail="API key not associated with a tenant")
    
    return api_key_info["tenant_id"]