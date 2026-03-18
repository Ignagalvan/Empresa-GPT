import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createEmbedding } from "@/lib/embeddings";

import { getOpenAI } from "@/lib/openai";

type ChunkRow = {
    id: string;
    content: string;
    document_id: string;
    company_id: string;
    chunk_index: number;
    similarity: number;
    filename?: string;
};

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const question = body?.question?.trim?.();
        const documentId = body?.documentId?.trim?.();

        if (documentId && documentId.length < 5) {
            return NextResponse.json(
                { error: "El documentId no es válido." },
                { status: 400 }
            );
        }

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

        const rpcName = documentId
            ? "match_document_chunks_by_document"
            : "match_document_chunks";

        const rpcParams = documentId
            ? {
                query_embedding: `[${questionEmbedding.join(",")}]`,
                match_company_id: companyId,
                match_document_id: documentId,
                match_count: 5,
            }
            : {
                query_embedding: `[${questionEmbedding.join(",")}]`,
                match_company_id: companyId,
                match_count: 5,
            };

        const { data, error } = await supabaseAdmin.rpc(rpcName, rpcParams);

        if (error) {
            throw error;
        }

        const ranked = (data || []) as ChunkRow[];

        if (ranked.length === 0) {
            return NextResponse.json({
                answer: "No encontré documentos cargados para esa empresa.",
                sources: [],
            });
        }

        const context = ranked
            .map((r) => {
                const filename = r.filename || "Documento desconocido";
                return `[Documento: ${filename}]\n${r.content}`;
            })
            .join("\n\n");

        const prompt = `
Sos un asistente interno de una empresa.
Respondé únicamente usando el contexto provisto.

Si encontrás información diferente o múltiples respuestas posibles entre los fragmentos,
explicalo claramente y listá cada caso por separado indicando de qué fragmento o documento surge.

Si la respuesta no está en el contexto, decí exactamente:
"No encontré esa información en los documentos cargados."

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
                documentId: r.document_id,
                preview: r.content.slice(0, 180),
                score: r.similarity,
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