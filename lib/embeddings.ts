import OpenAI from "openai";
import { getOpenAI } from "./openai";

export async function createEmbedding(text: string): Promise<number[]> {
    const cleaned = text.trim();

    if (!cleaned) {
        throw new Error("No se puede crear un embedding de un texto vacío.");
    }

    try {
        const openai = getOpenAI();

        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: cleaned,
        });

        return response.data[0].embedding;
    } catch (error) {
        console.error("Error creando embedding:", error);

        if (error instanceof OpenAI.AuthenticationError) {
            throw new Error(
                "La clave de OpenAI fue rechazada por la API. Verificá que la app esté usando la misma key que probaste en PowerShell."
            );
        }

        if (error instanceof OpenAI.RateLimitError) {
            throw new Error(
                "OpenAI rechazó la solicitud por límite de uso. Probá nuevamente en unos segundos."
            );
        }

        if (error instanceof OpenAI.APIError) {
            throw new Error(`Error de OpenAI: ${error.message}`);
        }

        throw new Error("No se pudo crear el embedding del texto.");
    }
}