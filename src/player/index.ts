import { Readable, Stream } from "stream";
import { AudioInformation, Provider } from "../providers/base";
import { SeekableStream } from "../utils/SeekableStream";
import EventEmitter from "events";

export class Player {
    private providers: Provider[];
    private currentProvider: Provider | null = null;
    private queue: AudioInformation[] = [];
    private playerEvent: EventEmitter = new EventEmitter();
    private paused: boolean = false;
    private currentAudioInformation: AudioInformation | null = null;

    public _stream: SeekableStream | null = null;

    constructor(providers: Provider[]) {
        this.providers = providers;
    }

    public get stream() {
        return this._stream?.stream;
    }

    private _createStream(
        information: AudioInformation,
        url: string,
        seekTime: number,
    ) {
        // If already playing, destroy the current stream
        if (this._stream) {
            this._stream.destroy();
        }

        this._stream = new SeekableStream(information, url, seekTime);
        this.currentAudioInformation = information;
        this._stream.on("destroy", () => {
            console.log("Stream destroyed, total song", this.queue.length);
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                console.log("Playing next in queue");
                if (next) {
                    this._createStream(next, next.url, 0);
                }
            } else {
                this._stream = null;
                this.currentAudioInformation = null;
            }
        });

        this.playerEvent.emit("play", information);
    }

    public startCurrentStream() {
        if (this._stream) {
            this._stream.start();
        }
    }

    public endCurrentStream() {
        if (this._stream) {
            this._stream.destroy();
        }
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.playerEvent.on(event, listener);
    }

    public async getInformation(url: string) {
        if (!this.currentProvider) {
            const providers = this.providers.filter((provider) =>
                provider.canPlay(url),
            );

            if (providers.length === 0) {
                throw new Error("No provider can play this URL");
            }

            this.currentProvider = providers[0];
        }

        return await this.currentProvider.getInformation(url);
    }

    public async play(url: string, seekTime: number = 0) {
        const information = await this.getInformation(url);
        //console.log(information);

        if (information.livestream)
            // TODO: Implement livestreams
            throw new Error("Livestreams are not supported yet");

        this._createStream(information, url, seekTime);
    }

    public async enqueue(url: string, seekTime: number = 0) {
        const information = await this.getInformation(url);

        if (information.livestream)
            // TODO: Implement livestreams
            throw new Error("Livestreams are not supported yet");

        this.playerEvent.emit("enqueue", information);

        // If queue is empty, no stream is playing and not paused, play the current URL
        if (
            this.queue.length === 0 &&
            !this.currentAudioInformation &&
            !this._stream &&
            !this.paused
        ) {
            this._createStream(information, url, seekTime);
        } else {
            this.queue.push(information);
        }

        return information;
    }

    public async seek(time: number) {
        if (!this._stream) throw new Error("No stream to seek");

        await this.play(this._stream.referenceUrl, time);
    }

    public getCurrentSampleRate() {
        return this._stream?.information.bitrate || 0;
    }

    public getCurrentAudioInformation() {
        return this.currentAudioInformation;
    }

    public getQueue() {
        return this.queue;
    }

    public clearQueue() {
        this.queue = [];
    }
}

export function createPlayer(providers: Provider[]) {
    return new Player(providers);
}
