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

type DocumentRow = {
    id: string;
    company_id: string;
    filename: string;
    full_text: string | null;
    created_at: string;
};

type Source = {
    documentId: string;
    filename?: string;
    preview: string;
    score: number;
};

type MessageIntent =
    | "conversation"
    | "list_documents"
    | "summarize_document"
    | "compare_documents"
    | "find_document"
    | "document_query"
    | "too_short"
    | "unclear";

type ChatMessageRow = {
    id?: string;
    role: "user" | "assistant";
    content: string;
    created_at?: string;
    sources?: Source[] | null;
};

type ConversationMemory = {
    recentMessages: ChatMessageRow[];
    lastAssistantSources: Source[];
    recentMentionedDocs: DocumentRow[];
    lastMentionedDoc: DocumentRow | null;
    previousMentionedDoc: DocumentRow | null;
    recentDocMap: Map<string, DocumentRow>;
};

type ResolvedConversationContext = {
    rewrittenQuestion: string;
    resolvedDocuments: DocumentRow[];
    memoryHint: string | null;
};

const MIN_SIMILARITY = 0.35;
const MIN_STRONG_MATCHES = 1;
const MATCH_COUNT = 10;
const MAX_CHUNKS_PER_DOCUMENT = 2;
const MAX_FINAL_CHUNKS = 6;
const MAX_DOCS_TO_LIST = 30;
const MAX_COMPARE_DOCS = 2;
const MAX_MEMORY_MESSAGES = 8;

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

