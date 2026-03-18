"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DocumentItem = {
    id: string;
    filename: string;
    created_at: string;
};

type UploadMode = "pdf" | "manual";
type MessageType = "success" | "error" | "";

type SourceItem = {
    documentId: string;
    preview: string;
    score: number;
};

export default function DashboardPage() {
    const [mode, setMode] = useState<UploadMode>("pdf");

    const [companyId, setCompanyId] = useState("");
    const [filename, setFilename] = useState("");
    const [text, setText] = useState("");
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");

    const [uploading, setUploading] = useState(false);
    const [pdfUploading, setPdfUploading] = useState(false);
    const [asking, setAsking] = useState(false);

    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState<MessageType>("");
    const [lastChunks, setLastChunks] = useState<number | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [documents, setDocuments] = useState<DocumentItem[]>([]);
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [sources, setSources] = useState<SourceItem[]>([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");

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

    async function handleAsk() {
        try {
            if (!companyId.trim()) {
                setAnswer("Primero ingresá el Company ID.");
                setSources([]);
                return;
            }

            if (!question.trim()) {
                setAnswer("Escribí una pregunta.");
                setSources([]);
                return;
            }

            setAsking(true);
            setAnswer("");
            setSources([]);

            const res = await fetch("/api/ask", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    companyId,
                    question,
                    documentId: selectedDocumentId || undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setAnswer(data.error || "No se pudo obtener una respuesta.");
                setSources([]);
                return;
            }

            setAnswer(data.answer || "Sin respuesta.");
            setSources(data.sources || []);
        } catch {
            setAnswer("Ocurrió un error al consultar.");
            setSources([]);
        } finally {
            setAsking(false);
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

            if (selectedDocumentId === documentId) {
                setSelectedDocumentId("");
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
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.10),_transparent_22%),linear-gradient(to_bottom,_#020617,_#0f172a_38%,_#020617)] text-white">
            <div className="flex min-h-screen">
                <aside className="hidden w-72 border-r border-white/10 bg-slate-950/70 backdrop-blur-xl lg:flex lg:flex-col">
                    <div className="border-b border-white/10 px-6 py-6">
                        <div className="inline-flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-lg font-bold text-cyan-300">
                                EG
                            </div>
                            <div>
                                <div className="text-lg font-semibold">EmpresaGPT</div>
                                <div className="text-sm text-slate-400">Panel documental</div>
                            </div>
                        </div>
                    </div>

                    <nav className="flex-1 px-4 py-6">
                        <div className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                            Navegación
                        </div>

                        <div className="space-y-2">
                            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-cyan-300">
                                Dashboard
                            </div>
                            <div className="rounded-2xl px-4 py-3 text-slate-300">
                                Documentos
                            </div>
                            <div className="rounded-2xl px-4 py-3 text-slate-300">
                                Consultas
                            </div>
                        </div>

                        <div className="mt-8">
                            <div className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                                Estado
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                                <div className="text-sm text-slate-400">Sistema</div>
                                <div className="mt-3 flex items-center gap-3">
                                    <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.9)]" />
                                    <div className="font-medium text-white">Operativo</div>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-slate-300">
                                    Listo para procesar documentos y responder consultas.
                                </p>
                            </div>
                        </div>
                    </nav>

                    <div className="border-t border-white/10 p-4">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                            <div className="text-sm text-slate-400">Última carga</div>
                            <div className="mt-2 text-3xl font-semibold text-white">
                                {lastChunks ?? "—"}
                            </div>
                            <div className="mt-2 text-sm text-slate-300">
                                Fragmentos generados
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="flex-1">
                    <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur-xl">
                        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
                            <div>
                                <div className="text-sm text-slate-400">Workspace</div>
                                <h1 className="text-2xl font-semibold tracking-tight">
                                    Dashboard principal
                                </h1>
                            </div>

                            <div className="hidden items-center gap-3 sm:flex">
                                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300">
                                    Demo premium
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
                        <section className="mb-8 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_0_60px_rgba(34,211,238,0.05)] backdrop-blur-xl">
                                <div className="px-6 py-6 lg:px-8">
                                    <div className="mb-4 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1.5 text-sm text-cyan-300">
                                        Asistente documental con IA
                                    </div>

                                    <h2 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                                        Subí documentos y preguntale a la empresa
                                    </h2>

                                    <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                                        Cargá conocimiento de dos maneras: PDF o texto manual.
                                        Después hacé preguntas en lenguaje natural.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4">
                                <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                                    <div className="text-sm text-slate-400">Texto actual</div>
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

                                <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                                    <div className="text-sm text-slate-400">Cómo usarlo</div>
                                    <div className="mt-3 space-y-2 text-sm text-slate-200">
                                        <div>1. Ingresá el Company ID</div>
                                        <div>2. Elegí PDF o texto manual</div>
                                        <div>3. Cargá el documento</div>
                                        <div>4. Preguntá a la IA</div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                            <div className="space-y-6">
                                <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
                                    <div className="mb-6">
                                        <h3 className="text-2xl font-semibold">Carga documental</h3>
                                        <p className="mt-1 text-sm text-slate-400">
                                            Elegí una sola forma de carga: PDF o texto manual.
                                        </p>
                                    </div>

                                    <div className="mb-5">
                                        <label className="mb-2 block text-sm font-medium text-slate-200">
                                            Company ID
                                        </label>
                                        <input
                                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
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
                                                Usá esta opción si ya tenés un archivo PDF. No hace falta
                                                completar el campo de texto manual.
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
                                                    className="block w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-medium file:text-slate-950 hover:file:bg-cyan-300"
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
                                                Usá esta opción si querés pegar un texto directamente.
                                                No hace falta seleccionar un PDF.
                                            </div>

                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-slate-200">
                                                    Nombre del documento
                                                </label>
                                                <input
                                                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
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
                                                    className="min-h-[260px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
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

                                <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
                                    <div className="mb-4 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-xl font-semibold">
                                                Documentos cargados
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-400">
                                                Se actualizan según el Company ID.
                                            </p>
                                        </div>
                                    </div>

                                    {documentsLoading ? (
                                        <div className="text-sm text-slate-300">
                                            Cargando documentos...
                                        </div>
                                    ) : documents.length === 0 ? (
                                        <div className="text-sm text-slate-400">
                                            Todavía no hay documentos cargados para esta empresa.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {documents.map((doc) => (
                                                <div
                                                    key={doc.id}
                                                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3"
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
                                <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
                                    <div className="mb-6">
                                        <h3 className="text-2xl font-semibold">
                                            Consulta inteligente
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-400">
                                            Hacé una pregunta sobre los documentos ya cargados.
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-200">
                                                Documento (opcional)
                                            </label>

                                            <select
                                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                                value={selectedDocumentId}
                                                onChange={(e) => setSelectedDocumentId(e.target.value)}
                                            >
                                                <option value="">Todos los documentos</option>

                                                {documents.map((doc) => (
                                                    <option key={doc.id} value={doc.id}>
                                                        {doc.filename}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-200">
                                                Pregunta
                                            </label>
                                            <input
                                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                                                placeholder="Ej: ¿Qué dice la política sobre los gastos?"
                                                value={question}
                                                onChange={(e) => setQuestion(e.target.value)}
                                            />
                                        </div>

                                        <button
                                            onClick={handleAsk}
                                            disabled={asking}
                                            className="w-full rounded-2xl bg-white px-5 py-3 font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {asking ? "Consultando..." : "Preguntar a la IA"}
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-xl font-semibold">
                                                Respuesta generada
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-400">
                                                Basada en el conocimiento procesado.
                                            </p>
                                        </div>

                                        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                                            IA
                                        </div>
                                    </div>

                                    <div className="min-h-[320px] rounded-2xl border border-white/10 bg-slate-950/70 p-5">
                                        <div className="whitespace-pre-wrap leading-7 text-slate-200">
                                            {answer ||
                                                "Todavía no hay respuesta. Primero cargá uno o más documentos y después hacé una pregunta."}
                                        </div>

                                        {sources.length > 0 && (
                                            <div className="mt-6 border-t border-white/10 pt-5">
                                                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-300">
                                                    Fuentes utilizadas
                                                </div>

                                                <div className="space-y-3">
                                                    {sources.map((source, index) => (
                                                        <div
                                                            key={`${source.documentId}-${index}`}
                                                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                                        >
                                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                                <div className="text-sm font-medium text-white">
                                                                    Documento: {source.documentId}
                                                                </div>
                                                                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-300">
                                                                    Relevancia: {Math.round((source.score || 0) * 100)}%
                                                                </div>
                                                            </div>

                                                            <div className="text-sm leading-6 text-slate-300">
                                                                {source.preview}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}