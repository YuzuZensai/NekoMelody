import { Readable } from "stream";
import { AudioInformation } from "../providers/base";
import { Timer } from "./Timer";
import { WebmSeeker } from "./WebmSeeker";
import { getStream } from "./Request";

const DEBUG_SIMULATE_FAILURE = false;

export class SeekableStream {
    private id: string;
    public information: AudioInformation;
    private referenceUrl: string;

    public stream: WebmSeeker;

    private timer: Timer;
    private ticking: boolean = false;
    private locked: boolean = false;
    private destroyed: boolean = false;

    private bytesReceived: number = 0;
    private bytesRead: number = 0;
    private bytesPerRequestLimit = 1 * 1024 * 1024; // 1 MB per request

    constructor(information: AudioInformation, referenceUrl: string) {
        this.id = Math.random().toString(36).substring(8);
        this.information = information;
        this.referenceUrl = referenceUrl;

        this.stream = new WebmSeeker(0, {
            highWaterMark: 5 * 1024 * 1024,
        });

        this.stream.on("data", (chunk: any) => {
            this.bytesRead += chunk.length;
        });

        this.timer = new Timer(() => {
            if (this.ticking) return;
            this.ticking = true;
            this.timer.reset();
            this.tick();
            this.ticking = false;
        }, 2000);

        this.timer.start();
        this.tick();
    }

    private async tick() {
        console.log(`[${this.id}] > Ticking...`);

        if (this.destroyed) {
            console.debug(
                `[${this.id}] > Stream already destroyed, not ticking`,
            );
            this.destroy();
            return;
        }

        this.debugLog();

        const isBufferSufficient =
            this.stream.readableLength >= this.bytesPerRequestLimit;

        if (!this.locked) {
            if (
                !isBufferSufficient &&
                this.bytesReceived < this.information.fileSize
            ) {
                this.locked = true;

                const end = Math.min(
                    this.bytesReceived + this.bytesPerRequestLimit,
                    this.information.fileSize,
                );
                const rangeHeader = `bytes=${this.bytesReceived}-${end}`;
                const request = await getStream(this.information.url, {
                    headers: {
                        range: rangeHeader,
                    },
                }).catch((err: Error) => err);

                console.debug(
                    `[${this.id}] > Requesting range | ${rangeHeader}`,
                );

                if (request instanceof Error) {
                    console.debug(
                        `[${this.id}] > Request error: ${request.message}`,
                    );
                    await this.refreshInformation();
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
                    console.debug(
                        `[${this.id}] > Request failed with status ${request.status}`,
                    );
                    await this.refreshInformation();
                    this.locked = false;
                    this.timer.reset();
                    this.tick();
                    return;
                }

                if (!request.data) {
                    this.locked = false;
                    return;
                }

                console.debug(`[${this.id}] > Request successful`);

                const incomingStream = request.data;

                incomingStream.on("data", (chunk: any) => {
                    this.stream.push(chunk);
                    this.bytesReceived += chunk.length;
                });

                incomingStream.once("error", async () => {
                    console.debug(`[${this.id}] > Pipe error, refreshing...`);
                    this.destroy();
                    await this.refreshInformation();
                    this.timer.reset();
                    this.tick();
                });

                incomingStream.on("end", async () => {
                    console.debug(
                        `[${this.id}] > Full chunk received, unlocking`,
                    );
                    this.locked = false;
                    incomingStream.destroy();
                    this.debugLog();
                });
            }
        }

        if (
            this.bytesReceived >= this.information.fileSize &&
            this.stream.readableLength === 0
        ) {
            console.debug(`[${this.id}] > Stream completed`);
            this.destroy();
            return;
        }

        console.debug(`[${this.id}] > Tick completed`);
    }

    private getCurrentTimestamp() {
        // TODO: Calculate more accurately
        const realBitrate =
            this.information.fileSize / this.information.duration;
        const currentTime = this.bytesRead / realBitrate;
        return currentTime;
    }

    private async refreshInformation() {
        console.debug(`[${this.id}] > Refreshing stream info...`);
        let information = await this.information.refreshInfoFunction();
        this.information = information;
        console.debug(`[${this.id}] > Stream info refreshed`);
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.stream.on(event, listener);
    }

    private destroy() {
        console.debug(`[${this.id}] > Stream destroyed`);
        if (!this.timer.isDestroyed()) this.timer.destroy();
        if (this.stream) this.stream.destroy();
        this.destroyed = true;
    }

    private debugLog() {
        //        console.debug("Tick");
        const isBufferSufficient =
            this.stream.readableLength >= this.bytesPerRequestLimit;
        console.debug(
            `[${this.id}] > ` +
                `Timestamp: ${this.getCurrentTimestamp().toFixed(1)}s / ${this.information.duration.toFixed(1)}s | ` +
                `Data Received: ${(this.bytesReceived / (1024 * 1024)).toFixed(3)} MB / ${(this.information.fileSize / (1024 * 1024)).toFixed(3)} MB | ` +
                `Data Read: ${(this.bytesRead / (1024 * 1024)).toFixed(3)} MB | ` +
                `Buffer Remaining: ${(this.stream.readableLength / (1024 * 1024)).toFixed(3)} MB | ` +
                `${!false ? `Buffer Sufficient: ${isBufferSufficient} | ` : ``}` +
                `Locked: ${this.locked} | `, // +
            //`Fetch Completed: ${this.fetchCompleted}`,
        );
    }
}
