import { Readable } from "stream";
import playdl from "play-dl/play-dl";

export const stream = async (url: string): Promise<Readable> => {
    let playdlStream = await playdl.stream(url);
    return playdlStream.stream;
};
