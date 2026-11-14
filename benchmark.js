
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const URL = "http://localhost:3000/chat";
const PAUSE_MS = 1100;

const TARGET_PER_SCENARIO = 100;
const MAX_MISS_ATTEMPTS = 250;

const runId = Date.now();
const results = [];

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------
// 1. SEND REQUEST
// --------------------------------------------------

async function sendRequest(message) {
    const start = performance.now();

    try {
        const response = await fetch(URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        });

        const rawBody = await response.text();

        let data = {};

        try {
            data = JSON.parse(rawBody);
        } catch {
            data = {};
        }

        return {
            latencyMs: performance.now() - start,
            status: response.status,
            data,
            error: response.ok
                ? ""
                : `HTTP ${response.status}: ${rawBody.slice(0, 200)}`
        };
    } catch (error) {
        return {
            latencyMs: performance.now() - start,
            status: 0,
            data: {},
            error: error.message
        };
    }
}

// --------------------------------------------------
// 2. CLASSIFY ACTUAL RESPONSE
// --------------------------------------------------

function classify(result) {
    if (result.error || result.status !== 200) {
        return "error";
    }

    const data = result.data;

    if (data.cached === true) {
        if (
            typeof data.cacheType === "string" &&
            data.cacheType.toLowerCase() === "semantic"
        ) {
            return "semantic_hit";
        }

        // Your exact-cache response currently omits cacheType.
        return "exact_hit";
    }

    if (data.cached === false) {
        return "generation_miss";
    }

    return "unknown";
}

// --------------------------------------------------
// 3. RECORD EVERY ATTEMPT
// --------------------------------------------------

async function recordSample(scenario, prompt) {
    const result = await sendRequest(prompt);
    const data = result.data;
    const actualType = classify(result);

    const row = {
        timestamp: new Date().toISOString(),
        scenario,
        actualType,
        latencyMs: Number(result.latencyMs.toFixed(2)),
        httpStatus: result.status,
        cached: data.cached ?? "",
        cacheType: data.cacheType ?? "unknown",
        similarity: data.similarity ?? "",
        error: result.error
    };

    results.push(row);

    console.log(
        `${scenario.padEnd(9)} | ` +
        `${row.latencyMs.toFixed(2).padStart(9)} ms | ` +
        `actual=${actualType} | HTTP ${row.httpStatus}`
    );

    return row;
}

// --------------------------------------------------
// 4. STATISTICS
// --------------------------------------------------

function percentile(values, p) {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);

    const index = Math.max(
        0,
        Math.ceil((p / 100) * sorted.length) - 1
    );

    return sorted[index];
}

function report(scenario, expectedType) {
    const all = results.filter(
        (row) => row.scenario === scenario
    );

    const valid = all.filter(
        (row) =>
            row.actualType === expectedType &&
            row.httpStatus === 200 &&
            !row.error
    );

    const unexpected = all.length - valid.length;

    console.log(`\n========== ${scenario.toUpperCase()} ==========`);

    console.log(`Attempts:          ${all.length}`);
    console.log(`Valid samples:     ${valid.length}`);
    console.log(`Unexpected/errors: ${unexpected}`);

    if (valid.length === 0) {
        console.log("No valid samples available.");
        return;
    }

    const values = valid.map((row) => row.latencyMs);

    const average =
        values.reduce((sum, value) => sum + value, 0) /
        values.length;

    console.log(`Average: ${average.toFixed(2)} ms`);
    console.log(`p50:     ${percentile(values, 50).toFixed(2)} ms`);
    console.log(`p95:     ${percentile(values, 95).toFixed(2)} ms`);
    console.log(`p99:     ${percentile(values, 99).toFixed(2)} ms`);
}

// --------------------------------------------------
// 5. MEASURE EXACT AND SEMANTIC HITS
// --------------------------------------------------

async function measureHits(scenario, prompts, expectedType) {
    let valid = 0;

    for (
        let attempt = 0;
        attempt < prompts.length && valid < TARGET_PER_SCENARIO;
        attempt++
    ) {
        const row = await recordSample(scenario, prompts[attempt]);

        if (
            row.actualType === expectedType &&
            row.httpStatus === 200 &&
            !row.error
        ) {
            valid++;
        }

        if (attempt < prompts.length - 1 && valid < TARGET_PER_SCENARIO) {
            await sleep(PAUSE_MS);
        }
    }

    console.log(
        `\n${scenario}: collected ${valid}/${TARGET_PER_SCENARIO} valid hits.`
    );
}

// --------------------------------------------------
// 6. DISTINCT MISS PROMPTS
// --------------------------------------------------

// Different topics reduce the chance of accidental
// semantic-cache matches. They cannot guarantee misses.

