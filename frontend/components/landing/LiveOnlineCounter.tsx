"use client";

import { useEffect, useState } from "react";
import type { UserOnlineStatsResponse } from "@/lib/users-online-stats";

const REFRESH_MS = 60_000;

/**
 * Prueba social en vivo. Se auto-oculta cuando no hay nadie conectado: un
 * contador en cero en la landing resta mas de lo que suma.
 */
export default function LiveOnlineCounter() {
    const [online, setOnline] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const response = await fetch("/api/users-online-stats?hours=1", {
                    cache: "no-store",
                });

                if (!response.ok) {
                    return;
                }

                const result = (await response.json()) as UserOnlineStatsResponse;
                const latest = result.stats?.[result.stats.length - 1];

                if (!cancelled) {
                    setOnline(latest?.totalUsers ?? null);
                }
            } catch {
                if (!cancelled) {
                    setOnline(null);
                }
            }
        };

        void load();
        const interval = setInterval(load, REFRESH_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    if (online === null || online < 1) {
        return null;
    }

    return (
        <div className="inline-flex items-center gap-2 rounded-full border border-[#3d2719] bg-[#080b12] px-4 py-1.5">
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-slate-300">
                {online} {online === 1 ? "jugador" : "jugadores"} en línea
            </span>
        </div>
    );
}
