"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

function getConversationCacheKey(companyId: string, conversationId: string) {
    return `empresa_gpt_chat_cache:${companyId}:${conversationId}`;
}

function mergeMessagesWithCache(
    fetchedMessages: Message[],
    cachedMessages: Message[]
): Message[] {
    return fetchedMessages.map((msg, index) => {
        if (msg.sources && msg.sources.length > 0) {
            return msg;
        }

        const cached = cachedMessages[index];

        if (
            cached &&
            cached.role === msg.role &&
            cached.content === msg.content &&
            cached.sources &&
            cached.sources.length > 0
        ) {
            return {
                ...msg,
                sources: cached.sources,
            };
        }

        return msg;
    });
}

function formatConversationDate(value: string) {
    const date = new Date(value);
    const now = new Date();

    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (sameDay) {
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return date.toLocaleDateString([], {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
    });
}

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
    const [expandedSources, setExpandedSources] = useState<
        Record<string, boolean>
    >({});

    const bottomRef = useRef<HTMLDivElement | null>(null);

    const hasCompany = Boolean(companyId?.trim());
    const inputDisabled = !hasCompany || loading;

    const cacheKey = useMemo(() => {
        if (!companyId || !selectedConversationId) return null;
        return getConversationCacheKey(companyId, selectedConversationId);
    }, [companyId, selectedConversationId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, loading]);

    useEffect(() => {
        if (!hasCompany) {
            setConversations([]);
            setSelectedConversationId(null);
            setMessages([]);
            setInput("");
            setExpandedSources({});
            return;
        }

        loadConversations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, hasCompany]);

    useEffect(() => {
        if (!selectedConversationId) {
            setMessages([]);
            setExpandedSources({});
            return;
        }

        setExpandedSources({});
        loadMessages(selectedConversationId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedConversationId]);

    useEffect(() => {
        if (!cacheKey) return;
        if (messages.length === 0) return;

        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(messages));
        } catch {
            // noop
        }
    }, [cacheKey, messages]);

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

            const fetchedMessages: Message[] = data.messages || [];

            let cachedMessages: Message[] = [];
            if (companyId) {
                try {
                    const raw = sessionStorage.getItem(
                        getConversationCacheKey(companyId, conversationId)
                    );
                    cachedMessages = raw ? JSON.parse(raw) : [];
                } catch {
                    cachedMessages = [];
                }
            }

            setMessages(mergeMessagesWithCache(fetchedMessages, cachedMessages));
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

            const fullText = data.answer || "No se encontró respuesta.";
            const finalSources: Source[] = data.sources || [];

            let currentText = "";

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "",
                    sources: [],
                },
            ]);

            for (let i = 0; i < fullText.length; i++) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                currentText += fullText[i];

                setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];

                    if (last && last.role === "assistant") {
                        updated[updated.length - 1] = {
                            ...last,
                            content: currentText,
                            sources: [],
                        };
                    }

                    return updated;
                });
            }

            setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];

                if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                        ...last,
                        content: fullText,
                        sources: finalSources,
                    };
                }

                return updated;
            });

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
        setExpandedSources({});
    }

    function toggleSources(messageKey: string) {
        setExpandedSources((prev) => ({
            ...prev,
            [messageKey]: !prev[messageKey],
        }));
    }

    return (
        <div className="grid h-[calc(100vh-120px)] min-h-0 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                <div className="shrink-0 border-b border-white/10 p-4">
                    <button
                        onClick={newChat}
                        disabled={!hasCompany}
                        className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Nuevo chat
                    </button>

                    {hasCompany && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                            {conversations.length} conversación
                            {conversations.length === 1 ? "" : "es"}
                        </div>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                                        className={`group relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition ${active
                                                ? "border-cyan-400/30 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                                                : "border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10"
                                            }`}
                                    >
                                        <div
                                            className={`absolute left-0 top-0 h-full w-1 rounded-r ${active ? "bg-cyan-300" : "bg-transparent"
                                                }`}
                                        />

                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div
                                                    className={`truncate text-sm font-semibold ${active
                                                            ? "text-cyan-100"
                                                            : "text-white group-hover:text-slate-100"
                                                        }`}
                                                >
                                                    {conversation.title || "Sin título"}
                                                </div>

                                                <div
                                                    className={`mt-1 text-xs ${active ? "text-cyan-200/80" : "text-slate-400"
                                                        }`}
                                                >
                                                    Conversación guardada
                                                </div>
                                            </div>

                                            <div
                                                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${active
                                                        ? "bg-cyan-300/15 text-cyan-100"
                                                        : "bg-black/20 text-slate-400"
                                                    }`}
                                            >
                                                {formatConversationDate(conversation.created_at)}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>

            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                <div className="shrink-0 border-b border-white/10 px-6 py-5">
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

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
                    <div className="mx-auto flex w-full max-w-5xl flex-col space-y-6">
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
                            messages.map((msg, i) => {
                                const messageKey = `${msg.id || i}-${msg.role}`;
                                const isExpanded = expandedSources[messageKey] ?? false;
                                const sourceCount = msg.sources?.length || 0;

                                return (
                                    <div
                                        key={messageKey}
                                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"
                                            }`}
                                    >
                                        <div
                                            className={`min-w-[140px] w-fit ${msg.role === "user" ? "max-w-[55%]" : "max-w-[60%]"
                                                } rounded-2xl px-4 py-3 ${msg.role === "user"
                                                    ? "bg-cyan-400 text-slate-950"
                                                    : "bg-white/10 text-white"
                                                }`}
                                        >
                                            <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                                                {msg.content}
                                            </div>

                                            {msg.role === "assistant" && sourceCount > 0 && (
                                                <div className="mt-4 border-t border-white/10 pt-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSources(messageKey)}
                                                        className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-black/30"
                                                    >
                                                        <span>Fuentes ({sourceCount})</span>
                                                        <span className="text-xs text-slate-400">
                                                            {isExpanded ? "Ocultar" : "Ver"}
                                                        </span>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="mt-3 space-y-2">
                                                            {msg.sources?.map((source, idx) => (
                                                                <div
                                                                    key={`${source.documentId}-${idx}`}
                                                                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                                                                >
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <div className="truncate text-sm font-medium text-cyan-200">
                                                                            {source.filename || "Documento"}
                                                                        </div>
                                                                        <div className="shrink-0 text-xs text-slate-400">
                                                                            {Math.round((source.score || 0) * 100)}%
                                                                        </div>
                                                                    </div>

                                                                    <div className="mt-2 text-sm leading-relaxed text-slate-300">
                                                                        {source.preview}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div ref={bottomRef} />
                    </div>
                </div>

                <div className="shrink-0 border-t border-white/10 bg-[#0f172a]/95 p-4 backdrop-blur">
                    <div className="mx-auto flex w-full max-w-5xl gap-3">
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