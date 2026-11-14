import express, { response } from "express";
import "dotenv/config"; // We use dotenv to get apikeys from .env file
import { GoogleGenAI } from "@google/genai";

import { logger } from "./middleware/logger.js";
import { rateLimiter } from "./middleware/ratelimiter.js";


import { logRequest } from "./logRequest.js";



const app = express();




app.use(express.json());
app.use(logger);   //? -------------   GLOBAL MIDDLEWARE
app.use(rateLimiter);


let cacheType;




import pg from "pg";


const { Pool } = pg;

export const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
});






//!==============================================================================

const SIMILARITY_THRESHOLD = 0.88;

// Compare two embedding vectors using cosine similarity
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct /
        (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}



const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500;

// ?  CACHE ================

const cache = new Map();



const metrics = {
    exactHits: 0,
    semanticHits: 0,
    cacheMisses: 0,
    generationCalls: 0,
    totalRequests: 0,
    totalLatency: 0,
    cacheLatency: 0,
    generationLatency: 0,
    cacheResponses: 0,

};



const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// * A request should reach Gemini only if the rate limiter allows it.





app.post("/chat", async (req, res) => {

    
    //* Start time for latency calculation


    metrics.totalRequests++; // Count every chat request


    let latency;

    const start = Date.now();

    const { message } = req.body; //* Javascript Destructuring

    console.log("User message:", message);

    //! INPUT VALIDATION : clients can send many weird things




    if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({
            // 400 means there is an error from clients side
            error: "Message is required",
        });
    }





    const prompt = message.trim();
    const cachedEntry = cache.get(prompt);

    //! WE WILL LOOK FOR PROMPT IN OUR CACHED MAP

    if (cachedEntry) {
        if (Date.now() < cachedEntry.expiresAt) {
            metrics.exactHits++;
            console.log("CACHE HIT !! ");



            latency = Date.now() - start;
            metrics.cacheLatency += latency;
            metrics.cacheResponses++;
            metrics.totalLatency += latency;

            // Move entry to the end to mark it recently used
            // ! LRU -- LEAST RECENTLY USED simple implementation
            cache.delete(prompt);

            cache.set(prompt, cachedEntry);

            latency = Date.now() - start;
            console.log(`CACHE RESPONSE | ${latency} ms`);
            cacheType = "exact";




            await logRequest({
                prompt,
                cacheType: "exact",
                latencyMs: Date.now() - start,
                status: "success"
            });





            return res.json({
                response: cachedEntry.response,
                cached: true,
            });
        } else {
            cache.delete(prompt);
        }
    }



     cacheType = "miss";

    console.log("CACHE MISS");








    //*WE HERE SEND THE REQUEST.JSON TO GEMINI API
    try {


        // ! Semantic Caching  -- USED VECTOR EMBEDDINGS

        const embeddingResult = await ai.models.embedContent({
            model: "gemini-embedding-001",
            contents: prompt,
            config: {
                taskType: "SEMANTIC_SIMILARITY"
            }
        });

        const queryEmbedding = embeddingResult.embeddings[0].values;

        let bestMatch = null;
        let bestSimilarity = 0;

        for (const [cachedPrompt, entry] of cache) {

            // Ignore expired entries
            if (Date.now() >= entry.expiresAt) {
                cache.delete(cachedPrompt);
                continue;
            }

            // Ignore old entries that don't have embeddings
            if (!entry.embedding) {
                continue;
            }

            const similarity = cosineSimilarity(
                queryEmbedding,
                entry.embedding
            );

            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = [cachedPrompt, entry];
            }
        }

        if (
            bestMatch &&
            bestSimilarity >= SIMILARITY_THRESHOLD
        ) {
            metrics.semanticHits++;
            const [matchedPrompt, matchedEntry] = bestMatch;

            // Move the matched entry to the end of the Map
            cache.delete(matchedPrompt);
            cache.set(matchedPrompt, matchedEntry);

            console.log(
                `SEMANTIC CACHE HIT | Similarity: ${bestSimilarity.toFixed(3)}`

            );




            latency = Date.now() - start;
            metrics.cacheLatency += latency;
            metrics.cacheResponses++;
            metrics.totalLatency += latency;



            cacheType = "semantic";






            await logRequest({
                prompt,
                cacheType: "semantic",
                latencyMs: Date.now() - start,
                status: "success"
            });







            return res.json({
                response: matchedEntry.response,
                cached: true,
                cacheType: "semantic",
                similarity: Number(bestSimilarity.toFixed(3))
            });
        }



        metrics.cacheMisses++;




        console.log("SEMANTIC CACHE MISS");






        //?================================================

        // !   throw new Error("Testing error handling");




        const generationStart = Date.now();

        metrics.generationCalls++;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        metrics.generationLatency += Date.now() - generationStart;

        latency = Date.now() - start; // We calculate latency time taken by our api to process request




        console.log(`Request SUCCESSFUL |  ${latency} ms`);

        // * console.log(response);

        console.log("MODEL :", response.modelVersion);
        console.log(
            "PROMPT TOKEN COUNT :",
            response.usageMetadata?.promptTokenCount,
        ); //These are the tokens consumed by the input.
        console.log(
            "CANDIDATE TOKEN COUNT ",
            response.usageMetadata?.candidatesTokenCount,
        );
        console.log("TOTAL TOKEN COUNT :", response.usageMetadata?.totalTokenCount);

        // * NOW WE SEND THE RESPONSE OF THE GEMINI API TO OUR CLIENT SIDE

        const answer = response.text;






        //* CACHE Save only successful responses with a usable answer
        if (typeof answer === "string" && answer.length > 0) {
            // Remove the oldest entry if the cache is full
            if (!cache.has(prompt) && cache.size >= MAX_CACHE_SIZE) {
                const oldestKey = cache.keys().next().value;
                cache.delete(oldestKey);
            }

            // Save response with its expiry time
            cache.set(prompt, {
                response: answer,
                embedding: queryEmbedding,
                expiresAt: Date.now() + CACHE_TTL
            });
        }



        await logRequest({
            prompt,
            cacheType: "miss",
            latencyMs: Date.now() - start,
            promptTokens: response.usageMetadata?.promptTokenCount ?? null,
            completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
            totalTokens: response.usageMetadata?.totalTokenCount ?? null,
            status: "success"
        });




        return res.json({
            response: answer,
            cached: false,
        });
    } catch (error) {
        latency = Date.now() - start;
        console.error(`Request FAILED | ${latency}ms`);
        console.error(error);




        try {
            await logRequest({
                prompt,
                cacheType,
                latencyMs: Date.now() - start,
                status: "error",
                errorMessage: error.message
            });
        } catch (dbError) {
            console.error("Failed to save request log:", dbError.message);
        }



        return res.status(500).json({
            //500 means internal server error
            error: "Failed to generate response",
        });
    }
    // NOW WE SEND THE RESPONSE OF THE GEMINI API TO OUR CLIENT SIDE


});




