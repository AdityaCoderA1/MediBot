
from functools import lru_cache
from pinecone import Pinecone, ServerlessSpec
from openai import OpenAI
from app.config import settings


@lru_cache()
def clients():
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY is missing.")

    if not settings.pinecone_api_key:
        raise ValueError("PINECONE_API_KEY is missing.")

    openrouter = OpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )

    pinecone = Pinecone(
        api_key=settings.pinecone_api_key
    )

    return openrouter, pinecone


def ensure_index():
    _, pc = clients()

    if not pc.has_index(settings.pinecone_index):
        pc.create_index(
            name=settings.pinecone_index,
            dimension=1536,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1"
            )
        )

    index = pc.Index(settings.pinecone_index)

    # Verify index dimensions
    stats = index.describe_index_stats()

    if stats.dimension != 1536:
        raise ValueError(
            f"Pinecone dimension mismatch: expected 1536, "
            f"got {stats.dimension}"
        )

    return index


def embed(texts):
    ai, _ = clients()

    response = ai.embeddings.create(
        model=settings.openrouter_embed_model,
        input=texts
    )

    return [
        item.embedding
        for item in response.data
    ]


def search_kb(query, top_k=5):
    index = ensure_index()

    vector = embed([query])[0]

    result = index.query(
        vector=vector,
        top_k=top_k,
        include_metadata=True
    )

    return [
        {
            "page": m.metadata.get("page"),
            "text": m.metadata.get("text", ""),
            "score": round(m.score, 3),
            "source": "Gale Encyclopedia (2002)"
        }
        for m in result.matches
        if m.score >= 0.30
    ]
