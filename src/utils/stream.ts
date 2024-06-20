import { Readable } from "stream";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { Timer } from "./timer";

const DEBUG_SIMULATE_FAILURE = false;

async function makeStreamRequest(
    url: string,
    options: AxiosRequestConfig = {},
    body?: any,
): Promise<AxiosResponse> {
    const { headers = {}, method = "GET" } = options;

    let config: AxiosRequestConfig = {
        url,
        method,
        headers,
        data: body,
        responseType: "stream",
    };

    // Override / Add config
    config = Object.assign(config, options);

    try {
        const response = await axios(config);
        return response;
    } catch (err) {
        throw err;
    }
}

export async function fetchStream(
    url: string,
    options: AxiosRequestConfig = { method: "GET" },
): Promise<AxiosResponse<any, any>> {
    try {
        let response = await makeStreamRequest(url, options);
        const visitedUrls = new Set<string>();

        // Handle redirection and detect redirection loop
        while (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.location
        ) {
            const redirectUrl = response.headers.location;
            if (visitedUrls.has(redirectUrl)) {
                throw new Error("Redirection loop detected");
            }
            visitedUrls.add(redirectUrl);
            response = await makeStreamRequest(redirectUrl, options);
        }

        return response;
    } catch (error) {
        throw error;
    }
}

export class Stream {
    private id: string;
    private url: string;
    private referenceUrl: string;
    private duration: number;

    private timer: Timer;
    private locked: boolean = false;
    private destroyed: boolean = false;
    private fetchCompleted: boolean = false;

    public stream: Readable;
    private bytesReceived: number = 0;

    private contentLength: number;

    private inputReadable: Readable | null = null;

    private bytesPerRequestLimit = 1 * 1024 * 1024; // 1 MB per request

    private refreshStreamUrlFunction: () => Promise<string>;

    constructor(
        streamUrl: string,
        referenceUrl: string,
        contentLength: number,
        duration: number,
        refreshStreamUrlFunction: () => Promise<string>,
    ) {
        this.id = Math.random().toString(36).substring(7);
        this.url = streamUrl;
        this.referenceUrl = referenceUrl;
        this.duration = duration;
        this.stream = new Readable({
            highWaterMark: 5 * 1024 * 1024,
            read() {},
        });
        this.contentLength = contentLength;
        this.refreshStreamUrlFunction = refreshStreamUrlFunction;

        this.timer = new Timer(() => {
            this.timer.reset();
            this.tick();
        }, 2000);

        this.stream.on("close", () => {
            console.debug(
                `[${this.id}] > Destination stream closed, destroying...`,
            );
            this.timer.destroy();
            this.destroy();
        });

        this.timer.start();
        this.tick();
    }

    private debugLog() {
        const isBufferSufficient =
            this.stream.readableLength >= this.bytesPerRequestLimit;

        console.debug(
            `[${this.id}] > ` +
                `Data Received: ${(this.bytesReceived / (1024 * 1024)).toFixed(3)} MB / ${(this.contentLength / (1024 * 1024)).toFixed(3)} MB | ` +
                `Buffer Remaining: ${(this.stream.readableLength / (1024 * 1024)).toFixed(3)} MB | ` +
                `${!this.fetchCompleted ? `Buffer Sufficient: ${isBufferSufficient} | ` : ``}` +
                `Locked: ${this.locked} | ` +
                `Fetch Completed: ${this.fetchCompleted}`,
        );
    }

    private async tick() {
        if (this.destroyed) {
            console.debug(`[${this.id}] > Stream destroyed, not ticking`);
            this.timer.destroy();
            return;
        }

        if (this.stream.destroyed) {
            console.debug(
                `[${this.id}] > Destination stream destroyed, destroying...`,
            );
            this.timer.destroy();
            this.destroy();
            return;
        }

        const remainingBufferBytes = this.stream.readableLength;
        const isBufferSufficient =
            remainingBufferBytes >= this.bytesPerRequestLimit;

        this.debugLog();

        if (!this.locked && !this.fetchCompleted) {
            // Check if the remaining buffer size is less than a threshold before fetching the next chunk
            if (!isBufferSufficient) {
                this.locked = true;
                const end = Math.min(
                    this.bytesReceived + this.bytesPerRequestLimit,
                    this.contentLength,
                );

                const rangeHeader = `bytes=${this.bytesReceived}-${end}`;

                const request = await fetchStream(this.url, {
                    headers: {
                        range: rangeHeader,
                    },
                }).catch((err: Error) => err);

                console.log(`[${this.id}] > Requesting range | ${rangeHeader}`);

                if (request instanceof Error) {
                    console.debug(
                        `[${this.id}] > Request error: ${request.message}`,
                    );

                    await this.refreshStreamUrl();
                    this.locked = false;
                    this.timer.reset();
                    this.tick();
                    return;
                }

                // Simulate failed request 25% of the time
                if (DEBUG_SIMULATE_FAILURE && Math.random() < 0.25) {
                    console.debug(`[${this.id}] > Simulating request failure`);
                    request.status = 416;
                }

                if (request.status >= 400) {
                    await this.refreshStreamUrl();
                    this.locked = false;
                    this.timer.reset();
                    this.tick();
                    return;
                }

                this.inputReadable = request.data;

                if (this.inputReadable === null) {
                    this.locked = false;
                    return;
                }

                console.debug(`[${this.id}] > Request successful`);

                request.data.on("data", (data: any) => {
                    this.stream.push(data);
                    this.bytesReceived += data.length;
                });

                request.data.on("end", (data: any) => {
                    const check = () => {
                        // If still locked, delay the check
                        if (this.locked) {
                            console.debug(
                                `[${this.id}] > Still locked, delaying end check...`,
                            );
                            setTimeout(check, 1000);
                            return;
                        }

                        if (end >= this.contentLength - 1) {
                            console.debug(
                                `[${this.id}] > Fetching completed, permanently locking...`,
                            );
                            this.locked = true;

                            //this.timer.destroy();
                            this.stream.push(null);
                            this.debugLog();
                            this.fetchCompleted = true;
                            //this.destroy();
                        }
                    };
                    check();
                });

                request.data.once("error", async () => {
                    this.destroy();
                    await this.refreshStreamUrl();
                    this.timer.reset();
                    this.tick();
                });

                this.locked = false;
            }
        }

        // If data fetch is completed, check if the buffer is empty, if so, destroy the stream
        if (this.fetchCompleted && remainingBufferBytes === 0) {
            console.debug(`[${this.id}] > Buffer empty, destroying...`);
            this.stream.emit("finished");
            this.destroy();
            return;
        }

        return;
    }

    pause() {
        this.timer.pause();
    }

    resume() {
        this.timer.resume();
    }

    private async refreshStreamUrl() {
        console.debug(`[${this.id}] > Refreshing stream URL...`);
        let url = await this.refreshStreamUrlFunction();
        this.url = url;
        console.debug(`[${this.id}] > Stream URL refreshed | ${url}`);
    }

    private destroy() {
        this.debugLog();
        console.debug(`[${this.id}] > Stream destroyed`);
        if (this.inputReadable) this.inputReadable.destroy();
        this.destroyed = true;
    }
}
