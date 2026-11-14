



// *    req — Request
// *    Client ne kya bheja, uski information. Jaise URL, HTTP method aur request body.



//*  res — Response
// *    Client ko response bhejne ke liye use hota hai.



// *    next — Continue
// *    Request ko agle middleware ya route tak bhejta hai.

// ! this code is a middleware function. It only executes when a request physically hits your server. There is no hidden timer or background loop running every second.



const capacity = 5;
const refillRate = 1; // 1 token per second

const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds

const buckets = new Map();

export function rateLimiter(req, res, next) {
    const now = Date.now();
    const ip = req.ip;

    // 1. Find this IP's bucket
    let bucket = buckets.get(ip);

    // 2. Create a bucket if this IP is new
    if (!bucket) {
        bucket = {
            tokens: capacity,
            lastRefill: now,
            lastSeen: now
        };

        buckets.set(ip, bucket);
    }

    // console.log(buckets)

    // 3. Calculate time elapsed since the last refill
    const elapsedSeconds =
        (now - bucket.lastRefill) / 1000;

    // 4. Refill tokens, without exceeding capacity
    bucket.tokens = Math.min(
        capacity,
        bucket.tokens + Math.floor(elapsedSeconds * refillRate)
    );

    // 5. Update timestamps
    bucket.lastRefill = now;
    bucket.lastSeen = now;

    // 6. Reject if fewer than one token is available
    if (bucket.tokens < 1) {
        return res.status(429).json({
            error: "Too many requests. Please try again later."
        });
    }

    // 7. Consume one token for this request
    bucket.tokens -= 1;

    console.log(
        `====IP: ${ip} | Tokens left: ${bucket.tokens.toFixed(2)}====`
    );

    // 8. Continue to the next middleware or route
    next();
}

// 9. Periodically remove inactive buckets
const cleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [ip, bucket] of buckets) {
        if (now - bucket.lastSeen >= INACTIVE_TIMEOUT) {
            buckets.delete(ip);
            console.log(`Removed inactive bucket: ${ip}`);
        }
    }
}, CLEANUP_INTERVAL);

// Optional: allow Node to exit if this timer is the only
// thing keeping the process alive.
cleanupTimer.unref();
