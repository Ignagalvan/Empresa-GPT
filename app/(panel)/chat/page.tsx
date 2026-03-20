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
    sources?: Source[] | null;
};

type Conversation = {
    id: string;
    title: string | null;
    created_at: string;
};

type GroupedSource = {
    filename: string;
    documentId: string;
    items: Source[];
    bestScore: number;
};

function formatConversationDate(value: string) {
    const date = new Date(value);
    const now = new Date();

    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    const locale =
        typeof navigator !== "undefined" && navigator.language
            ? navigator.language
            : "es-AR";

    if (sameDay) {
        return new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(date);
    }

    return new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
    }).format(date);
}

function groupSourcesByDocument(sources: Source[] = []): GroupedSource[] {
    const map = new Map<string, GroupedSource>();

    for (const source of sources) {
        const key = source.documentId || source.filename || "unknown";
        const existing = map.get(key);

        if (!existing) {
            map.set(key, {
                filename: source.filename || "Documento desconocido",
                documentId: source.documentId,
                items: [source],
                bestScore: source.score || 0,
            });
            continue;
        }

        existing.items.push(source);
        existing.bestScore = Math.max(existing.bestScore, source.score || 0);
    }

    return Array.from(map.values()).sort((a, b) => b.bestScore - a.bestScore);
}

function truncateText(text: string, maxLength = 220) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
}

function CopyIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
        >
            <rect x="9" y="9" width="10" height="10" rx="2" />
            <path d="M5 15V7a2 2 0 0 1 2-2h8" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

