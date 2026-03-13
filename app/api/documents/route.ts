import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get("companyId")?.trim() || "";

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta companyId." },
                { status: 400 }
            );
        }

        const supabaseAdmin = getSupabaseAdmin();

        const { data, error } = await supabaseAdmin
            .from("documents")
            .select("id, filename, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            documents: data || [],
        });
    } catch (error) {
        console.error("Error en /api/documents:", error);

        const message =
            error instanceof Error
                ? error.message
                : "No se pudieron obtener los documentos.";

        return NextResponse.json({ error: message }, { status: 500 });
    }
}