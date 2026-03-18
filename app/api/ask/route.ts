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

const MIN_SIMILARITY = 0.45;
const MIN_STRONG_MATCHES = 1;

function buildNoContextAnswer() {
    return "No encontré información suficiente en los documentos cargados para responder con confianza.";
}

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const question = body?.question?.trim?.();
        const documentId = body?.documentId?.trim?.();
        let conversationId = body?.conversationId?.trim?.();

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

        if (!conversationId) {
            const generatedTitle =
                question.length > 60 ? `${question.slice(0, 60)}...` : question;

            const { data: conversation, error: conversationError } =
                await supabaseAdmin
                    .from("chat_conversations")
                    .insert({
                        company_id: companyId,
                        title: generatedTitle,
                    })
                    .select("id")
                    .single();

            if (conversationError) {
                throw conversationError;
            }

            conversationId = conversation.id;
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
            const noContextAnswer = "No encontré documentos cargados para esa empresa.";

            await supabaseAdmin.from("chat_messages").insert([
                {
                    company_id: companyId,
                    conversation_id: conversationId,
                    role: "user",
                    content: question,
                },
                {
                    company_id: companyId,
                    conversation_id: conversationId,
                    role: "assistant",
                    content: noContextAnswer,
                },
            ]);

            return NextResponse.json({
                answer: noContextAnswer,
                sources: [],
                conversationId,
            });
        }

        const strongMatches = ranked.filter(
            (chunk) => (chunk.similarity || 0) >= MIN_SIMILARITY
        );

        if (strongMatches.length < MIN_STRONG_MATCHES) {
            const noContextAnswer = buildNoContextAnswer();

            await supabaseAdmin.from("chat_messages").insert([
                {
                    company_id: companyId,
                    conversation_id: conversationId,
                    role: "user",
                    content: question,
                },
                {
                    company_id: companyId,
                    conversation_id: conversationId,
                    role: "assistant",
                    content: noContextAnswer,
                },
            ]);

            return NextResponse.json({
                answer: noContextAnswer,
                sources: [],
                conversationId,
            });
        }

        const context = strongMatches
            .map((r) => {
                const filename = r.filename || "Documento desconocido";
                return `[Documento: ${filename}]\n${r.content}`;
            })
            .join("\n\n");

        const prompt = `
Sos un asistente interno de una empresa.

Tu objetivo es responder de forma clara, simple y útil.

Reglas:
- Usá únicamente el contexto provisto.
- Si hay múltiples respuestas, comparalas claramente.
- Respondé en formato simple y fácil de leer.
- No menciones "fragmentos".
- Priorizá nombrar documentos de forma natural.
- Si la información no alcanza o no responde exactamente la pregunta, decí exactamente:
"No encontré información suficiente en los documentos cargados para responder con confianza."

Contexto:
${context}

Pregunta:
${question}
`;

        const openAI = getOpenAI();
        const response = await openAI.responses.create({
            model: "gpt-4.1-mini",
            input: prompt,
        });

        const answer =
            response.output_text?.trim() ||
            "No encontré información suficiente en los documentos cargados para responder con confianza.";

        await supabaseAdmin.from("chat_messages").insert([
            {
                company_id: companyId,
                conversation_id: conversationId,
                role: "user",
                content: question,
            },
            {
                company_id: companyId,
                conversation_id: conversationId,
                role: "assistant",
                content: answer,
            },
        ]);

        return NextResponse.json({
            answer,
            conversationId,
            sources: strongMatches.map((r) => ({
                documentId: r.document_id,
                filename: r.filename || "Documento desconocido",
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