app.get("/metrics", (req, res) => {
    const cacheHits =
        metrics.exactHits + metrics.semanticHits;

    const hitRate =
        cacheHits + metrics.cacheMisses === 0
            ? 0
            : (cacheHits /
                (cacheHits + metrics.cacheMisses)) * 100;



    res.json({
        ...metrics,
        cacheHits,
        cacheHitRate: Number(hitRate.toFixed(2)),
        avgCacheLatency: metrics.cacheResponses
            ? Number(
                (metrics.cacheLatency / metrics.cacheResponses).toFixed(2)
            )
            : 0,

        avgGenerationLatency: metrics.generationCalls
            ? Number(
                (metrics.generationLatency / metrics.generationCalls).toFixed(2)
            )
            : 0,
        generationCallsSaved:
            metrics.exactHits + metrics.semanticHits,

        cacheEfficiency: Number(
            (
                (metrics.exactHits + metrics.semanticHits) /
                Math.max(metrics.totalRequests, 1)
                * 100).toFixed(2)
        )
    });
});






app.get("/analytics", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) AS total_requests,
                COUNT(*) FILTER (
                    WHERE cache_type = 'exact'
                ) AS exact_hits,
                COUNT(*) FILTER (
                    WHERE cache_type = 'semantic'
                ) AS semantic_hits,
                COUNT(*) FILTER (
                    WHERE cache_type = 'miss'
                ) AS cache_misses,
                COUNT(*) FILTER (
                    WHERE status = 'success'
                ) AS successful_requests,
                COUNT(*) FILTER (
                    WHERE status = 'error'
                ) AS failed_requests,
                ROUND(AVG(latency_ms), 2) AS avg_latency_ms,
                COALESCE(SUM(total_tokens), 0) AS total_tokens
            FROM request_logs;
        `);

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Analytics query failed:", error.message);

        res.status(500).json({
            error: "Failed to retrieve analytics"
        });
    }
});





app.listen(3000, () => {
    console.log("Gateway running on port 3000");
});
