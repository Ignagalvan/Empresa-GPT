import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const companyId = body?.companyId?.trim?.();
        const documentId = body?.documentId?.trim?.();

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta el companyId." },
                { status: 400 }
            );
        }

        if (!documentId) {
            return NextResponse.json(
                { error: "Falta el documentId." },
                { status: 400 }
            );
        }

        const { error: chunksError } = await supabaseAdmin
            .from("document_chunks")
            .delete()
            .eq("company_id", companyId)
            .eq("document_id", documentId);

        if (chunksError) {
            throw chunksError;
        }

        const { error: documentError } = await supabaseAdmin
            .from("documents")
            .delete()
            .eq("company_id", companyId)
            .eq("id", documentId);

        if (documentError) {
            throw documentError;
        }

        return NextResponse.json({
            ok: true,
            message: "Documento eliminado correctamente.",
        });
    } catch (error) {
        console.error("Error en /api/documents/delete:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo eliminar el documento.",
            },
            { status: 500 }
        );
    }
}