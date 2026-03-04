try:
    import yaml
except ImportError:
    yaml = None
    print("Warning: pyyaml not found. Using default configuration.")

from pathlib import Path

CONFIG_PATH = "base/configs/agents_config.yaml"

_global_config = None

def load_global_config():
    global _global_config
    if _global_config is None:
        if yaml:
            config_path = Path(__file__).parent.parent.parent / CONFIG_PATH
            try:
                with open(config_path, "r", encoding='utf-8') as f:
                    _global_config = yaml.safe_load(f)
                _global_config['__config_path__'] = str(config_path.resolve())
            except Exception as e:
                print(f"Error loading config file: {e}")
                _global_config = {}
        else:
            _global_config = {}
            
    return _global_config

def get_config_section(section_name: str) -> dict:
    config = load_global_config()
    return config.get(section_name, {})
