"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAuthSession, type AuthSession } from "@/lib/auth";

type AppChromeProps = {
    children: React.ReactNode;
};

const navItems = [
    { href: "/", label: "Inicio" },
    { href: "/characters", label: "Personajes" },
    { href: "/ranking", label: "Ranking" },
];

function isActivePath(pathname: string, href: string) {
    if (href === "/") {
        return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppChrome({ children }: AppChromeProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [session, setSession] = useState<AuthSession | null>(null);

    const isGameRoute = pathname === "/play" || pathname === "/editor";

    useEffect(() => {
        if (isGameRoute) {
            return;
        }

        let cancelled = false;

        fetchAuthSession().then((result) => {
            if (!cancelled) {
                setSession(result);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [pathname, isGameRoute]);

    if (isGameRoute) {
        return <>{children}</>;
    }

    return (
        <>
            <header className="sticky top-0 z-50 border-b border-[#3d2719] bg-[#070a12]/95 backdrop-blur-md">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
                    <Link href="/" className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold tracking-wider text-white">
                            CSAO<span className="text-[#d4a359]">2</span>
                        </span>
                        <span className="text-[10px] font-medium tracking-wider text-white/90">
                            beta
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-1.5 border-l border-r border-[#3d2719]/80 px-4 md:flex">
                        {navItems.map((item) => {
                            const active = isActivePath(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition rounded-lg ${
                                        active
                                            ? "bg-[#5c2b0e] text-white border border-[#8c582d]"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-[#0b0f19]"
                                    }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-3">
                        <Link
                            href={session ? "/characters" : "/register"}
                            className="hidden sm:inline-flex items-center game-btn-bronze px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-md"
                        >
                            {session ? "Jugar" : "Jugar gratis"}
                        </Link>

                        {session && Boolean(session.characters?.some((c) => c.isAdministrator) || session.account?.email?.toLowerCase() === "admin@local.com") && (
                            <Link
                                href="/editor"
                                className="hidden sm:inline-flex items-center rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-300 transition hover:bg-amber-900/40 hover:text-amber-100"
                            >
                                Editor
                            </Link>
                        )}

                        {session ? (
                            <div className="flex items-center gap-2">
                                <span className="hidden text-xs font-medium text-slate-300 md:inline">
                                    {session.account.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await fetch("/api/auth/signout", {
                                            method: "POST",
                                        });
                                        setSession(null);
                                        router.push("/login");
                                        router.refresh();
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg border border-[#3d2719] bg-[#0b0f19] p-1.5 text-slate-400 transition hover:border-[#6e4624] hover:text-slate-200"
                                    aria-label="Cerrar sesion"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <Link
                                href="/login"
                                className="inline-flex items-center rounded-lg border border-[#3d2719] bg-[#0b0f19] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition hover:text-white hover:border-[#6e4624]"
                            >
                                Ingresar
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <div className="md:hidden border-b border-[#3d2719] bg-[#070a12] px-4 py-2">
                <nav className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto">
                    {navItems.map((item) => {
                        const active = isActivePath(pathname, item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                                    active
                                        ? "bg-[#5c2b0e] text-white border border-[#8c582d]"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {children}
        </>
    );
}
