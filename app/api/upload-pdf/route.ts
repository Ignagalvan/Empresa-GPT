import { NextResponse } from "next/server";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { getSupabaseAdmin } from "@/lib/supabase";
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
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const formData = await req.formData();
        const companyId = String(formData.get("companyId") || "").trim();
        const file = formData.get("file") as File | null;

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta el companyId." },
                { status: 400 }
            );
        }

        if (!file) {
            return NextResponse.json(
                { error: "No se recibió ningún archivo PDF." },
                { status: 400 }
            );
        }

        if (file.size === 0) {
            return NextResponse.json(
                { error: "El archivo PDF está vacío." },
                { status: 400 }
            );
        }

        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "El archivo seleccionado no es un PDF válido." },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy?.();

        const extractedText = normalizeExtractedText(result?.text || "");

        if (!extractedText) {
            return NextResponse.json(
                {
                    error:
                        "No se pudo extraer texto del PDF. Puede estar vacío, protegido o ser un PDF escaneado.",
                },
                { status: 400 }
            );
        }

        if (extractedText.length < 20) {
            return NextResponse.json(
                {
                    error:
                        "El PDF tiene muy poco texto legible. Puede ser un PDF escaneado o contener solo imágenes.",
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

        if (!chunks.length) {
            return NextResponse.json(
                { error: "No se pudieron generar fragmentos del PDF." },
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
                filename: file.name,
                created_at: document.created_at,
            },
            chunksCreated: chunks.length,
            extractedPreview: extractedText.slice(0, 300),
            message: "PDF procesado correctamente.",
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