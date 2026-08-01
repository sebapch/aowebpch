import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthErrorResponse, AuthSession } from "../../../lib/auth";
import { normalizeErrorPayload } from "../../../lib/api-errors";
import { AUTH_COOKIE_NAME } from "../../../lib/auth-session";
import { getApiBaseUrl } from "../../../lib/api-base-url";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const API_REQUEST_TIMEOUT_MS = 8000;

type ApiAuthResponse = AuthSession & {
    sessionToken: string;
};

type CookieRequest = Pick<Request, "headers" | "url">;

export async function fetchApi(
    path: string,
    init?: RequestInit,
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
        () => controller.abort(),
        API_REQUEST_TIMEOUT_MS,
    );

    try {
        return await fetch(`${getApiBaseUrl()}${path}`, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return NextResponse.json(
                {
                    error: `La API no respondio dentro de ${API_REQUEST_TIMEOUT_MS}ms.`,
                },
                { status: 504 },
            );
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function proxyJsonResponse(
    response: Response,
): Promise<NextResponse> {
    const result = normalizeErrorPayload(await response.json());
    return NextResponse.json(result, { status: response.status });
}

function setSessionCookie(
    response: NextResponse,
    token: string,
    request: CookieRequest,
): NextResponse {
    response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookies(request),
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
}

export async function forwardSessionJsonRequest(
    path: string,
    init: RequestInit,
    request: CookieRequest,
): Promise<NextResponse> {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetchApi(path, {
        ...init,
        headers,
        cache: "no-store",
    });

    if (response.status === 401) {
        const cleared = await clearSessionCookie(request);
        const proxied = await proxyJsonResponse(response);

        return NextResponse.json(await proxied.json(), {
            status: proxied.status,
            headers: cleared.headers,
        });
    }

    return setSessionCookie(await proxyJsonResponse(response), token, request);
}

function shouldUseSecureCookies(request: CookieRequest): boolean {
    const forwardedProto = request.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim();

    if (forwardedProto) {
        return forwardedProto === "https";
    }

    return new URL(request.url).protocol === "https:";
}

/**
 * IP del cliente para que la api pueda aplicar limites por origen. Sin esto la
 * api veria siempre la IP del servidor de Next y un solo atacante consumiria
 * el cupo de todos.
 */
export function getClientIp(request: CookieRequest): string {
    const headers = request.headers;

    return (
        headers.get("cf-connecting-ip")?.trim() ||
        headers.get("x-real-ip")?.trim() ||
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        ""
    );
}

export async function forwardAuthRequest(
    path: string,
    body: unknown,
    request: CookieRequest,
): Promise<NextResponse> {
    const response = await fetchApi(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": getClientIp(request),
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const result = normalizeErrorPayload(
        (await response.json()) as ApiAuthResponse | AuthErrorResponse,
    );

    if (!response.ok) {
        return NextResponse.json(result, { status: response.status });
    }

    const nextResponse = NextResponse.json(result);

    if (!("sessionToken" in result)) {
        return nextResponse;
    }

    setSessionCookie(nextResponse, result.sessionToken, request);

    return NextResponse.json(
        {
            account: result.account,
            characters: result.characters,
            selectedCharacterId: result.selectedCharacterId,
        },
        {
            status: nextResponse.status,
            headers: nextResponse.headers,
        },
    );
}

export async function getSessionTokenFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value?.trim();

    return token || null;
}

export async function fetchApiSession(token: string): Promise<NextResponse> {
    const response = await fetchApi("/auth/session", {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    return proxyJsonResponse(response);
}

export async function forwardLogout(
    token: string | null,
    request: CookieRequest,
): Promise<NextResponse> {
    if (token) {
        await fetchApi("/auth/logout", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });
    }

    return clearSessionCookie(request);
}

export async function readSessionFromApi(
    request: CookieRequest,
): Promise<NextResponse> {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const response = await fetchApiSession(token);

    if (response.status === 401) {
        const cleared = await clearSessionCookie(request);
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401, headers: cleared.headers },
        );
    }

    return setSessionCookie(response, token, request);
}

export async function clearSessionCookie(
    request: CookieRequest,
): Promise<NextResponse> {
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookies(request),
        path: "/",
        maxAge: 0,
    });
    return response;
}
