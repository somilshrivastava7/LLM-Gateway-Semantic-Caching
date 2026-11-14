
import { pool } from "./db.js";

export async function logRequest({
    prompt,
    cacheType,
    latencyMs,
    promptTokens = null,
    completionTokens = null,
    totalTokens = null,
    status,
    errorMessage = null
}) {
    const query = `
        INSERT INTO request_logs (
            prompt,
            cache_type,
            latency_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            status,
            error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const values = [
        prompt,
        cacheType,
        latencyMs,
        promptTokens,
        completionTokens,
        totalTokens,
        status,
        errorMessage
    ];

    await pool.query(query, values);
}
