import YTDlpWrap from "yt-dlp-wrap";
import { AudioInformation, Provider } from "./base";
import { getYouTubeFormats } from "../utils/Request";

export class YtDlpProvider extends Provider {
    public ytDlpWrap = new YTDlpWrap();

    public canPlay(url: string) {
        // TODO: Implement this
        return true;
    }

    public async getInformation(url: string) {
        const getYtDlpWrapInfo = async () => {
            return JSON.parse(
                await this.ytDlpWrap.execPromise([
                    url,
                    "-f",
                    "bestaudio[ext=webm]",
                    //"--extractor-args",
                    //"youtube:player_client=ios",
                    "--dump-json",
                ]),
            );
        };

        const refreshInfoFunction = async () => {
            const ytDlpWrapInfo = await getYtDlpWrapInfo();

            const formats = await getYouTubeFormats(ytDlpWrapInfo.id);
            if (!formats) {
                throw new Error("Failed to parse YouTube formats");
            }

            return {
                url: ytDlpWrapInfo.url,
                fileSize: ytDlpWrapInfo.filesize,
                duration: ytDlpWrapInfo.duration,
                indexRange: formats[0].indexRange,
                // TODO: Check if this is correct
                bitrate: ytDlpWrapInfo.asr, //bitrate: Math.ceil((ytDlpWrapInfo.tbr || 128) * 1000),
                livestream: ytDlpWrapInfo.is_live,
                refreshInfoFunction,
            } as AudioInformation;
        };

        return await refreshInfoFunction();
    }
}
