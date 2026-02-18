"""
Configuration settings for the application.
Loads from environment variables.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_NAME: str = "auto_annotation"
    DB_HOST: str = "postgres"  # Docker service name
    DB_PORT: int = 5432
    
    # Redis
    REDIS_URL: str = "redis://redis:6379/0"  # Docker service name
    
    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/0"  # Docker service name
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"  # Docker service name
    
    # App Settings
    SECRET_KEY: str = "change-this-in-production"
    DEBUG: bool = True
    
    # Paths
    DATA_DIR: str = "./data"
    MODELS_DIR: str = "./models"
    
    # Model Settings
    DEFAULT_EMBEDDING_MODEL: str = "clip"
    DEFAULT_DETECTION_MODEL: str = "yolov8n.pt"
    
    @property
    def DATABASE_URL(self) -> str:
        """Build database URL from components."""
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Create global settings instance
settings = Settings()