function normalizeComparableText(text: string) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[“”"'`´]/g, "")
        .replace(/[()_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function simplifyFilename(filename: string) {
    const normalized = normalizeComparableText(filename);
    return normalized.replace(/\.pdf$|\.docx$|\.txt$|\.md$/g, "").trim();
}

function scoreDocumentMention(question: string, doc: DocumentRow) {
    const q = normalizeComparableText(question);
    const file = normalizeComparableText(doc.filename);
    const simple = simplifyFilename(doc.filename);

    if (q.includes(file)) return 1;
    if (simple && q.includes(simple)) return 0.96;

    const tokens = simple
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);

    if (tokens.length === 0) return 0;

    const hits = tokens.filter((token) => q.includes(token)).length;
    const ratio = hits / tokens.length;

    if (ratio >= 0.8) return 0.8;
    if (ratio >= 0.6) return 0.65;
    if (ratio >= 0.4) return 0.45;

    return 0;
}

function pickMentionedDocuments(question: string, documents: DocumentRow[]) {
    return documents
        .map((doc) => ({
            doc,
            score: scoreDocumentMention(question, doc),
        }))
        .filter((item) => item.score >= 0.45)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc);
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

function buildSources(chunks: ChunkRow[]): Source[] {
    return chunks.map((r) => ({
        documentId: r.document_id,
        filename: r.filename || "Documento desconocido",
        preview: r.content.slice(0, 220),
        score: r.similarity,
    }));
}

function buildDocumentSources(documents: DocumentRow[]): Source[] {
    return documents.map((doc) => ({
        documentId: doc.id,
        filename: doc.filename,
        preview: (doc.full_text || "").slice(0, 220),
        score: 1,
    }));
}

function excerptText(text: string, maxLength = 9000) {
    const clean = (text || "").trim();
    if (!clean) return "";
    if (clean.length <= maxLength) return clean;

    const part = Math.floor(maxLength / 3);
    const head = clean.slice(0, part);
    const middleStart = Math.max(0, Math.floor(clean.length / 2) - Math.floor(part / 2));
    const middle = clean.slice(middleStart, middleStart + part);
    const tail = clean.slice(-part);

    return `${head}

[... contenido intermedio omitido ...]

${middle}

[... contenido intermedio omitido ...]

${tail}`;
}

function looksLikeGenericSummary(question: string) {
    const q = normalizeComparableText(question);

    const summaryPatterns = [
        "resumi el contenido principal",
        "resumime el contenido principal",
        "resumi el documento",
        "resumime el documento",
        "resumi los documentos",
        "resumime los documentos",
        "resumen general",
        "haceme un resumen",
        "hazme un resumen",
        "resumilo",
        "resumilo de forma simple",
        "resumilo breve",
        "explicame el contenido principal",
    ];

    return summaryPatterns.some((pattern) => q.includes(pattern));
}

function looksLikeGenericComparison(question: string) {
    const q = normalizeComparableText(question);

    const comparePatterns = [
        "compara los documentos",
        "comparar los documentos",
        "comparalos",
        "comparalos entre si",
        "comparalo con el otro",
        "comparalo con el anterior",
        "comparalo",
        "que diferencias hay entre los documentos",
        "que diferencias tienen los documentos",
        "que similitudes tienen los documentos",
        "comparacion general",
    ];

    return comparePatterns.some((pattern) => q.includes(pattern));
}

function looksLikeGenericFind(question: string) {
    const q = normalizeComparableText(question);

    const findPatterns = [
        "en que documento se habla de",
        "en que documento aparece",
        "que documento menciona",
        "cual documento menciona",
        "donde se habla de",
        "en cual documento esta",
    ];

    return findPatterns.some((pattern) => q.includes(pattern));
}

function buildDocumentContextBlock(finalChunks: ChunkRow[]) {
    const grouped = new Map<string, { filename: string; chunks: ChunkRow[] }>();

    for (const chunk of finalChunks) {
        const existing = grouped.get(chunk.document_id);

        if (!existing) {
            grouped.set(chunk.document_id, {
                filename: chunk.filename || "Documento desconocido",
                chunks: [chunk],
            });
            continue;
        }

        existing.chunks.push(chunk);
    }

    return Array.from(grouped.values())
        .map((group) => {
            const joined = group.chunks
                .map((chunk, index) => `(${index + 1}) ${chunk.content}`)
                .join("\n\n");

            return `[Documento: ${group.filename}]
${joined}`;
        })
        .join("\n\n");
}

function dedupeDocuments(documents: DocumentRow[]) {
    const seen = new Set<string>();
    const result: DocumentRow[] = [];

    for (const doc of documents) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        result.push(doc);
    }

    return result;
}

function questionUsesContextualReference(question: string) {
    const q = normalizeComparableText(question);

    const patterns = [
        "ese pdf",
        "ese documento",
        "ese archivo",
        "el otro",
        "el anterior",
        "este pdf",
        "este documento",
        "resumilo",
        "comparalo",
        "comparala",
        "amplia eso",
        "amplia esa parte",
        "explica eso",
        "explicalo",
        "y en el otro",
        "y el otro",
        "y ese",
        "y ese pdf",
        "y ese documento",
    ];

    return patterns.some((pattern) => q.includes(pattern));
}

function replaceContextualDocReference(question: string, targetDoc: DocumentRow) {
    let result = question;
    const replacements = [
        /ese pdf/gi,
        /ese documento/gi,
        /ese archivo/gi,
        /este pdf/gi,
        /este documento/gi,
        /este archivo/gi,
        /resumilo/gi,
        /resumila/gi,
        /resumirlo/gi,
    ];

    for (const regex of replacements) {
        result = result.replace(regex, targetDoc.filename);
    }

    return result;
}

function injectDocIntoQuestion(question: string, targetDoc: DocumentRow, mode: "summarize" | "generic") {
    const trimmed = question.trim();

    if (mode === "summarize") {
        return `Resumime ${targetDoc.filename}. Consulta original: ${trimmed}`;
    }

    return `${trimmed} (referencia resuelta: ${targetDoc.filename})`;
}

async function loadConversationMessages(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    conversationId: string | undefined
): Promise<ChatMessageRow[]> {
    if (!conversationId) return [];

    const { data, error } = await supabaseAdmin
        .from("chat_messages")
        .select("id, role, content, created_at, sources")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_MEMORY_MESSAGES);

    if (error) {
        return [];
    }

    return ((data || []) as ChatMessageRow[]).reverse();
}

