"use client";

import { useState, useEffect, useRef } from "react";
import { useCompanyContext } from "@/hooks/useCompanyContext";

type Message = {
    role: "user" | "assistant";
    content: string;
};

export default function ChatPage() {
    const { companyId } = useCompanyContext();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    const bottomRef = useRef<HTMLDivElement | null>(null);

    // Auto scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    async function sendMessage() {
        if (!input.trim()) return;

        if (!companyId) {
            alert("Primero ingresá el Company ID en el dashboard");
            return;
        }

        const userMessage: Message = {
            role: "user",
            content: input,
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
                    question: input,
                }),
            });

            const data = await res.json();

            const botMessage: Message = {
                role: "assistant",
                content: data.answer || "No se encontró respuesta",
            };

            setMessages((prev) => [...prev, botMessage]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Error al consultar",
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex h-[80vh] flex-col">
            {/* HEADER */}
            <div className="mb-6">
                <h1 className="text-3xl font-semibold">Chat</h1>
                <p className="text-slate-400">
                    Consultá sobre los documentos cargados
                </p>
            </div>

            {/* MENSAJES */}
            <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1020] p-4">
                {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-slate-500">
                        Empezá una conversación
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`max-w-xl rounded-2xl px-4 py-3 ${msg.role === "user"
                                ? "ml-auto bg-cyan-400 text-slate-900"
                                : "bg-white/10 text-white"
                            }`}
                    >
                        {msg.content}
                    </div>
                ))}

                {loading && (
                    <div className="text-slate-400">Pensando...</div>
                )}

                {/* SCROLL AUTO */}
                <div ref={bottomRef} />
            </div>

            {/* INPUT */}
            <div className="mt-4 flex gap-3">
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
    );
}