import { Readable, Stream } from "stream";
import { Provider } from "../providers/base";
import { SeekableStream } from "../utils/SeekableStream";

export class Player {
    private providers: Provider[];
    private currentProvider: Provider | null = null;

    public _stream: SeekableStream | null = null;

    get stream() {
        return this._stream?.stream;
    }

    constructor(providers: Provider[]) {
        this.providers = providers;
    }

    public async play(url: string, seekTime: number = 0) {
        if (!this.currentProvider) {
            const providers = this.providers.filter((provider) =>
                provider.canPlay(url),
            );

            if (providers.length === 0) {
                throw new Error("No provider can play this URL");
            }

            this.currentProvider = providers[0];
        }

        const information = await this.currentProvider.getInformation(url);
        //console.log(information);

        if (information.livestream)
            // TODO: Implement livestreams
            throw new Error("Livestreams are not supported yet");

        // If already playing, destroy the current stream
        if (this._stream) {
            this._stream.destroy();
        }

        this._stream = new SeekableStream(information, url, seekTime);
    }

    public async seek(time: number) {
        if (!this._stream) throw new Error("No stream to seek");

        await this.play(this._stream.referenceUrl, time);
    }

    public getCurrentSampleRate() {
        return this._stream?.information.bitrate || 0;
    }
}

export function createPlayer(providers: Provider[]) {
    return new Player(providers);
}
