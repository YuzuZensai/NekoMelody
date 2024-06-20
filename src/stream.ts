import { Readable } from "stream";
import playdl from "play-dl/play-dl";
import YTDlpWrap from "yt-dlp-wrap";
import { Stream } from "./utils/stream";

const ytDlpWrap = new YTDlpWrap();

export const stream = async (url: string): Promise<Readable> => {
    const getPlayDlInfo = async () => {
        const info = await playdl.video_basic_info(url);
        if (!info.format) {
            throw new Error("No stream URL found");
        }

        for (const format of info.format) {
            if (format.itag === 140) {
                console.log("format", format);
                if (
                    !format.url ||
                    !format.contentLength ||
                    !format.approxDurationMs
                ) {
                    continue;
                }

                type DefinedFormat = typeof format & {
                    url: string;
                    contentLength: number;
                    approxDurationMs: number;
                };

                const newFormat: DefinedFormat = format as DefinedFormat;
                return newFormat;
            }
        }

        throw new Error("No stream URL found");
    };

    const getYtDlpWrapInfo = async () => {
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

    const ytDlpWrapInfo = await getYtDlpWrapInfo();
    const playDlInfo = await getPlayDlInfo();
    console.log("dlp", ytDlpWrapInfo.url);
    console.log("play-dl", playDlInfo);

    const ytDlpRefreshStreamUrlFunction = async () => {
        const info = await getYtDlpWrapInfo();
        return info.url;
    };

    const playDlRefreshStreamUrlFunction = async () => {
        const info = await getPlayDlInfo();
        if (!info.url) throw new Error("No stream URL found");

        return info.url;
    };

    const ytDlpWrapStream = new Stream(
        ytDlpWrapInfo.url,
        url,
        ytDlpWrapInfo.filesize,
        ytDlpWrapInfo.duration,
        ytDlpRefreshStreamUrlFunction,
    );

    const playDlStream = new Stream(
        playDlInfo.url,
        url,
        playDlInfo.contentLength,
        Math.ceil(playDlInfo.approxDurationMs / 1000),
        playDlRefreshStreamUrlFunction,
    );

    const stream = playDlStream.stream;

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
