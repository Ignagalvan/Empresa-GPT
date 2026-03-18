"use client";

import { useEffect, useRef, useState } from "react";
import { useCompanyContext } from "@/hooks/useCompanyContext";

type Source = {
    documentId: string;
    filename?: string;
    preview: string;
    score: number;
};

type Message = {
    id?: string;
    role: "user" | "assistant";
    content: string;
    created_at?: string;
    sources?: Source[];
};

type Conversation = {
    id: string;
    title: string | null;
    created_at: string;
};

export default function ChatPage() {
    const { companyId } = useCompanyContext();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    useEffect(() => {
        if (!companyId) {
            setConversations([]);
            setSelectedConversationId(null);
            setMessages([]);
            return;
        }

        loadConversations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId]);

    useEffect(() => {
        if (!selectedConversationId) {
            setMessages([]);
            return;
        }

        loadMessages(selectedConversationId);
    }, [selectedConversationId]);

    async function loadConversations() {
        if (!companyId) return;

        try {
            setLoadingConversations(true);

            const res = await fetch(
                `/api/chat-conversations?companyId=${encodeURIComponent(companyId)}`
            );
            const data = await res.json();

            if (!res.ok) {
                return;
            }

            const list = data.conversations || [];
            setConversations(list);

            if (!selectedConversationId && list.length > 0) {
                setSelectedConversationId(list[0].id);
            }
        } finally {
            setLoadingConversations(false);
        }
    }

    async function loadMessages(conversationId: string) {
        try {
            setLoadingMessages(true);

            const res = await fetch(
                `/api/chat-messages?conversationId=${encodeURIComponent(conversationId)}`
            );
            const data = await res.json();

            if (!res.ok) {
                setMessages([]);
                return;
            }

            setMessages(data.messages || []);
        } finally {
            setLoadingMessages(false);
        }
    }

    async function sendMessage() {
        if (!input.trim() || loading) return;

        if (!companyId) {
            alert("Primero ingresá el Company ID en el dashboard");
            return;
        }

        const userText = input.trim();

        const userMessage: Message = {
            role: "user",
            content: userText,
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    companyId,
                    question: userText,
                    conversationId: selectedConversationId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: data.error || "Error al consultar.",
                    },
                ]);
                return;
            }

            const returnedConversationId = data.conversationId as string | undefined;

            if (returnedConversationId && !selectedConversationId) {
                setSelectedConversationId(returnedConversationId);
            }

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: data.answer || "No se encontró respuesta.",
                    sources: data.sources || [],
                },
            ]);

            await loadConversations();
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Error al consultar.",
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    function newChat() {
        setSelectedConversationId(null);
        setMessages([]);
        setInput("");
    }

    return (
        <div className="grid h-[80vh] grid-cols-[280px_1fr] gap-6">
            <div className="flex flex-col rounded-2xl border border-white/10 bg-[#121a2b]">
                <div className="border-b border-white/10 p-4">
                    <button
                        onClick={newChat}
                        className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-900 transition hover:bg-cyan-300"
                    >
                        Nuevo chat
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                    {loadingConversations ? (
                        <div className="text-sm text-slate-400">Cargando conversaciones...</div>
                    ) : conversations.length === 0 ? (
                        <div className="text-sm text-slate-500">
                            Todavía no hay conversaciones.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {conversations.map((conversation) => {
                                const active = selectedConversationId === conversation.id;

                                return (
                                    <button
                                        key={conversation.id}
                                        onClick={() => setSelectedConversationId(conversation.id)}
                                        className={`w-full rounded-xl px-4 py-3 text-left transition ${active
                                                ? "bg-cyan-400 text-slate-900"
                                                : "bg-white/5 text-white hover:bg-white/10"
                                            }`}
                                    >
                                        <div className="truncate text-sm font-medium">
                                            {conversation.title || "Sin título"}
                                        </div>
                                        <div
                                            className={`mt-1 text-xs ${active ? "text-slate-800" : "text-slate-400"
                                                }`}
                                        >
                                            {new Date(conversation.created_at).toLocaleString()}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col rounded-2xl border border-white/10 bg-[#121a2b]">
                <div className="border-b border-white/10 px-6 py-5">
                    <h1 className="text-3xl font-semibold">Chat</h1>
                    <p className="mt-1 text-slate-400">
                        Consultá sobre los documentos cargados
                    </p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto bg-[#0b1020] p-4">
                    {loadingMessages ? (
                        <div className="flex h-full items-center justify-center text-slate-500">
                            Cargando mensajes...
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-slate-500">
                            Empezá una conversación
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={msg.id || i} className="space-y-2">
                                <div
                                    className={`max-w-xl rounded-2xl px-4 py-3 ${msg.role === "user"
                                            ? "ml-auto bg-cyan-400 text-slate-900"
                                            : "bg-white/10 text-white"
                                        }`}
                                >
                                    {msg.content}
                                </div>

                                {msg.role === "assistant" &&
                                    msg.sources &&
                                    msg.sources.length > 0 && (
                                        <div className="max-w-xl space-y-2 text-xs text-slate-400">
                                            <div className="font-semibold text-slate-300">
                                                Fuentes:
                                            </div>

                                            {msg.sources.map((source, idx) => (
                                                <div
                                                    key={idx}
                                                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                                                >
                                                    <div className="font-medium text-slate-200">
                                                        {source.filename || "Documento"}
                                                    </div>

                                                    <div className="mt-1">
                                                        {source.preview}
                                                    </div>

                                                    <div className="mt-1 text-[10px] text-slate-500">
                                                        Relevancia:{" "}
                                                        {Math.round((source.score || 0) * 100)}%
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                            </div>
                        ))
                    )}

                    {loading && <div className="text-slate-400">Pensando...</div>}

                    <div ref={bottomRef} />
                </div>

                <div className="border-t border-white/10 p-4">
                    <div className="flex gap-3">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="Escribí tu pregunta..."
                            className="flex-1 rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none focus:border-cyan-400"
                        />

                        <button
                            onClick={sendMessage}
                            disabled={loading}
                            className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-60"
                        >
                            Enviar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}