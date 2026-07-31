"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EditorApiError, fetchEditorSession, type EditorSession } from "../../lib/editor/api";
import { EditorShell } from "../../components/editor/EditorShell";

/**
 * Editor de mapas. El gate visual de aca es solo UX: la barrera real esta en
 * los route handlers de `/api/editor/*`, que revalidan la sesion contra la api
 * en cada peticion.
 */
export default function EditorPage() {
    const [session, setSession] = useState<EditorSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [initialMapId, setInitialMapId] = useState(1);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const requested = Number.parseInt(params.get("map") ?? "", 10);

        if (Number.isInteger(requested) && requested > 0) {
            setInitialMapId(requested);
        }

        let cancelled = false;

        void fetchEditorSession()
            .then((value) => {
                if (!cancelled) {
                    setSession(value);
                }
            })
            .catch((err: unknown) => {
                if (cancelled) {
                    return;
                }

                setError(
                    err instanceof EditorApiError
                        ? err.message
                        : "No se pudo verificar tu sesion.",
                );
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (error) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-slate-300">
                <h1 className="text-lg font-semibold text-slate-100">Editor de mapas</h1>
                <p className="max-w-md text-sm text-red-400">{error}</p>
                <Link href="/" className="text-sm text-cyan-400 underline">
                    Volver al inicio
                </Link>
            </main>
        );
    }

    if (!session) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
                Verificando permisos...
            </main>
        );
    }

    return <EditorShell initialMapId={initialMapId} />;
}
