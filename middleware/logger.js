export function logger(req, res, next) {
    const start = Date.now();

    res.on("finish", () => {
        let latency = Date.now() - start;

        console.log(
            `=====${req.method} ${req.originalUrl} ${res.statusCode} - ${latency}ms=======`
        );
    });

    next();
}


//Instead of logging immediately, it attaches an event listener to the response object. The "finish" event only triggers after your route handler has completely finished its job and sent the final response back to the client