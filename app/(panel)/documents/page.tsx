"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyContext } from "@/hooks/useCompanyContext";

type DocumentItem = {
    id: string;
    filename: string;
    created_at: string;
};

type UploadMode = "pdf" | "manual";
type MessageType = "success" | "error" | "";

export default function DocumentsPage() {
    const { companyId, setCompanyId } = useCompanyContext();

    const [mode, setMode] = useState<UploadMode>("pdf");
    const [filename, setFilename] = useState("");
    const [text, setText] = useState("");
    const [uploading, setUploading] = useState(false);
    const [pdfUploading, setPdfUploading] = useState(false);
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState<MessageType>("");
    const [lastChunks, setLastChunks] = useState<number | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [documents, setDocuments] = useState<DocumentItem[]>([]);
    const [documentsLoading, setDocumentsLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const textStats = useMemo(() => {
        const characters = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        return { characters, words };
    }, [text]);

    async function loadDocuments(currentCompanyId: string) {
        if (!currentCompanyId) {
            setDocuments([]);
            return;
        }

        try {
            setDocumentsLoading(true);

            const res = await fetch(
                `/api/documents?companyId=${encodeURIComponent(currentCompanyId)}`
            );
            const data = await res.json();

            if (!res.ok) {
                return;
            }

            setDocuments(data.documents || []);
        } finally {
            setDocumentsLoading(false);
        }
    }

    useEffect(() => {
        if (companyId) {
            loadDocuments(companyId);
        } else {
            setDocuments([]);
        }
    }, [companyId]);

    async function handleManualUpload() {
        try {
            if (!companyId.trim()) {
                setMessageType("error");
                setMessage("Primero ingresá el Company ID.");
                return;
            }

            if (!filename.trim() || !text.trim()) {
                setMessageType("error");
                setMessage("Para carga manual completá el nombre y el texto.");
                return;
            }

            setUploading(true);
            setMessage("");
            setMessageType("");

            const res = await fetch("/api/ingest", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    companyId,
                    filename,
                    text,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessageType("error");
                setMessage(data.error || "No se pudo procesar el texto manual.");
                return;
            }

            setLastChunks(data.chunksCreated ?? null);
            setFilename("");
            setText("");
            setMessageType("success");
            setMessage(
                `Documento manual cargado correctamente. Se generaron ${data.chunksCreated} fragmentos.`
            );

            await loadDocuments(companyId);
        } catch {
            setMessageType("error");
            setMessage("Ocurrió un error al cargar el texto manual.");
        } finally {
            setUploading(false);
        }
    }

    async function handlePdfUpload() {
        try {
            if (!companyId.trim()) {
                setMessageType("error");
                setMessage("Primero ingresá el Company ID.");
                return;
            }

            if (!pdfFile) {
                setMessageType("error");
                setMessage("Seleccioná un archivo PDF.");
                return;
            }

            setPdfUploading(true);
            setMessage("");
            setMessageType("");

            const formData = new FormData();
            formData.append("companyId", companyId);
            formData.append("file", pdfFile);

            const res = await fetch("/api/upload-pdf", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                setMessageType("error");
                setMessage(data.error || "No se pudo procesar el PDF.");
                return;
            }

            setLastChunks(data.chunksCreated ?? null);
            setPdfFile(null);

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            setMessageType("success");
            setMessage(
                `PDF cargado correctamente: ${data.document?.filename || data.filename || "archivo"
                }. Se generaron ${data.chunksCreated} fragmentos.`
            );

            await loadDocuments(companyId);
        } catch {
            setMessageType("error");
            setMessage("Ocurrió un error al subir el PDF.");
        } finally {
            setPdfUploading(false);
        }
    }

    async function handleDeleteDocument(documentId: string) {
        try {
            if (!companyId.trim()) {
                setMessageType("error");
                setMessage("Primero ingresá el Company ID.");
                return;
            }

            const confirmed = window.confirm(
                "¿Seguro que querés eliminar este documento? Esta acción no se puede deshacer."
            );

            if (!confirmed) {
                return;
            }

            setMessage("");
            setMessageType("");

            const res = await fetch("/api/documents/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    companyId,
                    documentId,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setMessageType("error");
                setMessage(data.error || "No se pudo eliminar el documento.");
                return;
            }

            setMessageType("success");
            setMessage("Documento eliminado correctamente.");

            await loadDocuments(companyId);
        } catch {
            setMessageType("error");
            setMessage("Ocurrió un error al eliminar el documento.");
        }
    }

    function clearCurrentForm() {
        setFilename("");
        setText("");
        setPdfFile(null);
        setMessage("");
        setMessageType("");

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function getMessageClasses() {
        if (messageType === "error") {
            return "mt-5 whitespace-pre-wrap rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm leading-6 text-rose-300";
        }

        return "mt-5 whitespace-pre-wrap rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-sm leading-6 text-emerald-300";
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-semibold">Documentos</h1>
                <p className="mt-1 text-slate-400">
                    Cargá, administrá y eliminá el conocimiento de la empresa.
                </p>
            </div>

            <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                <div className="space-y-6">
                    <div className="rounded-[28px] border border-white/10 bg-[#121a2b] p-6 shadow-2xl">
                        <div className="mb-6">
                            <h2 className="text-2xl font-semibold">Carga documental</h2>
                            <p className="mt-1 text-sm text-slate-400">
                                Elegí una sola forma de carga: PDF o texto manual.
                            </p>
                        </div>

                        <div className="mb-5">
                            <label className="mb-2 block text-sm font-medium text-slate-200">
                                Company ID
                            </label>
                            <input
                                className="w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                placeholder="Ej: 9f7b1e4c-..."
                                value={companyId}
                                onChange={(e) => setCompanyId(e.target.value)}
                            />
                        </div>

                        <div className="mb-5 flex gap-3">
                            <button
                                onClick={() => {
                                    setMode("pdf");
                                    clearCurrentForm();
                                }}
                                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${mode === "pdf"
                                        ? "bg-cyan-400 text-slate-950"
                                        : "border border-white/10 bg-white/5 text-white"
                                    }`}
                            >
                                Subir PDF
                            </button>

                            <button
                                onClick={() => {
                                    setMode("manual");
                                    clearCurrentForm();
                                }}
                                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${mode === "manual"
                                        ? "bg-cyan-400 text-slate-950"
                                        : "border border-white/10 bg-white/5 text-white"
                                    }`}
                            >
                                Pegar texto manual
                            </button>
                        </div>

                        {mode === "pdf" ? (
                            <div className="space-y-5">
                                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-100">
                                    Usá esta opción si ya tenés un archivo PDF. No hace falta completar el campo de texto manual.
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-200">
                                        Archivo PDF
                                    </label>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/pdf"
                                        onChange={(e) =>
                                            setPdfFile(e.target.files?.[0] || null)
                                        }
                                        className="block w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-medium file:text-slate-950 hover:file:bg-cyan-300"
                                    />

                                    {pdfFile && (
                                        <div className="mt-2 text-sm text-slate-300">
                                            PDF seleccionado: {pdfFile.name}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                        onClick={handlePdfUpload}
                                        disabled={pdfUploading}
                                        className="flex-1 rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {pdfUploading ? "Subiendo PDF..." : "Subir PDF"}
                                    </button>

                                    <button
                                        onClick={clearCurrentForm}
                                        className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:bg-white/10"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-100">
                                    Usá esta opción si querés pegar un texto directamente. No hace falta seleccionar un PDF.
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-200">
                                        Nombre del documento
                                    </label>
                                    <input
                                        className="w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                        placeholder="Ej: Política interna de vacaciones"
                                        value={filename}
                                        onChange={(e) => setFilename(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-200">
                                        Texto del documento
                                    </label>
                                    <textarea
                                        className="min-h-[260px] w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                        placeholder="Pegá aquí el procedimiento, reglamento o manual..."
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                        onClick={handleManualUpload}
                                        disabled={uploading}
                                        className="flex-1 rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {uploading
                                            ? "Procesando texto..."
                                            : "Cargar texto manual"}
                                    </button>

                                    <button
                                        onClick={clearCurrentForm}
                                        className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:bg-white/10"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </div>
                        )}

                        {message && <div className={getMessageClasses()}>{message}</div>}
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#121a2b] p-6 shadow-2xl">
                        <div className="mb-4">
                            <h2 className="text-xl font-semibold">Documentos cargados</h2>
                            <p className="mt-1 text-sm text-slate-400">
                                Se actualizan según el Company ID.
                            </p>
                        </div>

                        {documentsLoading ? (
                            <div className="text-sm text-slate-300">Cargando documentos...</div>
                        ) : documents.length === 0 ? (
                            <div className="text-sm text-slate-400">
                                Todavía no hay documentos cargados para esta empresa.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-medium text-white">
                                                    {doc.filename}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-400">
                                                    {new Date(doc.created_at).toLocaleString()}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleDeleteDocument(doc.id)}
                                                className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-[28px] border border-white/10 bg-[#121a2b] p-6">
                        <div className="text-sm text-slate-400">Estado actual</div>
                        <div className="mt-3 text-3xl font-semibold text-white">
                            {lastChunks ?? "—"}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                            Últimos fragmentos generados
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#121a2b] p-6">
                        <div className="text-sm text-slate-400">Texto manual</div>
                        <div className="mt-3 text-2xl font-semibold text-white">
                            {textStats.words}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                            palabras escritas manualmente
                        </div>
                        <div className="mt-4 text-sm text-slate-400">
                            {textStats.characters} caracteres
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-[#121a2b] p-6">
                        <div className="text-sm text-slate-400">Siguiente paso</div>
                        <div className="mt-3 text-sm leading-7 text-slate-300">
                            Después de cargar documentos, abrí la pantalla de Chat y empezá la conversación con la IA.
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}