function buildConversationMemory(
    recentMessages: ChatMessageRow[],
    documents: DocumentRow[]
): ConversationMemory {
    const docMap = new Map<string, DocumentRow>();
    for (const doc of documents) {
        docMap.set(doc.id, doc);
    }

    const collectedDocs: DocumentRow[] = [];
    let lastAssistantSources: Source[] = [];

    for (let i = recentMessages.length - 1; i >= 0; i--) {
        const msg = recentMessages[i];
        if (msg.role === "assistant" && Array.isArray(msg.sources) && msg.sources.length > 0) {
            lastAssistantSources = msg.sources;
            break;
        }
    }

    for (let i = recentMessages.length - 1; i >= 0; i--) {
        const msg = recentMessages[i];

        if (Array.isArray(msg.sources)) {
            for (const source of msg.sources) {
                const found = docMap.get(source.documentId);
                if (found) {
                    collectedDocs.push(found);
                }
            }
        }

        const mentioned = pickMentionedDocuments(msg.content || "", documents);
        for (const doc of mentioned) {
            collectedDocs.push(doc);
        }
    }

    const dedupedDocs = dedupeDocuments(collectedDocs);

    return {
        recentMessages,
        lastAssistantSources,
        recentMentionedDocs: dedupedDocs,
        lastMentionedDoc: dedupedDocs[0] || null,
        previousMentionedDoc: dedupedDocs[1] || null,
        recentDocMap: docMap,
    };
}

