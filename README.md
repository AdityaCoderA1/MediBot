# MediBot

python -m venv myenv

venv\Scripts\activate

pip install -r requirements.txt

Create a `.env` file in the project root and add your API keys:

```env
OPENROUTER_API_KEY=your-openrouter-api-key
PINECONE_API_KEY=your-pinecone-api-key
```

Ingestion and knowledge-base search use OpenRouter's OpenAI-compatible API.
The default embedding model is `openai/text-embedding-3-small` (1536 dimensions),
which matches the Pinecone index dimension. If you change the embedding model,
make sure its output dimension matches the index.