export default function ChatPage() {
    const { companyId } = useCompanyContext();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
    const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
    const [copiedMessageKey, setCopiedMessageKey] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement | null>(null);

    const hasCompany = Boolean(companyId?.trim());
    const inputDisabled = !hasCompany || loading;

    const quickPrompts = [
        "¿Qué documentos hay cargados?",
        "Resumí el contenido principal",
        "Compará los documentos cargados",
        "¿Qué información importante aparece en los documentos?",
        "¿En qué documento se habla de este tema?",
        "Explicame esto de forma simple",
    ];

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

            if (
                selectedConversationId &&
                !list.some((c: Conversation) => c.id === selectedConversationId)
            ) {
                setSelectedConversationId(list[0]?.id || null);
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

    async function sendMessage(prefilledText?: string) {
        const textToSend = (prefilledText ?? input).trim();

        if (!textToSend || loading || !hasCompany) return;

        const userText = textToSend;
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

            if (returnedConversationId) {
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

            const chunkSize = fullText.length > 1200 ? 6 : fullText.length > 600 ? 4 : 2;
            const delayMs = fullText.length > 1200 ? 4 : fullText.length > 600 ? 6 : 10;

            for (let i = 0; i < fullText.length; i += chunkSize) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                currentText += fullText.slice(i, i + chunkSize);

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

    async function deleteConversation(conversationId: string) {
        const confirmed = window.confirm(
            "¿Querés eliminar esta conversación? Esta acción no se puede deshacer."
        );

        if (!confirmed) return;

        try {
            setDeletingConversationId(conversationId);

            const res = await fetch("/api/chat-conversations", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ conversationId }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "No se pudo eliminar la conversación.");
                return;
            }

            const remaining = conversations.filter((c) => c.id !== conversationId);
            setConversations(remaining);

            if (selectedConversationId === conversationId) {
                const nextConversationId = remaining[0]?.id || null;
                setSelectedConversationId(nextConversationId);
                if (!nextConversationId) {
                    setMessages([]);
                }
            }
        } catch {
            alert("No se pudo eliminar la conversación.");
        } finally {
            setDeletingConversationId(null);
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

    async function copyMessage(content: string, messageKey: string) {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedMessageKey(messageKey);

            setTimeout(() => {
                setCopiedMessageKey((current) => (current === messageKey ? null : current));
            }, 1400);
        } catch {
            alert("No se pudo copiar el texto.");
        }
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
                                const isDeleting = deletingConversationId === conversation.id;

                                return (
                                    <div
                                        key={conversation.id}
                                        className={`group relative overflow-hidden rounded-2xl border transition ${active
                                                ? "border-cyan-400/30 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                                                : "border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10"
                                            }`}
                                    >
                                        <div
                                            className={`absolute left-0 top-0 h-full w-1 rounded-r ${active ? "bg-cyan-300" : "bg-transparent"
                                                }`}
                                        />

                                        <div className="flex items-start gap-2 px-4 py-3">
                                            <button
                                                onClick={() => setSelectedConversationId(conversation.id)}
                                                className="min-w-0 flex-1 text-left"
                                            >
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
                                            </button>

                                            <div className="flex shrink-0 items-center gap-2">
                                                <div
                                                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${active
                                                            ? "bg-cyan-300/15 text-cyan-100"
                                                            : "bg-black/20 text-slate-400"
                                                        }`}
                                                >
                                                    {formatConversationDate(conversation.created_at)}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => deleteConversation(conversation.id)}
                                                    disabled={isDeleting}
                                                    className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                                                    title="Eliminar conversación"
                                                >
                                                    {isDeleting ? "..." : "✕"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
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

                    {hasCompany && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {quickPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => setInput(prompt)}
                                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100"
                                >
                                    {prompt}
                                </button>
                            ))}
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
                                <p className="font-medium text-white">Empezá una conversación</p>
                                <p className="mt-2">
                                    Podés pedir resúmenes, comparaciones, saber qué documentos hay
                                    cargados o hacer preguntas puntuales sobre su contenido.
                                </p>
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const messageKey = `${msg.id || i}-${msg.role}`;
                                const isExpanded = expandedSources[messageKey] ?? false;
                                const sourceCount = msg.sources?.length || 0;
                                const groupedSources = groupSourcesByDocument(msg.sources || []);

                                return (
                                    <div
                                        key={messageKey}
                                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"
                                            }`}
                                    >
                                        <div
                                            className={`relative min-w-[140px] w-fit rounded-2xl px-4 py-3 ${msg.role === "user"
                                                    ? "max-w-[55%] bg-cyan-400 text-slate-950"
                                                    : "max-w-[72%] bg-white/10 text-white"
                                                }`}
                                        >
                                            {msg.role === "assistant" && msg.content && (
                                                <button
                                                    type="button"
                                                    onClick={() => copyMessage(msg.content, messageKey)}
                                                    title="Copiar respuesta"
                                                    className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/20 p-2 text-slate-300 transition hover:bg-black/30 hover:text-white"
                                                >
                                                    {copiedMessageKey === messageKey ? (
                                                        <CheckIcon />
                                                    ) : (
                                                        <CopyIcon />
                                                    )}
                                                </button>
                                            )}

                                            <div
                                                className={`whitespace-pre-wrap text-[15px] leading-relaxed ${msg.role === "assistant" ? "pr-12" : ""
                                                    }`}
                                            >
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
                                                        <div className="mt-3 space-y-3">
                                                            {groupedSources.map((group) => (
                                                                <div
                                                                    key={group.documentId || group.filename}
                                                                    className="rounded-2xl border border-white/10 bg-black/20 p-3"
                                                                >
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <div className="truncate text-sm font-semibold text-cyan-200">
                                                                                {group.filename}
                                                                            </div>
                                                                            <div className="mt-1 text-xs text-slate-400">
                                                                                {group.items.length} fragmento
                                                                                {group.items.length === 1 ? "" : "s"} relacionado
                                                                                {group.items.length === 1 ? "" : "s"}
                                                                            </div>
                                                                        </div>

                                                                        <div className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100">
                                                                            {Math.round(group.bestScore * 100)}%
                                                                        </div>
                                                                    </div>

                                                                    <div className="mt-3 space-y-2">
                                                                        {group.items.map((source, idx) => (
                                                                            <div
                                                                                key={`${group.documentId}-${idx}`}
                                                                                className="rounded-xl border border-white/10 bg-white/5 p-3"
                                                                            >
                                                                                <div className="text-sm leading-relaxed text-slate-300">
                                                                                    {truncateText(source.preview, 260)}
                                                                                </div>

                                                                                <div className="mt-2 text-[11px] text-slate-400">
                                                                                    Relevancia del fragmento:{" "}
                                                                                    {Math.round((source.score || 0) * 100)}%
                                                                                </div>
                                                                            </div>
                                                                        ))}
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

                        {loading && (
                            <div className="flex justify-start">
                                <div className="max-w-[72%] rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-300">
                                    Pensando...
                                </div>
                            </div>
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
                            onClick={() => sendMessage()}
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