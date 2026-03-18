"use client";

import Link from "next/link";
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
    const [selectedConversationId, setSelectedConversationId] = useState<
        string | null
    >(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const bottomRef = useRef<HTMLDivElement | null>(null);

    const hasCompany = Boolean(companyId?.trim());
    const inputDisabled = !hasCompany || loading;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    useEffect(() => {
        if (!hasCompany) {
            setConversations([]);
            setSelectedConversationId(null);
            setMessages([]);
            setInput("");
            return;
        }

        loadConversations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, hasCompany]);

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

            if (!res.ok) return;

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
        if (!input.trim() || loading || !hasCompany) return;

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
        if (!hasCompany) return;
        setSelectedConversationId(null);
        setMessages([]);
        setInput("");
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <button
                    onClick={newChat}
                    disabled={!hasCompany}
                    className="mb-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Nuevo chat
                </button>

                {!hasCompany ? (
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                        <p className="font-medium">No hay empresa activa</p>
                        <p className="mt-2 text-amber-100/80">
                            Primero definí el Company ID para poder ver conversaciones y hacer
                            consultas.
                        </p>
                        <Link
                            href="/dashboard"
                            className="mt-3 inline-block text-cyan-300 hover:text-cyan-200"
                        >
                            Ir al dashboard
                        </Link>
                    </div>
                ) : loadingConversations ? (
                    <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
                        Cargando conversaciones...
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
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
                                    className={`w-full rounded-2xl px-4 py-3 text-left transition ${active
                                            ? "bg-cyan-400 text-slate-900"
                                            : "bg-white/5 text-white hover:bg-white/10"
                                        }`}
                                >
                                    <div className="truncate font-medium">
                                        {conversation.title || "Sin título"}
                                    </div>
                                    <div
                                        className={`mt-1 text-xs ${active ? "text-slate-700" : "text-slate-400"
                                            }`}
                                    >
                                        {new Date(conversation.created_at).toLocaleString()}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </aside>

            <section className="flex min-h-[700px] flex-col rounded-3xl border border-white/10 bg-white/5">
                <div className="border-b border-white/10 px-6 py-5">
                    <h1 className="text-3xl font-semibold">Chat</h1>
                    <p className="mt-1 text-slate-400">
                        Consultá sobre los documentos cargados
                    </p>

                    {hasCompany && (
                        <div className="mt-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                            Empresa activa: {companyId}
                        </div>
                    )}
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                    {!hasCompany ? (
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100">
                            <p className="font-medium">No podés chatear todavía</p>
                            <p className="mt-2 text-amber-100/80">
                                Primero configurá un Company ID en el dashboard para consultar
                                documentos de una empresa.
                            </p>
                        </div>
                    ) : loadingMessages ? (
                        <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
                            Cargando mensajes...
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="rounded-2xl bg-white/5 p-5 text-slate-300">
                            Empezá una conversación
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div
                                key={`${msg.id || i}-${msg.role}`}
                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === "user"
                                        ? "ml-auto bg-cyan-400 text-slate-950"
                                        : "bg-white/10 text-white"
                                    }`}
                            >
                                <div className="whitespace-pre-wrap">{msg.content}</div>

                                {msg.role === "assistant" &&
                                    msg.sources &&
                                    msg.sources.length > 0 && (
                                        <div className="mt-4 border-t border-white/10 pt-3">
                                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                                Fuentes
                                            </div>

                                            <div className="space-y-2">
                                                {msg.sources.map((source, idx) => (
                                                    <div
                                                        key={`${source.documentId}-${idx}`}
                                                        className="rounded-xl bg-black/20 p-3 text-sm"
                                                    >
                                                        <div className="font-medium text-cyan-200">
                                                            {source.filename || "Documento"}
                                                        </div>
                                                        <div className="mt-1 text-slate-300">
                                                            {source.preview}
                                                        </div>
                                                        <div className="mt-2 text-xs text-slate-400">
                                                            Relevancia:{" "}
                                                            {Math.round((source.score || 0) * 100)}%
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                            </div>
                        ))
                    )}

                    {loading && (
                        <div className="max-w-[80%] rounded-2xl bg-white/10 px-4 py-3 text-white">
                            Pensando...
                        </div>
                    )}

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
                            placeholder={
                                hasCompany
                                    ? "Escribí tu pregunta..."
                                    : "Primero configurá un Company ID en el dashboard"
                            }
                            disabled={inputDisabled}
                            className="flex-1 rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                        />

                        <button
                            onClick={sendMessage}
                            disabled={inputDisabled || !input.trim()}
                            className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Enviar
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}