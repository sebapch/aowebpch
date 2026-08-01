"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { encryptAuthPayload } from "../lib/authPayloadEncryption";
import type { AuthErrorResponse, AuthSession } from "../lib/auth";
import {
    DISPLAY_NAME_MAX_LENGTH,
    getDisplayNameError,
} from "../lib/name-validation";

type AuthCardProps = {
    mode: "login" | "register";
};

const initialLoginForm = {
    identifier: "",
    password: "",
};

const initialRegisterForm = {
    name: "",
    password: "",
    confirmPassword: "",
};

export default function AuthCard({ mode }: AuthCardProps) {
    const router = useRouter();
    const [loginForm, setLoginForm] = useState(initialLoginForm);
    const [registerForm, setRegisterForm] = useState(initialRegisterForm);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectPath, setRedirectPath] = useState("/");

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const nextRedirect =
            new URLSearchParams(window.location.search)
                .get("redirect")
                ?.trim() || "/";
        setRedirectPath(nextRedirect);
    }, []);

    const submit = async (
        event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
    ) => {
        event.preventDefault();
        setPending(true);
        setError(null);

        try {
            if (
                mode === "register" &&
                registerForm.password !== registerForm.confirmPassword
            ) {
                throw new Error("Las passwords no coinciden");
            }

            if (mode === "register") {
                const nameError = getDisplayNameError(registerForm.name);

                if (nameError) {
                    throw new Error(nameError);
                }
            }

            const payload = mode === "login" ? loginForm : registerForm;

            const response = await fetch(`/api/auth/${mode}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: await encryptAuthPayload(payload),
            });

            const rawBody = await response.text();
            let result: AuthSession | AuthErrorResponse;

            try {
                result = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                throw new Error(
                    "El servidor no esta disponible en este momento. Intenta de nuevo en unos segundos.",
                );
            }

            if (!response.ok) {
                throw new Error(
                    "error" in result && result.error
                        ? result.error
                        : "No se pudo completar la operacion",
                );
            }

            router.push(redirectPath);
            router.refresh();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Ocurrio un error inesperado",
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-md overflow-hidden game-card text-slate-100 shadow-2xl">
            <div className="border-b border-[#3d2719] bg-[#080b12] px-6 py-5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                        Cuenta CSAO2
                    </span>
                    <span className="game-badge-circle h-6 w-6 text-[10px]">
                        AO
                    </span>
                </div>
                <h1 className="mt-2 text-2xl font-bold uppercase tracking-wider text-white">
                    {mode === "login" ? "Acceso de Personaje" : "Crear Cuenta"}
                </h1>
            </div>

            <div className="p-6">
                <form className="space-y-4" onSubmit={submit}>
                    {mode === "register" ? (
                        <div>
                            <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                                Nombre de Usuario
                            </label>
                            <input
                                value={registerForm.name}
                                onChange={(event) =>
                                    setRegisterForm((current) => ({
                                        ...current,
                                        name: event.target.value,
                                    }))
                                }
                                className="w-full rounded-xl border border-[#3d2719] bg-[#080b12] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#8c582d]"
                                placeholder="Usuario"
                                maxLength={DISPLAY_NAME_MAX_LENGTH}
                                required
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                                Usuario
                            </label>
                            <input
                                value={loginForm.identifier}
                                onChange={(event) =>
                                    setLoginForm((current) => ({
                                        ...current,
                                        identifier: event.target.value,
                                    }))
                                }
                                className="w-full rounded-xl border border-[#3d2719] bg-[#080b12] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#8c582d]"
                                placeholder="Nombre de usuario"
                                type="text"
                                autoComplete="username"
                                required
                            />
                        </div>
                    )}

                    <div>
                        <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                            Contraseña
                        </label>
                        <input
                            value={
                                mode === "login"
                                    ? loginForm.password
                                    : registerForm.password
                            }
                            onChange={(event) =>
                                mode === "login"
                                    ? setLoginForm((current) => ({
                                          ...current,
                                          password: event.target.value,
                                      }))
                                    : setRegisterForm((current) => ({
                                          ...current,
                                          password: event.target.value,
                                      }))
                            }
                            className="w-full rounded-xl border border-[#3d2719] bg-[#080b12] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#8c582d]"
                            placeholder="••••••••"
                            type="password"
                            minLength={mode === "register" ? 4 : undefined}
                            required
                        />
                    </div>

                    {mode === "register" ? (
                        <div>
                            <label className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                                Confirmar Contraseña
                            </label>
                            <input
                                value={registerForm.confirmPassword}
                                onChange={(event) =>
                                    setRegisterForm((current) => ({
                                        ...current,
                                        confirmPassword: event.target.value,
                                    }))
                                }
                                className="w-full rounded-xl border border-[#3d2719] bg-[#080b12] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#8c582d]"
                                placeholder="••••••••"
                                type="password"
                                minLength={4}
                                required
                            />
                        </div>
                    ) : null}

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full game-btn-bronze py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg disabled:opacity-50"
                    >
                        {pending
                            ? "Conectando..."
                            : mode === "login"
                              ? "Entrar al Juego"
                              : "Crear Cuenta"}
                    </button>
                </form>

                {error ? (
                    <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
                        {error}
                    </div>
                ) : null}

                <div className="mt-6 flex flex-col gap-3 border-t border-[#3d2719] pt-4 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                        <span>
                            {mode === "login"
                                ? "¿No tienes cuenta?"
                                : "¿Ya tienes una cuenta?"}
                        </span>
                        <Link
                            href={
                                mode === "login"
                                    ? `/register?redirect=${encodeURIComponent(redirectPath)}`
                                    : `/login?redirect=${encodeURIComponent(redirectPath)}`
                            }
                            prefetch={false}
                            className="font-bold text-[#d4a359] uppercase tracking-wider transition hover:text-white"
                        >
                            {mode === "login" ? "Registrate" : "Iniciar sesión"}
                        </Link>
                    </div>
                    {mode === "login" ? (
                        <div className="text-right">
                            <Link
                                href="/forgot-password"
                                prefetch={false}
                                className="text-slate-400 transition hover:text-slate-200"
                            >
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
