import { NextResponse } from "next/server";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { supabaseAdmin } from "@/lib/supabase";
import { chunkText } from "@/lib/chunkText";
import { createEmbedding } from "@/lib/embeddings";

export const runtime = "nodejs";

function normalizeExtractedText(text: string) {
    return text
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        const companyId = formData.get("companyId") as string | null;
        const file = formData.get("file") as File | null;

        if (!companyId || !file) {
            return NextResponse.json(
                { error: "Faltan el Company ID o el archivo PDF." },
                { status: 400 }
            );
        }

        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "El archivo seleccionado no es un PDF." },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy?.();

        const extractedText = normalizeExtractedText(result?.text || "");

        if (!extractedText || extractedText.length < 20) {
            return NextResponse.json(
                {
                    error:
                        "No se pudo leer texto útil del PDF. Puede estar escaneado, vacío o mal generado.",
                },
                { status: 400 }
            );
        }

        const { data: document, error: documentError } = await supabaseAdmin
            .from("documents")
            .insert({
                company_id: companyId,
                filename: file.name,
                full_text: extractedText,
            })
            .select()
            .single();

        if (documentError) {
            throw documentError;
        }

        const chunks = chunkText(extractedText);

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
                filename: file.name,
                created_at: document.created_at,
            },
            chunksCreated: chunks.length,
            extractedPreview: extractedText.slice(0, 300),
        });
    } catch (error) {
        console.error("Error en /api/upload-pdf:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Ocurrió un error al procesar el PDF.",
            },
            { status: 500 }
        );
    }
}