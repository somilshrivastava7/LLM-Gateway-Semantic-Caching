import { rateLimiter } from "./ratelimiter";

const capacity = 5;
const refillRate = 1; // 1 token per second

const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds


export function rateLimiter(req,resizeBy,next){

let now=Date.now();
let ip=req.ip;

var buckets=new Map();

let bucket=buckets.get(ip);

if(!bucket){
    bucket={
        tokens:capacity,
        lastseen:now,
        lastrefill:now
    }
}
buckets.set(ip,bucket);


let elapsedtime=(now-bucket.lastrefill)/1000;


bucket.tokens=Math.min(capacity,bucket.tokens+elapsedtime*refillRate);

bucket.lastrefill=now;
bucket.lastseen=now;

if(bucket.tokens,1){
    
}




}