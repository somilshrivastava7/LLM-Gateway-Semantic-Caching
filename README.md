# LLM Gateway with Semantic Caching

An Express API that sends chat prompts to Google Gemini, caches successful responses in memory, and logs request analytics to PostgreSQL. It checks for exact prompt matches first, then compares embeddings to find semantically similar cached prompts.

## Requirements

- Node.js and npm
- A PostgreSQL database
- A Google Gemini API key

## Setup

1. Install the project dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root. Keep this file private; it is excluded from Git.

   ```dotenv
   GEMINI_API_KEY=your_gemini_api_key
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your_database
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   ```

3. Create the request log table in the configured PostgreSQL database:

   ```sql
   CREATE TABLE IF NOT EXISTS request_logs (
       id BIGSERIAL PRIMARY KEY,
       prompt TEXT NOT NULL,
       cache_type TEXT NOT NULL,
       latency_ms INTEGER NOT NULL,
       prompt_tokens INTEGER,
       completion_tokens INTEGER,
       total_tokens INTEGER,
       status TEXT NOT NULL,
       error_message TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

4. Start the server:

   ```bash
   node server.js
   ```

   The API listens on `http://localhost:3000`.

## API

### `POST /chat`

Send a prompt as JSON:

```json
{
  "message": "Explain semantic caching in one paragraph."
}
```

Successful responses include `response` and `cached`. A semantic cache hit also includes `cacheType` and `similarity`. An empty or missing message returns `400`; requests over the per-IP rate limit return `429`.

The in-memory cache holds up to 500 entries for five minutes. Semantic matches use a cosine-similarity threshold of `0.88`. Cache contents and metrics are reset when the server restarts.

### `GET /metrics`

Returns process-local request, cache-hit, and latency metrics.

### `GET /analytics`

Returns aggregate request counts, average latency, and token usage from PostgreSQL. The `request_logs` table must exist.

## Rate limiting

The server allows a burst of five requests per IP and refills one request token per second. The limiter applies to all routes.
