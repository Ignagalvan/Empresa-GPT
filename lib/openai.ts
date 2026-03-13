import OpenAI from "openai";

function sanitizeApiKey(value: string): string {
    return value
        .replace(/^\uFEFF/, "")
        .replace(/\r/g, "")
        .replace(/\n/g, "")
        .trim();
}

export function getOpenAI(): OpenAI {
    const rawApiKey = process.env.OPENAI_API_KEY;

    if (!rawApiKey) {
        throw new Error(
            "Falta OPENAI_API_KEY. Revisá .env.local o variables de entorno del sistema."
        );
    }

    const apiKey = sanitizeApiKey(rawApiKey);

    const prefix = apiKey.slice(0, 12);
    const suffix = apiKey.slice(-8);
    const length = apiKey.length;

    console.log(`OPENAI_API_KEY app => ${prefix}...${suffix} (len=${length})`);

    return new OpenAI({
        apiKey,
    });
}