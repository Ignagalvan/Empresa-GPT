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
        console.error("Error en /api/chat-conversations GET:", error);

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

export async function DELETE(req: Request) {
    const supabaseAdmin = getSupabaseAdmin();

    try {
        const body = await req.json();
        const conversationId = body?.conversationId?.trim?.() || "";

        if (!conversationId) {
            return NextResponse.json(
                { error: "Falta el conversationId." },
                { status: 400 }
            );
        }

        const { data: existingConversation, error: existingError } =
            await supabaseAdmin
                .from("chat_conversations")
                .select("id")
                .eq("id", conversationId)
                .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        if (!existingConversation) {
            return NextResponse.json(
                { error: "La conversación no existe." },
                { status: 404 }
            );
        }

        const { error: messagesError } = await supabaseAdmin
            .from("chat_messages")
            .delete()
            .eq("conversation_id", conversationId);

        if (messagesError) {
            throw messagesError;
        }

        const { data: deletedConversation, error: conversationError } =
            await supabaseAdmin
                .from("chat_conversations")
                .delete()
                .eq("id", conversationId)
                .select("id")
                .maybeSingle();

        if (conversationError) {
            throw conversationError;
        }

        if (!deletedConversation) {
            return NextResponse.json(
                { error: "No se pudo eliminar la conversación." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ok: true,
            deletedConversationId: deletedConversation.id,
        });
    } catch (error) {
        console.error("Error en /api/chat-conversations DELETE:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo eliminar la conversación.",
            },
            { status: 500 }
        );
    }
}