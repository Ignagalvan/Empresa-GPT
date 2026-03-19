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

type MessageIntent =
    | "conversation"
    | "document_query"
    | "too_short"
    | "unclear";

const MIN_SIMILARITY = 0.35;
const MIN_STRONG_MATCHES = 1;
const MATCH_COUNT = 10;
const MAX_CHUNKS_PER_DOCUMENT = 2;
const MAX_FINAL_CHUNKS = 6;

function buildNoContextAnswer() {
    return "No encontré información suficiente en los documentos cargados para responder con confianza.";
}

function normalizeQuestion(text: string) {
    let normalized = text.trim().toLowerCase();

    normalized = normalized.replace(/\s+/g, " ");
    normalized = normalized.replace(/([a-záéíóúñ])\1{2,}/gi, "$1");
    normalized = normalized.replace(/([!?.,])\1+/g, "$1");

    return normalized;
}

function generateConversationTitle(question: string) {
    const cleaned = normalizeQuestion(question)
        .replace(/^[¡!¿?\s]+/, "")
        .replace(
            /^(hola|buenas|buenos días|buen dia|buenas tardes|buenas noches|chatgpt|chat)[,:]?\s+/i,
            ""
        )
        .trim();

    const base = cleaned || normalizeQuestion(question);
    return base.length > 60 ? `${base.slice(0, 60)}...` : base;
}

function diversifyChunks(chunks: ChunkRow[]) {
    const perDocCount: Record<string, number> = {};
    const diversified: ChunkRow[] = [];

    for (const chunk of chunks) {
        const docId = chunk.document_id;

        if (!perDocCount[docId]) {
            perDocCount[docId] = 0;
        }

        if (perDocCount[docId] < MAX_CHUNKS_PER_DOCUMENT) {
            diversified.push(chunk);
            perDocCount[docId]++;

            if (diversified.length >= MAX_FINAL_CHUNKS) {
                break;
            }
        }
    }

    return diversified;
}

async function createConversationIfNeeded(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    companyId: string,
    conversationId: string | undefined,
    question: string
) {
    if (conversationId) {
        return conversationId;
    }

    const generatedTitle = generateConversationTitle(question);

    const { data: conversation, error: conversationError } = await supabaseAdmin
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

    return conversation.id;
}

async function saveMessages(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    companyId: string,
    conversationId: string,
    userMessage: string,
    assistantMessage: string
) {
    await supabaseAdmin.from("chat_messages").insert([
        {
            company_id: companyId,
            conversation_id: conversationId,
            role: "user",
            content: userMessage,
        },
        {
            company_id: companyId,
            conversation_id: conversationId,
            role: "assistant",
            content: assistantMessage,
        },
    ]);
}

async function classifyIntent(question: string): Promise<MessageIntent> {
    const openAI = getOpenAI();

    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: `
Clasificá el mensaje del usuario en una sola categoría.

Categorías válidas:
- conversation
- document_query
- too_short
- unclear

Usá estas reglas:
- conversation: saludos, agradecimientos, despedidas, mensajes sociales, pedido general de ayuda, mensajes como "hola chat", "graciasss", "estás ahí", "me ayudás?", "ok gracias".
- document_query: cuando el usuario quiere información concreta que probablemente deba buscarse en documentos de empresa.
- too_short: cuando el mensaje es demasiado corto y no alcanza para ayudar realmente, por ejemplo una sola letra o algo sin sentido útil.
- unclear: cuando no está claro qué quiere y no es claramente ni conversación social ni consulta documental.

Respondé solamente una de esas 4 etiquetas, sin explicación.
        `.trim(),
            },
            {
                role: "user",
                content: question,
            },
        ],
    });

    const label = response.output_text?.trim() as MessageIntent | undefined;

    if (
        label === "conversation" ||
        label === "document_query" ||
        label === "too_short" ||
        label === "unclear"
    ) {
        return label;
    }

    return "document_query";
}

