
import { readFile, writeFile } from "node:fs/promises";

const csv = await readFile("benchmark-results.csv", "utf8");

// Parse the CSV's quoted fields, including escaped quotes.
function parseCSV(text) {
    const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    const parseLine = (line) => {
        const fields = [];
        let field = "";
        let quoted = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (ch === '"' && quoted && line[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                quoted = !quoted;
            } else if (ch === "," && !quoted) {
                fields.push(field);
                field = "";
            } else {
                field += ch;
            }
        }

        fields.push(field);
        return fields;
    };

    const headers = parseLine(lines[0]);
    return lines.slice(1).filter(Boolean).map(line => {
        const values = parseLine(line);
        return Object.fromEntries(
            headers.map((header, i) => [header, values[i] ?? ""])
        );
    });
}

const rows = parseCSV(csv).map(row => ({
    ...row,
    latencyMs: Number(row.latencyMs),
    httpStatus: Number(row.httpStatus)
}));

const scenarios = {
    exact: "exact_hit",
    semantic: "semantic_hit",
    miss: "generation_miss"
};

function percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(p / 100 * sorted.length) - 1];
}

const report = {};

for (const [scenario, expectedType] of Object.entries(scenarios)) {
    const valid = rows.filter(row =>
        row.scenario === scenario &&
        row.actualType === expectedType &&
        row.httpStatus === 200 &&
        !row.error
    );

    const values = valid.map(row => row.latencyMs);

    if (values.length === 0) {
        report[scenario] = { validSamples: 0 };
        continue;
    }

    report[scenario] = {
        validSamples: values.length,
        averageMs: Number(
            (values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(2)
        ),
        p50Ms: percentile(values, 50),
        p95Ms: percentile(values, 95),
        p99Ms: percentile(values, 99)
    };
}

const intendedMisses = rows.filter(row => row.scenario === "miss");
const unexpectedHits = intendedMisses.filter(row =>
    row.actualType === "semantic_hit" || row.actualType === "exact_hit"
);

report.benchmarkQuality = {
    totalRecordedRows: rows.length,
    intendedMissAttempts: intendedMisses.length,
    validGenerationMisses: report.miss.validSamples,
    unexpectedCacheHits: unexpectedHits.length,
    unexpectedHitRatePercent: intendedMisses.length
        ? Number((unexpectedHits.length / intendedMisses.length * 100).toFixed(2))
        : 0
};

const missAverage = report.miss.averageMs;
for (const scenario of ["exact", "semantic"]) {
    const cacheAverage = report[scenario].averageMs;
    report[scenario].latencyReductionVsMissPercent =
        missAverage && cacheAverage !== undefined
            ? Number(((missAverage - cacheAverage) / missAverage * 100).toFixed(2))
            : null;
}

console.log(JSON.stringify(report, null, 2));
await writeFile("benchmark-report.json", JSON.stringify(report, null, 2));
console.log("\nSaved report to benchmark-report.json");
