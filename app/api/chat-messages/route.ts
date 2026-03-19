import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId")?.trim();

    if (!conversationId) {
        return NextResponse.json(
            { error: "Falta el conversationId." },
            { status: 400 }
        );
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();

        const { data, error } = await supabaseAdmin
            .from("chat_messages")
            .select("id, role, content, created_at, sources")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            messages: data || [],
        });
    } catch (error) {
        console.error("Error en /api/chat-messages:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Error al obtener los mensajes.",
            },
            { status: 500 }
        );
    }
}