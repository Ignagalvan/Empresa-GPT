import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get("companyId")?.trim() || "";

        if (!companyId) {
            return NextResponse.json(
                { error: "Falta el companyId." },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from("chat_conversations")
            .select("id, title, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            conversations: data || [],
        });
    } catch (error) {
        console.error("Error en /api/chat-conversations:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudieron obtener las conversaciones.",
            },
            { status: 500 }
        );
    }
}