async function buildConversationalReply(question: string) {
    const openAI = getOpenAI();

    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: `
Sos un asistente documental interno para empresas.

Tu tono debe ser:
- natural
- cercano
- profesional
- breve

Reglas:
- Respondé de forma conversacional.
- Si el usuario saluda, respondé amable y natural.
- Si agradece, respondé natural.
- Si pide ayuda de forma general, explicá brevemente en qué lo podés ayudar.
- Si el mensaje es ambiguo, guiá al usuario para que haga una consulta más clara.
- No inventes que revisaste documentos si no hiciste búsqueda documental.
- Podés orientar al usuario a preguntar sobre documentos, políticas, horarios, procesos o información cargada.
- No respondas robótico.
- No uses siempre la misma frase.
- Mantené la respuesta corta y útil.
        `.trim(),
            },
            {
                role: "user",
                content: question,
            },
        ],
    });

    return (
        response.output_text?.trim() ||
        "Hola, estoy para ayudarte con la información cargada de esta empresa."
    );
}

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const rawQuestion = body?.question?.trim?.();
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

        if (!rawQuestion) {
            return NextResponse.json(
                { error: "Falta la pregunta." },
                { status: 400 }
            );
        }

        const question = normalizeQuestion(rawQuestion);
        const intent = await classifyIntent(question);

        if (intent === "too_short") {
            return NextResponse.json(
                { error: "La consulta es demasiado corta." },
                { status: 400 }
            );
        }

        if (intent === "conversation" || intent === "unclear") {
            conversationId = await createConversationIfNeeded(
                supabaseAdmin,
                companyId,
                conversationId,
                question
            );

            const answer = await buildConversationalReply(question);

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                question,
                answer
            );

            return NextResponse.json({
                answer,
                conversationId,
                sources: [],
            });
        }

        conversationId = await createConversationIfNeeded(
            supabaseAdmin,
            companyId,
            conversationId,
            question
        );

        const questionEmbedding = await createEmbedding(question);

        const rpcName = documentId
            ? "match_document_chunks_by_document"
            : "match_document_chunks";

        const rpcParams = documentId
            ? {
                query_embedding: `[${questionEmbedding.join(",")}]`,
                match_company_id: companyId,
                match_document_id: documentId,
                match_count: MATCH_COUNT,
            }
            : {
                query_embedding: `[${questionEmbedding.join(",")}]`,
                match_company_id: companyId,
                match_count: MATCH_COUNT,
            };

        const { data, error } = await supabaseAdmin.rpc(rpcName, rpcParams);

        if (error) {
            throw error;
        }

        const ranked = (data || []) as ChunkRow[];

        if (ranked.length === 0) {
            const noDocumentsAnswer = "No encontré documentos cargados para esa empresa.";

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                question,
                noDocumentsAnswer
            );

            return NextResponse.json({
                answer: noDocumentsAnswer,
                sources: [],
                conversationId,
            });
        }

        const strongMatches = ranked.filter(
            (chunk) => (chunk.similarity || 0) >= MIN_SIMILARITY
        );

        if (strongMatches.length < MIN_STRONG_MATCHES) {
            const noContextAnswer = buildNoContextAnswer();

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                question,
                noContextAnswer
            );

            return NextResponse.json({
                answer: noContextAnswer,
                sources: [],
                conversationId,
            });
        }

        const finalChunks = diversifyChunks(strongMatches);

        if (finalChunks.length === 0) {
            const noContextAnswer = buildNoContextAnswer();

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                question,
                noContextAnswer
            );

            return NextResponse.json({
                answer: noContextAnswer,
                sources: [],
                conversationId,
            });
        }

        const context = finalChunks
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
- Si la pregunta compara, resume o combina información, integrá la información de todos los documentos relevantes del contexto.
- Si hay diferencias entre documentos, explicalas claramente.
- Respondé en formato simple y fácil de leer.
- No menciones "fragmentos".
- Priorizá nombrar documentos de forma natural cuando ayude a entender la respuesta.
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

        const answer = response.output_text?.trim() || buildNoContextAnswer();

        await saveMessages(
            supabaseAdmin,
            companyId,
            conversationId,
            question,
            answer
        );

        return NextResponse.json({
            answer,
            conversationId,
            sources: finalChunks.map((r) => ({
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