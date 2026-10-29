from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    cors_origins: str = "http://localhost:5173"
    excel_path: str = "data/AutomacaoPlanner.xlsx"
    sap_network_path: str = r"\\sb2-fs\4_GESTAO_DA_QUALIDADE$\00_KPI_&_GSD\Melhoria Contínua\APPs\Automação Planner\AutomacaoPlanner.xlsx"
    sap_script_path: str = ""
    sap_command: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
