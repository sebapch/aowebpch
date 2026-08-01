"use client";

import Link from "next/link";
import { useAuthRedirect } from "../hooks/useAuthRedirect";

export default function HomePage() {
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });

    if (loading || !session) {
        return (
            <main className="flex min-h-screen items-center justify-center csao-bg px-4 text-slate-100">
                <div className="game-card px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Cargando inicio...
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen csao-bg px-4 py-10 text-slate-100">
            <div className="mx-auto max-w-5xl space-y-8">
                {/* Clean Hero Section */}
                <section className="game-card p-6 md:p-8 shadow-xl">
                    <div className="max-w-3xl space-y-4">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                                Argentum Online Competitivo
                            </span>
                            <h1 className="text-3xl font-black uppercase tracking-wider text-white md:text-5xl">
                                CSAO<span className="text-[#d4a359]">2</span>
                            </h1>
                        </div>

                        <p className="text-sm text-slate-300 leading-relaxed font-normal">
                            Arena competitiva basada en partidas por salas (lobbies), competencia de clanes y combates en equipo con el sistema de juego de Argentum Online.
                        </p>

                        <div className="flex flex-wrap items-center gap-3 pt-3">
                            <Link
                                href="/characters"
                                prefetch={false}
                                className="game-btn-bronze px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg"
                            >
                                Personajes
                            </Link>
                            <Link
                                href="/ranking"
                                prefetch={false}
                                className="rounded-xl border border-[#3d2719] bg-[#080b12] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 transition hover:border-[#6e4624] hover:text-white"
                            >
                                Ranking Global
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Main Action Modules */}
                <section className="grid gap-4 md:grid-cols-3">
                    <Link
                        href="/characters"
                        prefetch={false}
                        className="group game-card p-6 shadow-md transition hover:border-[#6e4624]"
                    >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                            Gestión
                        </span>
                        <h3 className="mt-2 text-lg font-bold text-white group-hover:text-slate-200">
                            Mis Personajes
                        </h3>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            Crea, equipa y administra tus personajes para acceder a las salas de partida.
                        </p>
                    </Link>

                    <Link
                        href="/ranking"
                        prefetch={false}
                        className="group game-card p-6 shadow-md transition hover:border-[#6e4624]"
                    >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                            Competencia
                        </span>
                        <h3 className="mt-2 text-lg font-bold text-white group-hover:text-slate-200">
                            Tabla de Posiciones
                        </h3>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            Consulta la clasificación de los mejores tiradores y hechiceros en tiempo real.
                        </p>
                    </Link>

                    <Link
                        href="/updates"
                        prefetch={false}
                        className="group game-card p-6 shadow-md transition hover:border-[#6e4624]"
                    >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                            Servidores
                        </span>
                        <h3 className="mt-2 text-lg font-bold text-white group-hover:text-slate-200">
                            Novedades
                        </h3>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            Reporte de parches, balance de hechizos y próximos mapas competitivos.
                        </p>
                    </Link>
                </section>

                {/* About Game Section */}
                <section className="game-card p-6 md:p-8 shadow-md">
                    <h2 className="text-base font-bold uppercase tracking-wider text-white border-b border-[#3d2719] pb-3">
                        Acerca de CSAO2
                    </h2>
                    <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-300">
                        <p>
                            CSAO2 combina las mecánicas medievales de Argentum Online con un formato dinámico de salas competitivas y emparejamiento rápido.
                        </p>
                        <p>
                            El juego se ejecuta directamente en navegador web con motor de renderizado ultrarrápido y soporte de red optimizado.
                        </p>
                    </div>
                </section>
            </div>
        </main>
    );
}
