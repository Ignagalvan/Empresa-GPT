import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
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
    try {
        const body = await req.json();
        const { companyId, filename, text } = body;

        if (!companyId || !filename || !text) {
            return NextResponse.json(
                { error: "Faltan datos obligatorios." },
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
        });
    } catch (error) {
        console.error("Error en /api/ingest:", error);

        return NextResponse.json(
            { error: "Error al procesar el documento manual." },
            { status: 500 }
        );
    }
}