
import os
import certifi

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load environment variables
load_dotenv()

# SSL certificate configuration
if not os.environ.get("SSL_CERT_FILE") or not os.path.exists(
    os.environ.get("SSL_CERT_FILE", "")
):
    os.environ["SSL_CERT_FILE"] = certifi.where()


class Settings(BaseSettings):



    #groq
    groq_api_key: str = ""
    groq_stt_model: str = "whisper-large-v3-turbo"

    # OpenRouter
    openrouter_api_key: str = ""
    openrouter_chat_model: str = "openai/gpt-4.1-mini"
    openrouter_embed_model: str = "openai/text-embedding-3-small"
    openrouter_vision_model: str = "openai/gpt-4.1-mini"

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "medical-agent"

    # Tavily
    tavily_api_key: str = ""

    # Application security
    api_token: str = ""

    # CORS
    allowed_origins: str = (
        "http://localhost:8002,"
        "http://127.0.0.1:8002"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False
    )


settings = Settings()
