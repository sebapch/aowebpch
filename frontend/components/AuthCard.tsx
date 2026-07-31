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

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

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
        <div className="mx-auto w-full max-w-md overflow-hidden rounded-[32px] border border-stone-700/70 bg-stone-950/88 text-stone-100 shadow-2xl backdrop-blur-md">
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top,#f59e0b33,transparent_55%),linear-gradient(135deg,#1c1917,#0f172a)] px-6 py-6">
                <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/75">
                    AOWeb
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-stone-50">
                    {mode === "login" ? "Iniciar sesion" : "Crear cuenta"}
                </h1>
                {mode === "register" ? (
                    <p className="mt-2 text-sm text-stone-300/80">
                        Tu nombre de usuario sera el nombre visible por defecto
                        en Arenas.
                    </p>
                ) : null}
            </div>

            <div className="p-6">
                <form className="space-y-3" onSubmit={submit}>
                    {mode === "register" ? (
                        <input
                            value={registerForm.name}
                            onChange={(event) =>
                                setRegisterForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                            className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                            placeholder="Usuario"
                            maxLength={DISPLAY_NAME_MAX_LENGTH}
                            required
                        />
                    ) : (
                        <input
                            value={loginForm.identifier}
                            onChange={(event) =>
                                setLoginForm((current) => ({
                                    ...current,
                                    identifier: event.target.value,
                                }))
                            }
                            className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                            placeholder="Usuario"
                            type="text"
                            autoComplete="username"
                            required
                        />
                    )}

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
                        className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                        placeholder="Contraseña"
                        type="password"
                        minLength={mode === "register" ? 4 : undefined}
                        required
                    />

                    {mode === "register" ? (
                        <input
                            value={registerForm.confirmPassword}
                            onChange={(event) =>
                                setRegisterForm((current) => ({
                                    ...current,
                                    confirmPassword: event.target.value,
                                }))
                            }
                            className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                            placeholder="Confirmar contraseña"
                            type="password"
                            minLength={4}
                            required
                        />
                    ) : null}

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                    >
                        {pending
                            ? "Procesando..."
                            : mode === "login"
                              ? "Entrar"
                              : "Crear cuenta"}
                    </button>
                </form>

                {error ? (
                    <div className="mt-4 rounded-2xl bg-rose-500/12 px-4 py-3 text-sm text-rose-200">
                        {error}
                    </div>
                ) : null}

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm text-stone-400">
                    <span>
                        {mode === "login"
                            ? "No tenes cuenta?"
                            : "Ya tenes una cuenta?"}
                    </span>
                    <div className="flex items-center gap-4">
                        {mode === "login" ? (
                            <Link
                                href="/forgot-password"
                                prefetch={false}
                                className="font-medium text-amber-200 transition hover:text-amber-100"
                            >
                                Olvide mi contraseña
                            </Link>
                        ) : null}
                        <Link
                            href={
                                mode === "login"
                                    ? `/register?redirect=${encodeURIComponent(redirectPath)}`
                                    : `/login?redirect=${encodeURIComponent(redirectPath)}`
                            }
                            prefetch={false}
                            className="font-medium text-cyan-300 transition hover:text-cyan-200"
                        >
                            {mode === "login" ? "Registrate" : "Iniciar sesión"}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
