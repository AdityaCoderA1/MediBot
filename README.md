# MedGuide AI — LangGraph + Pinecone + FastAPI

An educational medical assistant built with **LangGraph, OpenRouter, Pinecone, FastAPI, and Tavily**. It uses retrieval from the bundled historical Gale Encyclopedia of Medicine (2002, Volume 1 A–B), optional web search, image observations, and a vanilla JavaScript web interface.

> **Disclaimer:** This is a tutorial reference implementation, not a clinically validated diagnostic system or HIPAA-compliant deployment.

## Features

- **AI reasoning:** OpenRouter-compatible chat models through the OpenAI SDK and LangChain.
- **RAG pipeline:** LangGraph orchestration with Pinecone vector retrieval.
- **Knowledge base:** Historical Gale Encyclopedia of Medicine (2002, Volume 1 A–B).
- **Web fallback:** Optional Tavily search for current medical information.
- **Image observations:** OpenRouter vision model for describing visible medical-relevant features.
- **Conversation memory:** SQLite-backed LangGraph checkpointing.
- **Backend:** FastAPI REST API.
- **Frontend:** Vanilla JavaScript, HTML, and CSS.
- **Speech input/output:** Requires a separate speech-to-text and text-to-speech provider; not provided by the current OpenRouter integration.

## Requirements

- Python 3.11 or 3.12
- OpenRouter API key
- Pinecone API key
- Tavily API key (optional)
- Internet connection

## Setup

### 1. Create and activate a virtual environment

Using Conda:

```bash
conda create -n medguide python=3.11 -y
conda activate medguide
```

Or using Python virtual environments:

**Windows PowerShell:**

```powershell
python -m venv myenv
myenv\Scripts\Activate.ps1
```

**macOS/Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

OPENROUTER_CHAT_MODEL=openai/gpt-4.1-mini
OPENROUTER_EMBED_MODEL=openai/text-embedding-3-small
OPENROUTER_VISION_MODEL=openai/gpt-4.1-mini

PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=medical-agent

TAVILY_API_KEY=your_tavily_api_key

API_TOKEN=your_long_random_secret

ALLOWED_ORIGINS=http://localhost:8002,http://127.0.0.1:8002
```

Replace the placeholder values with your own credentials. Never commit `.env` or expose API keys in your frontend or public repository.

### 4. Ingest the medical knowledge base

Place your PDF at:

```text
data/medical_book.pdf
```

Run:

```bash
python ingest.py --pdf data/medical_book.pdf
```

This process extracts readable PDF text, creates chunks, generates embeddings through OpenRouter, and stores vectors in Pinecone.

The configured `text-embedding-3-small` model produces 1536-dimensional embeddings. The Pinecone index must use the same dimension.

**Important:** Ingestion makes API calls that may consume OpenRouter credits. Run it once initially and again whenever you intentionally update the knowledge base.

### 5. Start the FastAPI server

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8002
```

Open:

- Web application: http://127.0.0.1:8002
- API documentation: http://127.0.0.1:8002/docs
- Health check: http://127.0.0.1:8002/api/health

## Project Structure

```text
MedGuide/
│
├── app/
│   ├── config.py          # Environment configuration and SSL setup
│   ├── knowledge.py       # OpenRouter embeddings and Pinecone retrieval
│   ├── agent.py           # LangGraph agent and orchestration
│   └── main.py            # FastAPI endpoints and image observations
│
├── data/
│   └── medical_book.pdf   # Historical medical reference PDF
│
├── templates/
│   └── index.html         # Web application interface
│
├── static/
│   ├── style.css          # Frontend styling
│   └── app.js             # Browser-side functionality
│
├── ingest.py              # PDF chunking and vector ingestion
├── requirements.txt
├── .env                   # API credentials (not committed)
└── README.md
```

## Architecture

```text
                 User
                  |
                  v
          FastAPI Application
                  |
                  v
            LangGraph Agent
                  |
          +-------+-------+
          |               |
          v               v
     Pinecone RAG     Tavily Search
          |               |
          v               v
      Retrieved       Web Results
       Context            |
          |               |
          +-------+-------+
                  |
                  v
             OpenRouter
           Chat Model
                  |
                  v
             AI Response
                  |
                  v
             User Interface
```

Image observations are processed through the configured OpenRouter vision model before being passed to the agent.

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Web application |
| `/api/health` | GET | Configuration health check |
| `/api/chat` | POST | Medical question and answer |
| `/api/transcribe` | POST | Speech-to-text placeholder |
| `/api/speak` | POST | Text-to-speech placeholder |

The transcription and speech synthesis endpoints currently return HTTP 501 until a separate speech provider is integrated.

## Troubleshooting

**OpenRouter authentication errors**

- Verify `OPENROUTER_API_KEY`.
- Check that the selected model is available on OpenRouter.
- Check account credits and model pricing.

**402 — Insufficient credits**

- Reduce the model's `max_tokens` setting.
- Reduce the amount of retrieved context and conversation history.
- Check your OpenRouter credit balance.

**401 — Unauthorized**

If `API_TOKEN` is configured, provide the matching Bearer token through the frontend's API access section.

**502 — AI service failure**

Inspect the backend terminal and verify:

- OpenRouter credentials and model configuration.
- Pinecone API key and index availability.
- Embedding model and index dimensions.
- Internet connectivity and SSL certificate configuration.

**No knowledge-base results**

- Run `python ingest.py --pdf data/medical_book.pdf`.
- Ensure ingestion completed successfully.
- Confirm that the application uses the same Pinecone index.
- Verify that the embedding model matches the one used during ingestion.

**Tavily search unavailable**

Tavily is optional. Without its API key, external search fallback is unavailable.

**Camera and microphone issues**

Browser permissions and localhost or HTTPS are required for camera and microphone access.

## Security and Production Limitations

This project is a functional educational scaffold, not a production medical device.

Before deploying to real patients:

- Replace shared API-token authentication with secure server-side identity and authorization.
- Implement encrypted, database-backed conversations with retention and deletion controls.
- Add request throttling, upload validation, and file-size restrictions.
- Implement structured logging, observability, automated testing, and evaluation.
- Add clinically reviewed emergency triage and safety workflows.
- Use current, authoritative medical references.
- Verify licensing before hosting or indexing the Gale Encyclopedia PDF.
- Complete privacy, security, and legal reviews.
- Secure deployment behind HTTPS.
- Do not send identifiable patient information to third-party APIs without appropriate consent and agreements.

The historical Gale Encyclopedia (2002) may contain outdated medical information. Model instructions do not guarantee clinical safety. Image observations cannot confirm or rule out disease.

**MedGuide AI provides educational information only. It does not diagnose diseases, replace medical professionals, or prescribe treatment.**