async function resolveConversationReferences(
    question: string,
    memory: ConversationMemory,
    documents: DocumentRow[]
): Promise<ResolvedConversationContext> {
    const normalized = normalizeComparableText(question);
    const explicitlyMentioned = pickMentionedDocuments(question, documents);

    if (explicitlyMentioned.length > 0) {
        return {
            rewrittenQuestion: question,
            resolvedDocuments: explicitlyMentioned,
            memoryHint: null,
        };
    }

    const lastDoc = memory.lastMentionedDoc;
    const prevDoc = memory.previousMentionedDoc;

    const refersToLastDoc =
        /ese pdf|ese documento|ese archivo|este pdf|este documento|este archivo|resumilo|resumila|explicalo|explicala/.test(
            normalized
        );

    const refersToPreviousDoc =
        /el otro|el anterior|y en el otro|y el otro/.test(normalized);

    if (refersToLastDoc && lastDoc) {
        const isSummary =
            normalized.includes("resum") ||
            normalized.includes("contenido principal") ||
            normalized.includes("explica");

        return {
            rewrittenQuestion: isSummary
                ? injectDocIntoQuestion(question, lastDoc, "summarize")
                : replaceContextualDocReference(question, lastDoc),
            resolvedDocuments: [lastDoc],
            memoryHint: `El usuario parece referirse al último documento mencionado: ${lastDoc.filename}.`,
        };
    }

    if (refersToPreviousDoc && prevDoc) {
        return {
            rewrittenQuestion: replaceContextualDocReference(question, prevDoc),
            resolvedDocuments: [prevDoc],
            memoryHint: `El usuario parece referirse al documento anterior en la conversación: ${prevDoc.filename}.`,
        };
    }

    if (
        normalized.includes("comparalo con el otro") &&
        lastDoc &&
        prevDoc
    ) {
        return {
            rewrittenQuestion: `Compará ${lastDoc.filename} y ${prevDoc.filename}. Consulta original: ${question}`,
            resolvedDocuments: [lastDoc, prevDoc],
            memoryHint: `El usuario parece querer comparar ${lastDoc.filename} con ${prevDoc.filename}.`,
        };
    }

    if (
        normalized.includes("comparalo con el anterior") &&
        lastDoc &&
        prevDoc
    ) {
        return {
            rewrittenQuestion: `Compará ${lastDoc.filename} y ${prevDoc.filename}. Consulta original: ${question}`,
            resolvedDocuments: [lastDoc, prevDoc],
            memoryHint: `El usuario parece querer comparar ${lastDoc.filename} con ${prevDoc.filename}.`,
        };
    }

    if (questionUsesContextualReference(question) && lastDoc) {
        return {
            rewrittenQuestion: injectDocIntoQuestion(question, lastDoc, "generic"),
            resolvedDocuments: [lastDoc],
            memoryHint: `El usuario parece estar continuando la conversación sobre ${lastDoc.filename}.`,
        };
    }

    return {
        rewrittenQuestion: question,
        resolvedDocuments: [],
        memoryHint: null,
    };
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
    assistantMessage: string,
    assistantSources: Source[] = []
) {
    await supabaseAdmin.from("chat_messages").insert([
        {
            company_id: companyId,
            conversation_id: conversationId,
            role: "user",
            content: userMessage,
            sources: null,
        },
        {
            company_id: companyId,
            conversation_id: conversationId,
            role: "assistant",
            content: assistantMessage,
            sources: assistantSources,
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
- list_documents
- summarize_document
- compare_documents
- find_document
- document_query
- too_short
- unclear

Reglas:
- conversation: saludos, agradecimientos, despedidas, mensajes sociales, pedido general de ayuda.
- list_documents: pide ver, listar, mostrar, decir cuáles documentos están cargados.
- summarize_document: pide resumen de un documento puntual o pide un resumen general del contenido cargado.
- compare_documents: pide comparar dos documentos o comparar los documentos cargados.
- find_document: pregunta qué documento habla de algo, en cuál documento está algo, o cuál menciona X.
- document_query: consulta documental general sobre contenido de los documentos.
- too_short: demasiado corto para responder útilmente.
- unclear: ambiguo, no está claro qué quiere.

Respondé solamente una etiqueta válida, sin explicación.
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
        label === "list_documents" ||
        label === "summarize_document" ||
        label === "compare_documents" ||
        label === "find_document" ||
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
- No inventes que revisaste documentos si no hiciste búsqueda documental.
- Podés orientar al usuario a preguntar por documentos cargados, resúmenes, comparaciones, procesos o información puntual.
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

async function getCompanyDocuments(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    companyId: string
): Promise<DocumentRow[]> {
    const { data, error } = await supabaseAdmin
        .from("documents")
        .select("id, company_id, filename, full_text, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(MAX_DOCS_TO_LIST);

    if (error) {
        throw error;
    }

    return (data || []) as DocumentRow[];
}

async function buildListDocumentsAnswer(documents: DocumentRow[]) {
    if (documents.length === 0) {
        return "No hay documentos cargados para esta empresa.";
    }

    const intro =
        documents.length === 1
            ? "Hay 1 documento cargado:"
            : `Hay ${documents.length} documentos cargados:`;

    const lines = documents.map((doc, index) => `${index + 1}. ${doc.filename}`);

    return `${intro}

${lines.join("\n")}`;
}

async function buildSummarizeDocumentAnswer(doc: DocumentRow, question: string) {
    const openAI = getOpenAI();
    const text = excerptText(doc.full_text || "", 12000);

    if (!text) {
        return `No encontré contenido suficiente para resumir ${doc.filename}.`;
    }

    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: `
Sos un asistente documental interno.

Tu tarea es resumir un documento de forma clara y útil.

Reglas:
- Basate solo en el contenido provisto.
- Mencioná el nombre del documento al inicio.
- Hacé un resumen ejecutivo claro.
- Si el usuario no pidió otra cosa, incluí:
  1. tema principal
  2. puntos más importantes
  3. datos o definiciones relevantes
- No inventes información faltante.
- Si el contenido es insuficiente, decilo.
        `.trim(),
            },
            {
                role: "user",
                content: `
Documento: ${doc.filename}

Pedido del usuario:
${question}

Contenido del documento:
${text}
        `.trim(),
            },
        ],
    });

    return (
        response.output_text?.trim() ||
        `No pude generar un resumen confiable del documento ${doc.filename}.`
    );
}

async function buildSummarizeMultipleDocumentsAnswer(
    docs: DocumentRow[],
    question: string
) {
    const openAI = getOpenAI();

    const formattedDocs = docs
        .map(
            (doc) => `
[Documento: ${doc.filename}]
${excerptText(doc.full_text || "", 6500)}
        `.trim()
        )
        .join("\n\n");

    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: `
Sos un asistente documental interno.

Tu tarea es hacer un resumen general de varios documentos.

Reglas:
- Usá solo el contenido provisto.
- Hacé primero una visión general breve.
- Después, si aplica, separá por documento.
- Indicá temas principales, puntos importantes y diferencias relevantes.
- No inventes.
- Si la información es insuficiente, decilo.
        `.trim(),
            },
            {
                role: "user",
                content: `
Pedido del usuario:
${question}

Documentos:
${formattedDocs}
        `.trim(),
            },
        ],
    });

    return (
        response.output_text?.trim() ||
        "No pude generar un resumen general confiable de los documentos cargados."
    );
}

