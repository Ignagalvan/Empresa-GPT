import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createEmbedding } from "@/lib/embeddings";
import { cosineSimilarity } from "@/lib/cosineSimilarity";
import { openai } from "@/lib/openai";

type ChunkRow = {
    id: string;
    content: string;
    embedding: number[];
    document_id: string;
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { companyId, question } = body;

        if (!companyId || !question) {
            return NextResponse.json(
                { error: "Faltan datos obligatorios" },
                { status: 400 }
            );
        }

        const questionEmbedding = await createEmbedding(question);

        const { data, error } = await supabaseAdmin
            .from("document_chunks")
            .select("id, content, embedding, document_id")
            .eq("company_id", companyId);

        if (error) {
            throw error;
        }

        const chunks = (data || []) as ChunkRow[];

        const ranked = chunks
            .map((chunk) => ({
                ...chunk,
                score: cosineSimilarity(questionEmbedding, chunk.embedding),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        const context = ranked
            .map((r, i) => `[Fragmento ${i + 1}]\n${r.content}`)
            .join("\n\n");

        const prompt = `
Sos un asistente interno de una empresa.
Respondé únicamente usando el contexto provisto.
Si la respuesta no está en el contexto, decí exactamente:
"No encontré esa información en los documentos cargados".

Contexto:
${context}

Pregunta:
${question}
`;

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: prompt,
        });

        const answer = response.output_text ?? "No se pudo generar una respuesta.";

        await supabaseAdmin.from("chat_messages").insert([
            { company_id: companyId, role: "user", content: question },
            { company_id: companyId, role: "assistant", content: answer },
        ]);

        return NextResponse.json({
            answer,
            sources: ranked.map((r) => ({
                documentId: r.document_id,
                preview: r.content.slice(0, 180),
                score: r.score,
            })),
        });
    } catch (error) {
        console.error("Error en /api/ask:", error);

        return NextResponse.json(
            { error: "Error al responder la consulta" },
            { status: 500 }
        );
    }
}