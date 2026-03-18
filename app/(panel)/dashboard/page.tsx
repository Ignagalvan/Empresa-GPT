"use client";

import Link from "next/link";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useState } from "react";

export default function DashboardPage() {
    const { companyId, setCompanyId } = useCompanyContext();

    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleAsk() {
        if (!question.trim()) return;

        if (!companyId) {
            setAnswer("Primero ingresá el Company ID.");
            return;
        }

        setLoading(true);
        setAnswer("");

        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    companyId,
                    question,
                }),
            });

            const data = await res.json();
            setAnswer(data.answer || "No se obtuvo respuesta.");
        } catch {
            setAnswer("Error al consultar.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold">Dashboard</h1>
                    <p className="mt-1 text-slate-400">
                        Gestión de documentos y consultas.
                    </p>
                </div>

                <div className="flex gap-3">
                    <Link
                        href="/documents"
                        className="rounded-full border border-white/10 bg-white/5 px-5 py-2 font-medium text-white transition hover:bg-white/10"
                    >
                        Documentos
                    </Link>

                    <Link
                        href="/chat"
                        className="rounded-full bg-cyan-400 px-5 py-2 font-semibold text-slate-950 hover:bg-cyan-300"
                    >
                        Ir al chat
                    </Link>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121a2b] p-6">
                <label className="mb-2 block text-sm text-slate-400">
                    Company ID
                </label>
                <input
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    placeholder="Ej: aa463ecd-..."
                    className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none focus:border-cyan-400"
                />
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#121a2b] p-6 space-y-4">
                <h2 className="text-2xl font-semibold">Consulta rápida</h2>

                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Hacé una pregunta..."
                    className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none focus:border-cyan-400"
                />

                <button
                    onClick={handleAsk}
                    disabled={loading}
                    className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
                >
                    {loading ? "Consultando..." : "Consultar"}
                </button>

                {answer && (
                    <div className="rounded-xl border border-white/10 bg-[#0b1020] p-4">
                        {answer}
                    </div>
                )}
            </div>
        </div>
    );
}