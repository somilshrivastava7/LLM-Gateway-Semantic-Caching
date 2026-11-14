
import { pool } from "./db.js";
import { logRequest } from "./logRequest.js";

try {
    await logRequest({
        prompt: "Test PostgreSQL logging",
        cacheType: "miss",
        latencyMs: 1250,
        promptTokens: 10,
        completionTokens: 25,
        totalTokens: 35,
        status: "success"
    });

    console.log("Test request logged successfully!");

    const result = await pool.query(
        "SELECT * FROM request_logs ORDER BY id DESC LIMIT 1"
    );

    console.log(result.rows[0]);
} catch (error) {
    console.error("Logging test failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