const topics = [
    "how a CPU instruction pipeline handles dependencies",
    "why database transactions need isolation levels",
    "how TCP congestion control reacts to packet loss",
    "how a garbage collector identifies unreachable objects",
    "why distributed clocks can disagree",
    "how a compiler performs register allocation",
    "how virtual memory maps pages to physical frames",
    "why database indexes become fragmented",
    "how a filesystem recovers after a crash",
    "how DNS resolvers cache domain records",
    "how TLS certificates establish server identity",
    "how a load balancer distributes incoming traffic",
    "why distributed systems use quorum reads",
    "how Raft elects a leader after a failure",
    "how write-ahead logging protects database changes",
    "how a hash table handles collisions",
    "how branch prediction improves processor performance",
    "how NUMA affects memory access latency",
    "how operating systems schedule competing processes",
    "how containers isolate process namespaces",
    "how GPU kernels divide work into thread blocks",
    "how model quantization reduces memory requirements",
    "how continuous batching improves inference throughput",
    "how a key-value store persists data to disk",
    "how a cache eviction policy chooses entries",
    "how Bloom filters answer membership queries",
    "how a message queue handles consumer failures",
    "how backpressure protects an overloaded service",
    "how circuit breakers prevent cascading failures",
    "how API gateways enforce request quotas",
    "how database connection pools reuse connections",
    "how a CDN selects a suitable edge server",
    "how object storage handles large files",
    "how erasure coding protects distributed data",
    "how RAID levels handle disk failures",
    "how a B-tree supports ordered range queries",
    "how MVCC provides consistent database snapshots",
    "how deadlocks form between database transactions",
    "how lock-free queues coordinate concurrent threads",
    "how false sharing slows down multithreaded programs",
    "how cache coherence maintains consistent CPU caches",
    "how an operating system handles page faults",
    "how a network switch learns MAC addresses",
    "how QUIC establishes a secure transport connection",
    "how HTTP/2 multiplexes concurrent requests",
    "how WebSockets maintain bidirectional communication",
    "how service discovery works in a cluster",
    "how Kubernetes restarts an unhealthy container",
    "how a rolling deployment avoids service downtime",
    "how observability traces requests across services",
    "how histogram buckets measure latency distributions",
    "how Prometheus scrapes application metrics",
    "how a token bucket rate limiter refills capacity",
    "how exponential backoff handles transient failures",
    "how idempotency keys prevent duplicate operations",
    "how retry storms increase production load",
    "how a database replica falls behind its primary",
    "how change-data capture streams database updates",
    "how a two-phase commit coordinates participants",
    "how eventual consistency affects read results",
    "how a distributed lease expires safely",
    "how leader-based replication orders writes",
    "how a storage engine compacts sorted tables",
    "how an LSM tree organizes recent writes",
    "how write amplification affects SSD endurance",
    "how a CPU handles a branch misprediction",
    "how SIMD instructions process multiple values",
    "how a kernel switches between user and kernel mode",
    "how system calls cross the privilege boundary",
    "how a thread pool limits concurrent work",
    "how asynchronous I/O avoids blocking a thread",
    "how an event loop schedules pending callbacks",
    "how memory fragmentation affects allocation",
    "how copy-on-write reduces memory copying",
    "how shared libraries are loaded into memory",
    "how dynamic linking resolves external symbols",
    "how a linker relocates executable addresses",
    "how a debugger uses breakpoints and stack traces",
    "how a profiler identifies CPU hotspots",
    "how a benchmark distinguishes throughput from latency",
    "how open-loop load testing differs from closed-loop testing",
    "how queueing delay grows near saturation",
    "how Little's Law relates concurrency and throughput",
    "how a reverse proxy forwards upstream requests",
    "how HTTP keep-alive reduces connection overhead",
    "how TLS session resumption reduces handshake cost",
    "how an application handles graceful shutdown",
    "how health checks distinguish readiness from liveness",
    "how secrets are injected into container workloads",
    "how environment variables configure an application",
    "how database migrations preserve existing records",
    "how schema validation rejects malformed requests",
    "how structured logs support incident investigation",
    "how distributed tracing propagates trace identifiers",
    "how request cancellation releases server resources",
    "how a semaphore limits access to a resource",
    "how a mutex protects shared mutable state",
    "how atomic compare-and-swap updates shared values",
    "how a distributed cache handles stale entries",
    "how cache stampedes overload an origin service",
    "how semantic search ranks vectors by similarity"
];

const promptTemplates = [
    (topic) =>
        `Explain ${topic}. Include the mechanism and one concrete example.`,
    (topic) =>
        `Analyze ${topic}, focusing on its trade-offs, failure modes, and practical use.`,
    (topic) =>
        `Teach a junior systems engineer about ${topic}. Explain the underlying sequence of events.`,
    (topic) =>
        `What design decisions matter for ${topic}? Discuss performance and reliability.`,
    (topic) =>
        `Describe a realistic debugging scenario involving ${topic} and explain how to investigate it.`
];

