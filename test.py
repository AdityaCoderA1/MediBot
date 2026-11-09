from app.config import settings

print("OpenRouter configured:", bool(settings.openrouter_api_key))
print("Pinecone configured:", bool(settings.pinecone_api_key))
print("Tavily configured:", bool(settings.tavily_api_key))

print("Chat model:", settings.openrouter_chat_model)
print("Embedding model:", settings.openrouter_embed_model)
print("Vision model:", settings.openrouter_vision_model)

print("Pinecone index:", settings.pinecone_index)