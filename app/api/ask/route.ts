import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createEmbedding } from "@/lib/embeddings";
import { cosineSimilarity } from "@/lib/cosineSimilarity";
import { getOpenAI } from "@/lib/openai";

type ChunkRow = {
    id: string;
    content: string;
    embedding: number[];
    document_id: string;
    documents?: {
        filename?: string;
    } | null;
};

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const question = body?.question?.trim?.();

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta el companyId." },
                { status: 400 }
            );
        }

        if (!question) {
            return NextResponse.json(
                { error: "Falta la pregunta." },
                { status: 400 }
            );
        }

        if (question.length < 3) {
            return NextResponse.json(
                { error: "La pregunta es demasiado corta." },
                { status: 400 }
            );
        }

        const questionEmbedding = await createEmbedding(question);

        const { data, error } = await supabaseAdmin
            .from("document_chunks")
            .select(`id, content, embedding, document_id, documents (filename)`)
            .eq("company_id", companyId);

        if (error) {
            throw error;
        }

        const chunks = (data || []) as ChunkRow[];

        if (chunks.length === 0) {
            return NextResponse.json({
                answer: "No encontré documentos cargados para esa empresa.",
                sources: [],
            });
        }

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
Si la respuesta no está en el contexto, decí exactamente: "No encontré esa información en los documentos cargados."

Contexto:
${context}

Pregunta:
${question}
`;

        const openai = getOpenAI();

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: prompt,
        });

        const answer =
            response.output_text?.trim() ||
            "No encontré esa información en los documentos cargados.";

        await supabaseAdmin.from("chat_messages").insert([
            { company_id: companyId, role: "user", content: question },
            { company_id: companyId, role: "assistant", content: answer },
        ]);

        return NextResponse.json({
            answer,
            sources: ranked.map((r) => ({
                documentId: r.documents?.filename || r.document_id,
                preview: r.content.slice(0, 180),
                score: r.score,
            })),
        });
    } catch (error) {
        console.error("Error en /api/ask:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Error al responder la consulta.",
            },
            { status: 500 }
        );
    }
}