function buildMissPrompts() {
    const prompts = [];

    // Interleave templates so related variants of the same
    // topic are not adjacent in the workload.
    for (let templateIndex = 0; templateIndex < promptTemplates.length; templateIndex++) {
        for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
            const prompt = promptTemplates[templateIndex](topics[topicIndex]);

            prompts.push(
                `${prompt} Benchmark run ${runId}, case ${templateIndex}-${topicIndex}.`
            );
        }
    }

    // Rotate the ordering for this run.
    // Distinct topics help, but semantic misses must still
    // be verified from the actual server response.
    return prompts;
}

async function measureMisses() {
    const prompts = buildMissPrompts();

    let validMisses = 0;
    let attempts = 0;

    for (
        let i = 0;
        i < prompts.length &&
        i < MAX_MISS_ATTEMPTS &&
        validMisses < TARGET_PER_SCENARIO;
        i++
    ) {
        const row = await recordSample("miss", prompts[i]);
        attempts++;

        if (
            row.actualType === "generation_miss" &&
            row.httpStatus === 200 &&
            !row.error
        ) {
            validMisses++;
        }

        if (
            i < prompts.length - 1 &&
            validMisses < TARGET_PER_SCENARIO
        ) {
            await sleep(PAUSE_MS);
        }
    }

    console.log(
        `\nCollected ${validMisses}/${TARGET_PER_SCENARIO} ` +
        `valid generation misses in ${attempts} attempts.`
    );
}

// --------------------------------------------------
// 7. CSV EXPORT
// --------------------------------------------------

function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
}

async function exportCSV() {
    const columns = [
        "timestamp",
        "scenario",
        "actualType",
        "latencyMs",
        "httpStatus",
        "cached",
        "cacheType",
        "similarity",
        "error"
    ];

    const lines = [
        columns.join(","),
        ...results.map((row) =>
            columns.map((key) => csvEscape(row[key])).join(",")
        )
    ];

    await writeFile(
        "benchmark-results.csv",
        "\uFEFF" + lines.join("\n"),
        "utf8"
    );

    console.log(
        `\nSaved ${results.length} attempts to benchmark-results.csv`
    );
}

// --------------------------------------------------
// 8. MAIN
// --------------------------------------------------

async function main() {
    console.log("LLM Gateway benchmark");
    console.log(`Run ID: ${runId}`);
    console.log(`Target: ${TARGET_PER_SCENARIO} valid samples per scenario`);
    console.log("Requests are sequential, not concurrent.\n");

    // Exact cache
    const exactPrompt =
        `Explain photosynthesis in simple terms. Benchmark ${runId}.`;

    console.log("Preparing exact-cache entry...");
    const exactSeed = await sendRequest(exactPrompt);

    console.log(
        `Seed: HTTP ${exactSeed.status}, ` +
        `cached=${exactSeed.data.cached}, ` +
        `cacheType=${exactSeed.data.cacheType ?? "unknown"}`
    );

    if (exactSeed.error) {
        throw new Error(`Exact-cache seed failed: ${exactSeed.error}`);
    }

    await sleep(PAUSE_MS);

    await measureHits(
        "exact",
        Array(TARGET_PER_SCENARIO).fill(exactPrompt),
        "exact_hit"
    );

    // Semantic cache
    const semanticSeed =
        `Explain the stages of butterfly metamorphosis. Benchmark ${runId}.`;

    const semanticPrompt =
        `Describe how a butterfly changes from an egg into an adult. Benchmark ${runId}.`;

    console.log("\nPreparing semantic-cache entry...");
    const semanticSeedResult = await sendRequest(semanticSeed);

    console.log(
        `Seed: HTTP ${semanticSeedResult.status}, ` +
        `cached=${semanticSeedResult.data.cached}, ` +
        `cacheType=${semanticSeedResult.data.cacheType ?? "unknown"}`
    );

    if (semanticSeedResult.error) {
        throw new Error(
            `Semantic-cache seed failed: ${semanticSeedResult.error}`
        );
    }

    await sleep(PAUSE_MS);

    await measureHits(
        "semantic",
        Array(TARGET_PER_SCENARIO).fill(semanticPrompt),
        "semantic_hit"
    );

    // Genuine generation misses
    console.log("\nStarting generation-miss scenario...");
    await measureMisses();

    // Summary
    console.log("\n========== FINAL SUMMARY ==========");

    report("exact", "exact_hit");
    report("semantic", "semantic_hit");
    report("miss", "generation_miss");

    const errors = results.filter((row) => row.actualType === "error").length;
    const unknown = results.filter((row) => row.actualType === "unknown").length;

    console.log(`\nTotal attempts: ${results.length}`);
    console.log(`Errors: ${errors}`);
    console.log(`Unknown response types: ${unknown}`);

    await exportCSV();

    console.log(
        "\nNote: results describe this specific sequential workload. " +
        "They are not a production cache-hit rate or a concurrent-load benchmark."
    );
}

main().catch((error) => {
    console.error("\nBenchmark failed:", error.message);
    process.exitCode = 1;
});
