"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthErrorResponse, AuthSession } from "@/lib/auth";

/**
 * CTA principal de la landing publica. La landing se renderiza en el servidor
 * para que sea indexable, asi que la sesion se resuelve aca en el cliente y
 * solo cambia el destino de los botones.
 */
export default function LandingCta() {
    const [session, setSession] = useState<AuthSession | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch("/api/auth/me", { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) {
                    return null;
                }

                const result = (await response.json()) as
                    | AuthSession
                    | AuthErrorResponse;

                return "error" in result ? null : result;
            })
            .then((result) => {
                if (!cancelled) {
                    setSession(result);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSession(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
                <Link
                    href={session ? "/characters" : "/register"}
                    prefetch={false}
                    className="game-btn-bronze rounded-xl px-8 py-3 text-sm font-bold uppercase tracking-wider shadow-lg"
                >
                    {session ? "Mis personajes" : "Jugar gratis"}
                </Link>

                <Link
                    href="/ranking"
                    prefetch={false}
                    className="rounded-xl border border-[#3d2719] bg-[#080b12] px-8 py-3 text-sm font-bold uppercase tracking-wider text-slate-300 transition hover:border-[#6e4624] hover:text-white"
                >
                    Ver ranking
                </Link>
            </div>

            <p className="text-xs text-slate-500">
                Gratis. Sin descargas. Sin instalar nada.
            </p>
        </div>
    );
}
