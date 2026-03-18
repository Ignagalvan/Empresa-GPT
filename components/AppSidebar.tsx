"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function itemClass(active: boolean) {
    return active
        ? "block rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-cyan-300"
        : "block rounded-2xl px-4 py-3 text-slate-300 transition hover:bg-white/5";
}

export default function AppSidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden w-72 border-r border-white/10 bg-[#0a0f1d] lg:flex lg:flex-col">
            <div className="border-b border-white/10 px-6 py-6">
                <div className="inline-flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-lg font-bold text-cyan-300">
                        EG
                    </div>
                    <div>
                        <div className="text-lg font-semibold text-white">EmpresaGPT</div>
                        <div className="text-sm text-slate-400">Panel documental</div>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-4 py-6">
                <div className="mb-3 px-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Navegación
                </div>

                <div className="space-y-2">
                    <Link href="/dashboard" className={itemClass(pathname === "/dashboard")}>
                        Dashboard
                    </Link>

                    <Link href="/documents" className={itemClass(pathname === "/documents")}>
                        Documentos
                    </Link>

                    <Link href="/chat" className={itemClass(pathname === "/chat")}>
                        Chat
                    </Link>
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
        </aside>
    );
}