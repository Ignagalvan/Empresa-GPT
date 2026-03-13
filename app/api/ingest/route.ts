import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { chunkText } from "@/lib/chunkText";
import { createEmbedding } from "@/lib/embeddings";

function normalizeManualText(text: string) {
    return text
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const filename = body?.filename?.trim?.();
        const text = body?.text?.trim?.();

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta el companyId." },
                { status: 400 }
            );
        }

        if (!filename) {
            return NextResponse.json(
                { error: "Falta el nombre del documento." },
                { status: 400 }
            );
        }

        if (!text) {
            return NextResponse.json(
                { error: "Falta el texto a procesar." },
                { status: 400 }
            );
        }

        const normalizedText = normalizeManualText(text);

        if (normalizedText.length < 20) {
            return NextResponse.json(
                { error: "El texto es demasiado corto para procesarlo." },
                { status: 400 }
            );
        }

        const { data: document, error: documentError } = await supabaseAdmin
            .from("documents")
            .insert({
                company_id: companyId,
                filename,
                full_text: normalizedText,
            })
            .select()
            .single();

        if (documentError) {
            throw documentError;
        }

        const chunks = chunkText(normalizedText);

        if (!chunks.length) {
            return NextResponse.json(
                { error: "No se pudieron generar fragmentos del texto." },
                { status: 400 }
            );
        }

        for (let i = 0; i < chunks.length; i++) {
            const embedding = await createEmbedding(chunks[i]);

            const { error: chunkError } = await supabaseAdmin
                .from("document_chunks")
                .insert({
                    document_id: document.id,
                    company_id: companyId,
                    chunk_index: i,
                    content: chunks[i],
                    embedding,
                });

            if (chunkError) {
                throw chunkError;
            }
        }

        return NextResponse.json({
            ok: true,
            document: {
                id: document.id,
                filename,
                created_at: document.created_at,
            },
            chunksCreated: chunks.length,
            message: "Texto procesado correctamente.",
        });
    } catch (error) {
        console.error("Error en /api/ingest:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Error al procesar el documento manual.",
            },
            { status: 500 }
        );
    }
}