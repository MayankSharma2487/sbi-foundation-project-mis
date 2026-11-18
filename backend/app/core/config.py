from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_SECRET = "change-me-in-env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://mis:mis@localhost:5432/mis"
    secret_key: str = INSECURE_DEFAULT_SECRET
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    max_failed_logins: int = 5
    lockout_minutes: int = 15
    cors_origins: str = "http://localhost:5173"
    superadmin_email: str = "admin@example.org"
    superadmin_password: str = ""
    superadmin_name: str = "Super Admin"

    @model_validator(mode="after")
    def _check_secret(self):
        if self.environment == "production" and (
            self.secret_key == INSECURE_DEFAULT_SECRET or len(self.secret_key) < 32
        ):
            raise ValueError("SECRET_KEY must be set to a random value of 32+ chars in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