async function buildCompareDocumentsAnswer(
    docs: DocumentRow[],
    question: string
) {
    const openAI = getOpenAI();

    const formattedDocs = docs
        .map(
            (doc) => `
[Documento: ${doc.filename}]
${excerptText(doc.full_text || "", 9000)}
      `.trim()
        )
        .join("\n\n");

    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: `
Sos un asistente documental interno.

Tu tarea es comparar documentos.

Reglas:
- Usá solo el contenido provisto.
- Indicá similitudes y diferencias claras.
- Si sirve, organizá la respuesta en:
  - Resumen general
  - Coincidencias
  - Diferencias
  - Conclusión
- Nombrá explícitamente los documentos.
- No inventes.
- Si la comparación no se puede hacer bien, decilo.
        `.trim(),
            },
            {
                role: "user",
                content: `
Pedido del usuario:
${question}

Documentos:
${formattedDocs}
        `.trim(),
            },
        ],
    });

    return (
        response.output_text?.trim() ||
        "No pude comparar esos documentos con suficiente confianza."
    );
}

async function buildFindDocumentAnswer(
    question: string,
    matchedChunks: ChunkRow[]
) {
    if (matchedChunks.length === 0) {
        return buildNoContextAnswer();
    }

    const grouped = new Map<
        string,
        { filename: string; matches: ChunkRow[]; bestScore: number }
    >();

    for (const chunk of matchedChunks) {
        const current = grouped.get(chunk.document_id);

        if (!current) {
            grouped.set(chunk.document_id, {
                filename: chunk.filename || "Documento desconocido",
                matches: [chunk],
                bestScore: chunk.similarity || 0,
            });
            continue;
        }

        current.matches.push(chunk);
        current.bestScore = Math.max(current.bestScore, chunk.similarity || 0);
    }

    const ranked = [...grouped.entries()]
        .map(([documentId, value]) => ({
            documentId,
            filename: value.filename,
            bestScore: value.bestScore,
            preview: value.matches[0]?.content?.slice(0, 180) || "",
        }))
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, 5);

    if (ranked.length === 0) {
        return buildNoContextAnswer();
    }

    const openAI = getOpenAI();

    const rankedText = ranked
        .map(
            (item, index) => `
${index + 1}. Documento: ${item.filename}
Relevancia aproximada: ${Math.round(item.bestScore * 100)}%
Extracto relacionado: ${item.preview}
        `.trim()
        )
        .join("\n\n");

    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: [
            {
                role: "system",
                content: `
Sos un asistente documental interno.

Tu tarea es decir qué documento o documentos parecen más relevantes para la consulta del usuario.

Reglas:
- Basate solo en los resultados provistos.
- Respondé en español claro.
- Primero decí cuál parece ser el más relevante.
- Después, si aplica, listá otros documentos útiles.
- No inventes.
        `.trim(),
            },
            {
                role: "user",
                content: `
Consulta del usuario:
${question}

Resultados encontrados:
${rankedText}
        `.trim(),
            },
        ],
    });

    return (
        response.output_text?.trim() ||
        `Los documentos más relevantes son:

${ranked
            .map(
                (item, index) =>
                    `${index + 1}. ${item.filename} (${Math.round(item.bestScore * 100)}%)`
            )
            .join("\n")}`
    );
}

