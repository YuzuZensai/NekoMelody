import NekoMelody from "../src";

import Speaker from "speaker";
import ffmpeg from "fluent-ffmpeg";

const main = async () => {
    // Create the Speaker instance
    const speaker = new Speaker();

    const videoId = "9PuudPiyma4";

    // Get the stream from the URL
    const stream = await NekoMelody.stream(
        `https://www.youtube.com/watch?v=${videoId}`,
    );

    // PCM data from stdin gets piped into the speaker
    let audioStream = stream;
    const ffmpegProcess = ffmpeg()
        .input(audioStream)
        .format("s16le") // Output format (PCM 16-bit little-endian)
        //.audioChannels(2) // Number of audio channels
        //.audioFrequency(44100) // Sample rate
        .on("error", (err) => {
            console.error("An error occurred:", err.message);
        })
        .pipe(speaker, { end: true });
};

main();
