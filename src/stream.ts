import { Readable } from "stream";
import playdl from "play-dl/play-dl";
import YTDlpWrap from "yt-dlp-wrap";
import { Stream } from "./utils/stream";

const ytDlpWrap = new YTDlpWrap();
export const stream = async (url: string): Promise<Readable> => {
    const playdlData = await playdl.stream(url);
    const playdlStream = playdlData.stream;

    const getInfo = async () => {
        return JSON.parse(
            await ytDlpWrap.execPromise([
                url,
                "-f",
                "140",
                "--extractor-args",
                "youtube:player_client=ios",
                "--dump-json",
            ]),
        );
    };

    const ytDlpWrapInfo = await getInfo();
    const refreshStreamUrlFunction = async () => {
        const info = await getInfo();
        return info.url;
    };

    const ytDlpWrapStream = new Stream(
        ytDlpWrapInfo.url,
        url,
        //playdlData.type,
        ytDlpWrapInfo.filesize,
        ytDlpWrapInfo.duration,
        refreshStreamUrlFunction,
    );

    const stream = ytDlpWrapStream.stream;

    // stream.on("error", (err) => {
    //     console.error("An error occurred:", err.message);
    // });

    // stream.on("end", () => {
    //     console.log("Stream ended.");
    // });

    // stream.on("close", () => {
    //     console.log("Stream closed.");
    // });

    stream.on("finished", () => {
        console.log("Stream finished.");
    });

    return stream;
};
