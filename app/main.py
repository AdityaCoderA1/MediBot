
import base64
import io
import secrets
from pathlib import Path
from uuid import uuid4
from groq import Groq

from fastapi import (
    FastAPI, File, Form, Header, HTTPException, UploadFile
)
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from openai import OpenAI

from app.config import settings
from app.agent import graph


ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="Medical Agent Educational API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Conversation-ID"]
)

app.mount(
    "/static",
    StaticFiles(directory=ROOT / "static"),
    name="static"
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, str]] = Field(
        default_factory=list,
        max_length=10
    )
    image_data: str | None = None


def auth(authorization: str | None):
    if settings.api_token and not secrets.compare_digest(
        authorization or "",
        f"Bearer {settings.api_token}"
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid API token"
        )


def get_openrouter_client():
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is missing in .env"
        )

    return OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        timeout=45
    )


def inspect_image(data):
    if not data:
        return ""

    try:
        header, payload = data.split(",", 1)
        mime = header.split(";")[0].split(":")[1]

        raw = base64.b64decode(payload, validate=True)

        if (
            mime not in ("image/jpeg", "image/png", "image/webp")
            or len(raw) > 5_000_000
        ):
            raise ValueError(
                "Only JPEG/PNG/WebP images under 5MB are supported"
            )

    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image: {exc}"
        )

    client = get_openrouter_client()

    try:
        result = client.chat.completions.create(
            model=settings.openrouter_vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Describe only objectively visible "
                                "medical-relevant features. Do not diagnose, "
                                "estimate severity, or assert absence of "
                                "illness. If the image is unclear, say so."
                            )
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data
                            }
                        }
                    ]
                }
            ],
            max_tokens=300
        )

        return result.choices[0].message.content or ""

    except Exception as exc:
        print("OpenRouter vision error:", repr(exc), flush=True)
        raise HTTPException(
            status_code=502,
            detail="Image analysis failed. Check your OpenRouter model and credits."
        )


@app.get("/", response_class=HTMLResponse)
def home():
    return (
        ROOT / "templates" / "index.html"
    ).read_text(encoding="utf-8")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "configured": bool(
            settings.openrouter_api_key
            and settings.pinecone_api_key
        ),
        "tavily": bool(settings.tavily_api_key)
    }


@app.post("/api/chat")
def chat(
    payload: ChatRequest,
    authorization: str | None = Header(default=None),
    conversation_id: str | None = Header(
        default=None,
        alias="X-Conversation-ID"
    )
):
    auth(authorization)

    if (
        not settings.openrouter_api_key
        or not settings.pinecone_api_key
    ):
        raise HTTPException(
            status_code=503,
            detail="Set OPENROUTER_API_KEY and PINECONE_API_KEY in .env"
        )

    history = [
        x for x in payload.history
        if (
            x.get("role") in ("user", "assistant")
            and isinstance(x.get("content"), str)
        )
    ][:10]

    # SQLite persistent memory
    thread_id = conversation_id or str(uuid4())

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    try:
        observation = inspect_image(payload.image_data)

        state = graph.invoke(
            {
                "question": payload.message,
                "history": history,
                "image_description": observation,
                "kb": [],
                "web": [],
                "answer": "",
                "route": ""
            },
            config=config
        )

        return {
            "answer": state["answer"],
            "sources": (
                [
                    {
                        "type": "pdf",
                        "page": x["page"],
                        "score": x["score"]
                    }
                    for x in state["kb"]
                ]
                +
                [
                    {
                        "type": "web",
                        "url": x["url"],
                        "title": x["title"]
                    }
                    for x in state["web"]
                ]
            ),
            "tools": (
                ["pinecone"]
                + (
                    ["tavily"]
                    if (
                        state["route"] == "web"
                        and settings.tavily_api_key
                    )
                    else []
                )
                + (["vision"] if observation else [])
            ),
            "conversation_id": thread_id
        }

    except HTTPException:
        raise

    except Exception as exc:
        print("Chat error:", repr(exc), flush=True)

        raise HTTPException(
            status_code=502,
            detail=(
                "AI service failed. Check server logs, OpenRouter "
                "credits, credentials, Pinecone index, and connectivity."
            )
        )


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None)
):
    auth(authorization)

    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is missing in .env"
        )

    audio = await file.read()

    if not audio:
        raise HTTPException(status_code=400, detail="Empty audio file")

    if len(audio) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file is too large")

    try:
        client = Groq(api_key=settings.groq_api_key)

        result = client.audio.transcriptions.create(
            file=(
                file.filename or "voice.webm",
                audio,
                file.content_type or "audio/webm"
            ),
            model=settings.groq_stt_model,
            response_format="json"
        )

        return {"text": result.text}

    except Exception as exc:
        print("Groq transcription error:", repr(exc), flush=True)

        raise HTTPException(
            status_code=502,
            detail="Groq transcription failed. Check your API key and audio format."
        )
    finally:
        await file.close()


@app.post("/api/speak")
def speak(
    payload: dict,
    authorization: str | None = Header(default=None)
):
    auth(authorization)

    text = str(payload.get("text", ""))[:3000]

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Missing text"
        )

    raise HTTPException(
        status_code=501,
        detail=(
            "Speech synthesis requires a separate text-to-speech provider. "
            "OpenRouter chat configuration does not provide OpenAI TTS."
        )
    )
