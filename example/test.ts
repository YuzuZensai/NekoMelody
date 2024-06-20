import NekoMelody from "../src";

import Speaker from "speaker";
import ffmpeg from "fluent-ffmpeg";
import { YtDlpProvider } from "../src/providers";

const main = async () => {
    // Create the Speaker instance
    const speaker = new Speaker();

    const videoId = "9PuudPiyma4";

    // Providers
    const providers = [new YtDlpProvider()];
    const player = NekoMelody.createPlayer(providers);

    await player.play(`https://www.youtube.com/watch?v=${videoId}`);

    if (!player.stream) {
        console.error("No input stream");
        return;
    }

    // PCM data from stdin gets piped into the speaker
    const ffmpegProcess = ffmpeg()
        .input(player.stream)
        .format("s16le") // Output format (PCM 16-bit little-endian)
        .audioChannels(2)
        .audioFrequency(44100)
        .on("error", (err) => {
            console.error("An error occurred:", err.message);
        })
        .pipe(speaker, { end: true });
};

main();
