"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Message = {
    role: "user" | "assistant";
    content: string;
};

export default function ChatPage() {
    const searchParams = useSearchParams();

    const companyId = useMemo(() => {
        return searchParams.get("companyId")?.trim() || "";
    }, [searchParams]);

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");

    async function handleSend() {
        if (!input.trim()) return;

        if (!companyId) {
            setMessages([
                ...messages,
                {
                    role: "assistant",
                    content: "Falta el companyId en la URL. Abrí el chat con ?companyId=...",
                },
            ]);
            return;
        }

        const userMessage = input.trim();

        const newMessages = [
            ...messages,
            { role: "user" as const, content: userMessage },
        ];

        setMessages(newMessages);
        setInput("");

        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    companyId,
                    question: userMessage,
                }),
            });

            const data = await res.json();

            setMessages([
                ...newMessages,
                {
                    role: "assistant",
                    content: data.answer || "No se pudo obtener respuesta.",
                },
            ]);
        } catch {
            setMessages([
                ...newMessages,
                {
                    role: "assistant",
                    content: "Ocurrió un error al consultar.",
                },
            ]);
        }
    }

    return (
        <div className="flex h-screen bg-[#0b1020] text-white">
            <aside className="hidden w-72 border-r border-white/10 bg-[#0a0f1d] lg:flex lg:flex-col">
                <div className="border-b border-white/10 px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-lg font-bold text-cyan-300">
                            EG
                        </div>
                        <div>
                            <div className="text-lg font-semibold">EmpresaGPT</div>
                            <div className="text-sm text-slate-400">Chat documental</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 px-4 py-6">
                    <div className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Navegación
                    </div>

                    <div className="space-y-2">
                        <a
                            href="/dashboard"
                            className="block rounded-2xl px-4 py-3 text-slate-300 transition hover:bg-white/5"
                        >
                            Dashboard
                        </a>
                        <a
                            href="/chat"
                            className="block rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-cyan-300"
                        >
                            Chat
                        </a>
                    </div>
                </div>
            </aside>

            <div className="flex flex-1 flex-col">
                <header className="border-b border-white/10 bg-[#0d1324]/90 px-6 py-5 backdrop-blur">
                    <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
                            <p className="mt-1 text-sm text-slate-400">
                                Consultá los documentos cargados de tu empresa.
                            </p>
                        </div>

                        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300">
                            IA documental
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto">
                    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
                        <div className="flex-1 space-y-6">
                            {messages.length === 0 ? (
                                <div className="flex h-full min-h-[60vh] items-center justify-center">
                                    <div className="max-w-2xl text-center">
                                        <h2 className="text-3xl font-semibold tracking-tight text-white">
                                            Empezá una conversación con tu empresa
                                        </h2>
                                        <p className="mt-4 text-base leading-7 text-slate-400">
                                            Hacé preguntas sobre políticas, manuales o documentos internos.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"
                                            }`}
                                    >
                                        <div
                                            className={`max-w-3xl rounded-3xl px-5 py-4 leading-7 shadow-lg ${msg.role === "user"
                                                    ? "bg-cyan-400 text-slate-950"
                                                    : "border border-white/10 bg-[#121a2b] text-white"
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </main>

                <div className="border-t border-white/10 bg-[#0d1324]/95 p-4 backdrop-blur">
                    <div className="mx-auto flex w-full max-w-5xl gap-3">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Escribí tu pregunta..."
                            className="flex-1 rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-4 text-white outline-none transition focus:border-cyan-400"
                        />
                        <button
                            onClick={handleSend}
                            className="rounded-2xl bg-cyan-400 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300"
                        >
                            Enviar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}