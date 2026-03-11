import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error(
        "Falta OPENAI_API_KEY en .env.local. Reiniciá el servidor después de agregarla."
    );
}

export const openai = new OpenAI({
    apiKey,
});