async function searchRelevantChunks(
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
    companyId: string,
    question: string,
    documentIds?: string[]
) {
    const questionEmbedding = await createEmbedding(question);

    if (documentIds && documentIds.length > 0) {
        const all: ChunkRow[] = [];

        for (const documentId of documentIds) {
            const { data, error } = await supabaseAdmin.rpc(
                "match_document_chunks_by_document",
                {
                    query_embedding: `[${questionEmbedding.join(",")}]`,
                    match_company_id: companyId,
                    match_document_id: documentId,
                    match_count: MATCH_COUNT,
                }
            );

            if (error) {
                throw error;
            }

            all.push(...((data || []) as ChunkRow[]));
        }

        return all.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    }

    const { data, error } = await supabaseAdmin.rpc("match_document_chunks", {
        query_embedding: `[${questionEmbedding.join(",")}]`,
        match_company_id: companyId,
        match_count: MATCH_COUNT,
    });

    if (error) {
        throw error;
    }

    return (data || []) as ChunkRow[];
}

async function buildDocumentQueryAnswer(
    question: string,
    finalChunks: ChunkRow[],
    memoryHint?: string | null
) {
    const context = buildDocumentContextBlock(finalChunks);

    const prompt = `
Sos un asistente documental empresarial.

Tu objetivo es responder de forma clara, útil y confiable basándote únicamente en los documentos cargados.

REGLAS IMPORTANTES:
- Usá SOLO la información disponible en el contexto.
- NO inventes datos.
- Si la respuesta surge de más de un documento, separá claramente qué información viene de cada uno.
- Siempre que sea posible, nombrá explícitamente el documento del que sale cada dato relevante.
- No mezcles información de distintos documentos sin aclararlo.
- Si hay diferencias o contradicciones entre documentos, menciónalas claramente.
- Tené en cuenta el contexto de conversación solo como ayuda para interpretar referencias del usuario, no como fuente factual.
- Si un documento no menciona algo, no lo afirmes como certeza salvo que el contexto recuperado lo muestre de forma suficiente.
- No hables de "chunks", "embeddings", "fragmentos" ni cuestiones técnicas.
- Respondé en español natural, claro y profesional.
- Si la información no alcanza o no responde exactamente la pregunta, respondé exactamente:
"No encontré información suficiente en los documentos cargados para responder con confianza."

FORMATO DE RESPUESTA:
1. Primero, una respuesta directa y breve.
2. Después, si aplica, agregá:
"Según los documentos:"
- NombreDelDocumento: dato relevante
- NombreDelDocumento: dato relevante
3. Si corresponde, cerrá con una breve aclaración sobre diferencias, coincidencias o límites de la información.

CONTEXTO DE CONVERSACIÓN INTERPRETADO:
${memoryHint || "Sin referencias conversacionales relevantes."}

CONTEXTO DOCUMENTAL:
${context}

PREGUNTA DEL USUARIO:
${question}
`.trim();

    const openAI = getOpenAI();
    const response = await openAI.responses.create({
        model: "gpt-4.1-mini",
        input: prompt,
    });

    return response.output_text?.trim() || buildNoContextAnswer();
}

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const rawQuestion = body?.question?.trim?.();
        let conversationId = body?.conversationId?.trim?.();

        if (!companyId) {
            return NextResponse.json({ error: "Falta el companyId." }, { status: 400 });
        }

        if (!rawQuestion) {
            return NextResponse.json({ error: "Falta la pregunta." }, { status: 400 });
        }

        const question = normalizeQuestion(rawQuestion);

        conversationId = await createConversationIfNeeded(
            supabaseAdmin,
            companyId,
            conversationId,
            question
        );

        const documents = await getCompanyDocuments(supabaseAdmin, companyId);
        const recentMessages = await loadConversationMessages(supabaseAdmin, conversationId);
        const memory = buildConversationMemory(recentMessages, documents);
        const resolvedContext = await resolveConversationReferences(
            rawQuestion,
            memory,
            documents
        );

        const effectiveQuestion = resolvedContext.rewrittenQuestion;
        const effectiveNormalizedQuestion = normalizeQuestion(effectiveQuestion);

        let intent = await classifyIntent(effectiveNormalizedQuestion);

        if (intent === "too_short") {
            return NextResponse.json(
                { error: "La consulta es demasiado corta." },
                { status: 400 }
            );
        }

        const mentionedDocuments = pickMentionedDocuments(effectiveQuestion, documents);
        const memoryResolvedDocuments = resolvedContext.resolvedDocuments;
        const resolvedMentionedDocuments = dedupeDocuments([
            ...mentionedDocuments,
            ...memoryResolvedDocuments,
        ]);

        if (intent === "conversation" || intent === "unclear") {
            const answer = await buildConversationalReply(rawQuestion);
            await saveMessages(supabaseAdmin, companyId, conversationId, rawQuestion, answer, []);
            return NextResponse.json({ answer, conversationId, sources: [] });
        }

        if (intent === "list_documents") {
            const answer = await buildListDocumentsAnswer(documents);
            const sources = buildDocumentSources(documents);
            await saveMessages(supabaseAdmin, companyId, conversationId, rawQuestion, answer, sources);
            return NextResponse.json({ answer, conversationId, sources });
        }

        if (documents.length === 0) {
            const noDocumentsAnswer = "No encontré documentos cargados para esa empresa.";
            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                rawQuestion,
                noDocumentsAnswer,
                []
            );
            return NextResponse.json({
                answer: noDocumentsAnswer,
                conversationId,
                sources: [],
            });
        }

        if (
            looksLikeGenericSummary(effectiveQuestion) &&
            documents.length > 1 &&
            resolvedMentionedDocuments.length === 0
        ) {
            intent = "summarize_document";
        }

        if (
            looksLikeGenericComparison(effectiveQuestion) &&
            documents.length >= 2 &&
            resolvedMentionedDocuments.length === 0
        ) {
            intent = "compare_documents";
        }

        if (looksLikeGenericFind(effectiveQuestion)) {
            intent = "find_document";
        }

        if (intent === "summarize_document") {
            if (resolvedMentionedDocuments.length === 0) {
                if (documents.length === 1) {
                    const target = documents[0];
                    const answer = await buildSummarizeDocumentAnswer(target, effectiveQuestion);
                    const sources = buildDocumentSources([target]);

                    await saveMessages(
                        supabaseAdmin,
                        companyId,
                        conversationId,
                        rawQuestion,
                        answer,
                        sources
                    );

                    return NextResponse.json({ answer, conversationId, sources });
                }

                if (documents.length > 1) {
                    const docsToSummarize = documents.slice(0, 3);
                    const answer = await buildSummarizeMultipleDocumentsAnswer(
                        docsToSummarize,
                        effectiveQuestion
                    );
                    const sources = buildDocumentSources(docsToSummarize);

                    await saveMessages(
                        supabaseAdmin,
                        companyId,
                        conversationId,
                        rawQuestion,
                        answer,
                        sources
                    );

                    return NextResponse.json({ answer, conversationId, sources });
                }

                const answer =
                    "Decime qué documento querés resumir o pedime un resumen general de los documentos cargados.";
                await saveMessages(supabaseAdmin, companyId, conversationId, rawQuestion, answer, []);
                return NextResponse.json({ answer, conversationId, sources: [] });
            }

            const target = resolvedMentionedDocuments[0];
            const answer = await buildSummarizeDocumentAnswer(target, effectiveQuestion);
            const sources = buildDocumentSources([target]);

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                rawQuestion,
                answer,
                sources
            );
            return NextResponse.json({ answer, conversationId, sources });
        }

        if (intent === "compare_documents") {
            let docsToCompare = resolvedMentionedDocuments.slice(0, MAX_COMPARE_DOCS);

            if (
                docsToCompare.length < 2 &&
                memory.lastMentionedDoc &&
                memory.previousMentionedDoc &&
                looksLikeGenericComparison(effectiveQuestion)
            ) {
                docsToCompare = [memory.lastMentionedDoc, memory.previousMentionedDoc];
            }

            if (
                docsToCompare.length < 2 &&
                looksLikeGenericComparison(effectiveQuestion) &&
                documents.length >= 2
            ) {
                docsToCompare = documents.slice(0, MAX_COMPARE_DOCS);
            }

            docsToCompare = dedupeDocuments(docsToCompare).slice(0, MAX_COMPARE_DOCS);

            if (docsToCompare.length < 2) {
                const answer =
                    "Para comparar, nombrame dos documentos o pedime comparar los documentos cargados.";
                await saveMessages(supabaseAdmin, companyId, conversationId, rawQuestion, answer, []);
                return NextResponse.json({ answer, conversationId, sources: [] });
            }

            const answer = await buildCompareDocumentsAnswer(docsToCompare, effectiveQuestion);
            const sources = buildDocumentSources(docsToCompare);

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                rawQuestion,
                answer,
                sources
            );
            return NextResponse.json({ answer, conversationId, sources });
        }

        if (intent === "find_document") {
            const targetDocumentIds =
                resolvedMentionedDocuments.length > 0
                    ? resolvedMentionedDocuments.map((doc) => doc.id)
                    : undefined;

            const ranked = await searchRelevantChunks(
                supabaseAdmin,
                companyId,
                effectiveNormalizedQuestion,
                targetDocumentIds
            );

            const strongMatches = ranked.filter(
                (chunk) => (chunk.similarity || 0) >= MIN_SIMILARITY
            );

            if (strongMatches.length < MIN_STRONG_MATCHES) {
                const answer = buildNoContextAnswer();
                await saveMessages(supabaseAdmin, companyId, conversationId, rawQuestion, answer, []);
                return NextResponse.json({ answer, conversationId, sources: [] });
            }

            const finalChunks = diversifyChunks(strongMatches);
            const answer = await buildFindDocumentAnswer(rawQuestion, finalChunks);
            const sources = buildSources(finalChunks);

            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                rawQuestion,
                answer,
                sources
            );
            return NextResponse.json({ answer, conversationId, sources });
        }

        const targetDocumentIds =
            resolvedMentionedDocuments.length > 0
                ? resolvedMentionedDocuments.map((doc) => doc.id)
                : undefined;

        const ranked = await searchRelevantChunks(
            supabaseAdmin,
            companyId,
            effectiveNormalizedQuestion,
            targetDocumentIds
        );

        if (ranked.length === 0) {
            const noDocumentsAnswer = "No encontré documentos cargados para esa empresa.";
            await saveMessages(
                supabaseAdmin,
                companyId,
                conversationId,
                rawQuestion,
                noDocumentsAnswer,
                []
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
                rawQuestion,
                noContextAnswer,
                []
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
                rawQuestion,
                noContextAnswer,
                []
            );
            return NextResponse.json({
                answer: noContextAnswer,
                sources: [],
                conversationId,
            });
        }

        const answer = await buildDocumentQueryAnswer(
            effectiveQuestion,
            finalChunks,
            resolvedContext.memoryHint
        );
        const finalSources = buildSources(finalChunks);

        await saveMessages(
            supabaseAdmin,
            companyId,
            conversationId,
            rawQuestion,
            answer,
            finalSources
        );

        return NextResponse.json({
            answer,
            conversationId,
            sources: finalSources,
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