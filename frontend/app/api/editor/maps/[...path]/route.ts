import { NextResponse } from "next/server";
import { forwardToGameServer, requireEditorAdmin } from "../../shared";

/**
 * Proxy autenticado hacia `/editor/maps/*` del servidor de juego.
 * Cada peticion revalida la sesion: no hay identidad provista por el cliente.
 */

type RouteContext = { params: Promise<{ path?: string[] }> };

async function resolveTargetPath(context: RouteContext): Promise<string | null> {
    const { path } = await context.params;
    const segments = path ?? [];

    // Solo ids numericos y subrutas conocidas; nada de path traversal.
    if (segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
        return null;
    }

    return `/editor/maps${segments.length > 0 ? `/${segments.join("/")}` : ""}`;
}

async function handle(request: Request, context: RouteContext, method: string): Promise<NextResponse> {
    const check = await requireEditorAdmin();

    if (!check.ok) {
        return check.response;
    }

    const targetPath = await resolveTargetPath(context);

    if (!targetPath) {
        return NextResponse.json({ error: "Ruta invalida." }, { status: 400 });
    }

    const body = method === "GET" ? undefined : await request.text();

    return forwardToGameServer(targetPath, method, check.admin, body);
}

export async function GET(request: Request, context: RouteContext) {
    return handle(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
    return handle(request, context, "POST");
}

export async function PUT(request: Request, context: RouteContext) {
    return handle(request, context, "PUT");
}
