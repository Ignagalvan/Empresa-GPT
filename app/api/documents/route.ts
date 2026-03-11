import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get("companyId");

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta companyId." },
                { status: 400 }
            );
        }

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

        return NextResponse.json(
            { error: "No se pudieron obtener los documentos." },
            { status: 500 }
        );
    }
}