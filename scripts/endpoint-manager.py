#!/usr/bin/env python3
"""
Flexible LLM Endpoint Manager for Moonshot Backend
Registers user-specified LLM endpoints from MCP server into Moonshot backend registry.
"""

import json
import os
import sys
from pathlib import Path
import traceback
from typing import Dict, Any, Optional

def add_moonshot_to_path():
    """Add the moonshot module to Python path"""
    current_dir = Path(__file__).parent
    moonshot_dir = current_dir.parent.parent / "revised-moonshot"
    
    if moonshot_dir.exists():
        sys.path.insert(0, str(moonshot_dir))
        return True
    else:
        raise RuntimeError(f"Moonshot directory not found at {moonshot_dir}")

def validate_endpoint_config(config: Dict[str, Any]) -> None:
    """Validate endpoint configuration has required fields"""
    required_fields = ['name', 'connector_type', 'model']
    missing_fields = [field for field in required_fields if field not in config]
    
    if missing_fields:
        raise ValueError(f"Missing required fields in endpoint config: {missing_fields}")
    
    # Set defaults for optional fields
    config.setdefault('uri', '')
    config.setdefault('token', '')
    config.setdefault('max_calls_per_second', 2)
    config.setdefault('max_concurrency', 1)
    config.setdefault('params', {})

def register_endpoint(config: Dict[str, Any]) -> str:
    """Register an endpoint in Moonshot backend"""
    try:
        from moonshot.src.api.api_connector_endpoint import api_create_endpoint
        
        validate_endpoint_config(config)
        
        endpoint_id = api_create_endpoint(
            name=config['name'],
            connector_type=config['connector_type'],
            uri=config['uri'],
            token=config['token'],
            max_calls_per_second=config['max_calls_per_second'],
            max_concurrency=config['max_concurrency'],
            model=config['model'],
            params=config['params']
        )
        
        return endpoint_id
        
    except ImportError as e:
        raise RuntimeError(f"Failed to import Moonshot modules. Is Moonshot backend installed? Error: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to register endpoint '{config.get('name', 'unknown')}': {e}")

def check_endpoint_exists(endpoint_name: str) -> bool:
    """Check if endpoint already exists in Moonshot registry"""
    try:
        from moonshot.src.api.api_connector_endpoint import api_get_all_endpoint
        
        endpoints = api_get_all_endpoint()
        return any(
            ep.get('name') == endpoint_name or ep.get('id') == endpoint_name
            for ep in endpoints
        )
        
    except ImportError as e:
        raise RuntimeError(f"Failed to import Moonshot modules: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to check existing endpoints: {e}")

def get_endpoint_config_from_file(endpoint_name: str) -> Optional[Dict[str, Any]]:
    """Load endpoint configuration from moonshot-data directory"""
    data_dir = Path(__file__).parent.parent.parent / "revised-moonshot-data" / "connectors-endpoints"
    
    # Try different possible filenames
    possible_files = [
        f"{endpoint_name}.json",
        f"{endpoint_name}-connector.json",
    ]
    
    for filename in possible_files:
        config_path = data_dir / filename
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                raise RuntimeError(f"Failed to load config from {config_path}: {e}")
    
    return None

def register_endpoint_by_name(endpoint_name: str) -> str:
    """Register endpoint by name, loading config from data directory"""
    
    # Check if already exists
    if check_endpoint_exists(endpoint_name):
        return f"Endpoint '{endpoint_name}' already registered"
    
    # Load configuration
    config = get_endpoint_config_from_file(endpoint_name)
    if not config:
        available_configs = list_available_endpoint_configs()
        raise RuntimeError(
            f"No configuration found for endpoint '{endpoint_name}'. "
            f"Available endpoint configs: {available_configs}"
        )
    
    # Register endpoint
    endpoint_id = register_endpoint(config)
    return f"Successfully registered endpoint '{endpoint_name}' with ID: {endpoint_id}"

def register_custom_endpoint(config: Dict[str, Any]) -> str:
    """Register a custom endpoint configuration"""
    endpoint_name = config.get('name', 'unknown')
    
    # Check if already exists
    if check_endpoint_exists(endpoint_name):
        return f"Endpoint '{endpoint_name}' already registered"
    
    # Register endpoint
    endpoint_id = register_endpoint(config)
    return f"Successfully registered custom endpoint '{endpoint_name}' with ID: {endpoint_id}"

def list_available_endpoint_configs() -> list:
    """List available endpoint configurations in data directory"""
    data_dir = Path(__file__).parent.parent.parent / "revised-moonshot-data" / "connectors-endpoints"
    
    if not data_dir.exists():
        return []
    
    configs = []
    for file_path in data_dir.glob("*.json"):
        configs.append(file_path.stem)
    
    return sorted(configs)

def list_registered_endpoints() -> list:
    """List currently registered endpoints in Moonshot backend"""
    try:
        from moonshot.src.api.api_connector_endpoint import api_get_all_endpoint
        
        endpoints = api_get_all_endpoint()
        return [
            {
                'name': ep.get('name'),
                'model': ep.get('model'),
                'connector_type': ep.get('connector_type')
            }
            for ep in endpoints
        ]
        
    except Exception as e:
        raise RuntimeError(f"Failed to list registered endpoints: {e}")

def main():
    """Command-line interface for endpoint management"""
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python endpoint-manager.py register <endpoint_name>")
        print("  python endpoint-manager.py register-json <json_config>")
        print("  python endpoint-manager.py list-available")
        print("  python endpoint-manager.py list-registered")
        print("  python endpoint-manager.py check <endpoint_name>")
        sys.exit(1)
    
    try:
        add_moonshot_to_path()
        
        command = sys.argv[1]
        
        if command == "register":
            if len(sys.argv) != 3:
                raise ValueError("Usage: register <endpoint_name>")
            
            endpoint_name = sys.argv[2]
            result = register_endpoint_by_name(endpoint_name)
            print(result)
            
        elif command == "register-json":
            if len(sys.argv) != 3:
                raise ValueError("Usage: register-json <json_config>")
            
            config = json.loads(sys.argv[2])
            result = register_custom_endpoint(config)
            print(result)
            
        elif command == "list-available":
            configs = list_available_endpoint_configs()
            print("Available endpoint configurations:")
            for config in configs:
                print(f"  - {config}")
                
        elif command == "list-registered":
            endpoints = list_registered_endpoints()
            print("Registered endpoints:")
            for ep in endpoints:
                print(f"  - {ep['name']} ({ep['connector_type']}, {ep['model']})")
                
        elif command == "check":
            if len(sys.argv) != 3:
                raise ValueError("Usage: check <endpoint_name>")
            
            endpoint_name = sys.argv[2]
            exists = check_endpoint_exists(endpoint_name)
            print(f"Endpoint '{endpoint_name}' {'exists' if exists else 'does not exist'} in registry")
            
        else:
            raise ValueError(f"Unknown command: {command}")
            
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()