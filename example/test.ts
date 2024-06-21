import NekoMelody, { Player } from "../src";

import Speaker from "speaker";
import ffmpeg from "fluent-ffmpeg";
import { YtDlpProvider } from "../src/providers";

const main = async () => {
    const videoId = "2gigEGxnsmo";

    // Providers
    const providers = [new YtDlpProvider()];
    const player = NekoMelody.createPlayer(providers);

    await player.play(`https://www.youtube.com/watch?v=${videoId}`);
    playSpeaker(player);

    // setTimeout(async () => {
    //     await player.seek(100);
    //     playSpeaker(player);
    // }, 5000);
};

// TODO: player end event to automate changing the stream
let lastFFmpeg: ffmpeg.FfmpegCommand | null = null;
let lastSpeaker: Speaker | null = null;
const playSpeaker = async (player: Player) => {
    if (!player.stream) {
        console.error("No input stream");
        return;
    }

    // A function that resolves when the speaker is closed and the ffmpeg process is killed
    const closeSpeaker = () => {
        return new Promise<void>((resolve) => {
            if (lastSpeaker) {
                lastSpeaker.on("close", () => {
                    resolve();
                });
                if (lastFFmpeg) lastFFmpeg.kill("SIGKILL");
                lastSpeaker.close(true);
            } else {
                resolve();
            }
        });
    };

    await closeSpeaker();

    // Create the Speaker instance
    const speaker = new Speaker();
    lastSpeaker = speaker;

    // PCM data from stdin gets piped into the speaker
    const ffmpegProcess = ffmpeg()
        .input(player.stream)
        .format("s16le") // Output format (PCM 16-bit little-endian)
        .audioChannels(2)
        .audioFrequency(44100)
        .on("error", (err) => {
            console.error("An error occurred:", err.message);
        });

    // Pipe the ffmpeg output to the speaker
    ffmpegProcess.pipe(speaker, { end: true });

    lastFFmpeg = ffmpegProcess;
};

main();
