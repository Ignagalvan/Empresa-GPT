"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export default function DashboardPage() {
    const { companyId, setCompanyId } = useCompanyContext();

    const [draftCompanyId, setDraftCompanyId] = useState(companyId);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [loading, setLoading] = useState(false);
    const [savedMessage, setSavedMessage] = useState("");

    useEffect(() => {
        setDraftCompanyId(companyId);
    }, [companyId]);

    function handleSaveCompanyId() {
        const trimmed = draftCompanyId.trim();
        setCompanyId(trimmed);
        setSavedMessage(
            trimmed
                ? "Empresa activa actualizada correctamente."
                : "Empresa activa eliminada."
        );

        setTimeout(() => {
            setSavedMessage("");
        }, 2500);
    }

    async function handleAsk() {
        if (!question.trim()) return;

        if (!companyId) {
            setAnswer("Primero definí una empresa activa.");
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

    const hasCompany = Boolean(companyId.trim());
    const hasDraftChanges = draftCompanyId.trim() !== companyId.trim();

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h1 className="text-3xl font-semibold">Dashboard</h1>
                <p className="mt-2 text-slate-400">
                    Gestión de documentos, empresa activa y consultas rápidas.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                        href="/documents"
                        className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                        Documentos
                    </Link>

                    <Link
                        href="/chat"
                        className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                    >
                        Ir al chat
                    </Link>
                </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">Empresa activa</h2>
                        <p className="mt-1 text-sm text-slate-400">
                            Esta empresa se usa en documentos, chat y consultas.
                        </p>
                    </div>

                    <div
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${hasCompany
                                ? "border border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
                                : "border border-amber-400/20 bg-amber-400/10 text-amber-100"
                            }`}
                    >
                        {hasCompany ? `Activa: ${companyId}` : "No hay empresa activa"}
                    </div>
                </div>

                <div className="mt-5 space-y-3">
                    <label className="block text-sm font-medium text-slate-200">
                        Company ID
                    </label>

                    <div className="flex flex-col gap-3 md:flex-row">
                        <input
                            value={draftCompanyId}
                            onChange={(e) => setDraftCompanyId(e.target.value)}
                            placeholder="Ej: empresa-demo o UUID"
                            className="flex-1 rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none focus:border-cyan-400"
                        />

                        <button
                            onClick={handleSaveCompanyId}
                            disabled={!hasDraftChanges}
                            className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Guardar empresa activa
                        </button>
                    </div>

                    <p className="text-sm text-slate-400">
                        Usá un identificador único por cliente para mantener separados los
                        documentos y las conversaciones.
                    </p>

                    {savedMessage && (
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                            {savedMessage}
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Consulta rápida</h2>
                <p className="mt-1 text-sm text-slate-400">
                    Probá una pregunta rápida sin salir del dashboard.
                </p>

                <div className="mt-5 space-y-4">
                    <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder={
                            hasCompany
                                ? "Hacé una pregunta..."
                                : "Primero guardá una empresa activa"
                        }
                        disabled={!hasCompany || loading}
                        rows={4}
                        className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                    />

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleAsk}
                            disabled={!hasCompany || !question.trim() || loading}
                            className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? "Consultando..." : "Consultar"}
                        </button>

                        {!hasCompany && (
                            <span className="text-sm text-amber-200">
                                Definí una empresa activa para consultar.
                            </span>
                        )}
                    </div>

                    {answer && (
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white">
                            {answer}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}