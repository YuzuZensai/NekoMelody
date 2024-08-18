import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import playwright, { Browser } from "playwright";

let lastUpdate: Date | null = null;
let globalHeaders: Record<string, string> = {};
let globalCookies: string = "";

export async function makeStreamRequest(
    url: string,
    options: AxiosRequestConfig = {},
    body?: any,
): Promise<AxiosResponse> {
    const { headers = {}, method = "GET" } = options;
    let config: AxiosRequestConfig = {
        url,
        method,
        headers: {
            ...globalHeaders,
            ...headers,
            Cookie: globalCookies,
        },
        data: body,
        responseType: "stream",
    };

    // Override / Add config
    config = Object.assign(config, options);

    try {
        const response = await axios(config);
        return response;
    } catch (err) {
        throw err;
    }
}

export async function getStream(
    url: string,
    options: AxiosRequestConfig = { method: "GET" },
): Promise<AxiosResponse<any, any>> {
    try {
        let response = await makeStreamRequest(url, options);
        const visitedUrls = new Set<string>();

        // Handle redirection and detect redirection loop
        while (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.location
        ) {
            const redirectUrl = response.headers.location;
            if (visitedUrls.has(redirectUrl)) {
                throw new Error("Redirection loop detected");
            }
            visitedUrls.add(redirectUrl);
            response = await makeStreamRequest(redirectUrl, options);
        }

        return response;
    } catch (error) {
        throw error;
    }
}

export async function getYouTubeFormats(id: string) {
    let body;
    if (
        !globalCookies ||
        !globalHeaders ||
        !lastUpdate ||
        lastUpdate < new Date(Date.now() - 30 * 60 * 1000)
    ) {
        console.debug("Using playwright");
        const browser = await playwright["chromium"].launch({
            headless: true,
            args: [
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-setuid-sandbox",
                "--no-first-run",
                "--no-sandbox",
                "--no-zygote",
                "--deterministic-fetch",
                "--disable-features=IsolateOrigins",
                "--disable-site-isolation-trials",
                "--single-process",
            ],
        });

        const page = await browser.newPage();

        page.once("request", (request) => {
            globalHeaders = request.headers();
        });

        await page.goto(
            `https://www.youtube.com/watch?v=${id}&has_verified=1`,
            {
                waitUntil: "domcontentloaded",
            },
        );
        body = await page.evaluate(() => document.body.innerHTML);

        const cookies = await page.context().cookies();

        globalCookies = cookies
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; ");

        await page.close();
        await browser.close();

        lastUpdate = new Date();
    } else {
        console.debug("Using axios");
        const response = await axios.get(
            `https://www.youtube.com/watch?v=${id}&has_verified=1`,
            {
                headers: {
                    ...globalHeaders,
                    Cookie: globalCookies,
                },
            },
        );

        body = response.data;
    }

    const match = body.match(
        /var ytInitialPlayerResponse = (.*?)(?=;\s*<\/script>)/,
    );
    const data = match ? match[1] : null;
    if (!data) throw new Error("Failed to get YouTube formats");

    try {
        let formats = JSON.parse(data).streamingData.adaptiveFormats;
        if (!formats) throw new Error("Failed to parse YouTube formats");

        // Filters only audio formats that are webm
        formats = formats.filter((format: any) =>
            format.mimeType.startsWith("audio/webm;"),
        );

        // Sort the quality of the formats
        formats = formats.sort((a: any, b: any) => {
            const aQuality = a.audioQuality === "AUDIO_QUALITY_MEDIUM" ? 0 : 1;
            const bQuality = b.audioQuality === "AUDIO_QUALITY_MEDIUM" ? 0 : 1;
            return aQuality - bQuality;
        });

        return formats;
    } catch (err) {
        console.error(err);
        throw new Error("Failed to parse YouTube formats");
    }
}
