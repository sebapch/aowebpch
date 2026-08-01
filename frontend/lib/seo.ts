import type { Metadata } from "next";

const rawSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://aoweb.app";

const normalizedSiteUrl = rawSiteUrl.startsWith("http")
    ? rawSiteUrl
    : `https://${rawSiteUrl}`;

export const siteUrl = normalizedSiteUrl.replace(/\/+$/, "");
export const siteName = "CSAO2";
export const siteTagline = "Argentum Online Competitivo";
export const siteTitle = "CSAO2 - Argentum Online competitivo en el navegador";
export const siteDescription =
    "Jugá Argentum Online sin descargar ni instalar nada. Retos por equipos con veto de mapas, ranking Elo y voz por equipo, directo desde el navegador.";

// El grueso del trafico busca "argentum online", no la marca: CSAO2 no tiene
// volumen propio todavia. Las keywords de marca van ultimas, a proposito.
export const siteKeywords = [
    "argentum online",
    "jugar argentum online",
    "argentum online sin descargar",
    "argentum online en el navegador",
    "argentum online web",
    "servidor argentum online",
    "argentum online competitivo",
    "ao web",
    "CSAO2",
];

export function absoluteUrl(path = "/"): string {
    return new URL(path, `${siteUrl}/`).toString();
}

type PageMetadataInput = {
    title: string;
    description: string;
    path: string;
    keywords?: string[];
    imagePath?: string;
    twitterImagePath?: string;
};

export function buildPageMetadata({
    title,
    description,
    path,
    keywords = [],
    imagePath = "/opengraph-image",
    twitterImagePath = imagePath,
}: PageMetadataInput): Metadata {
    return {
        title,
        description,
        keywords: [...siteKeywords, ...keywords],
        alternates: {
            canonical: path,
        },
        openGraph: {
            type: "website",
            locale: "es_AR",
            url: absoluteUrl(path),
            siteName,
            title,
            description,
            images: [
                {
                    url: absoluteUrl(imagePath),
                    width: 1200,
                    height: 630,
                    alt: title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            creator: "@DamianCatanzaro",
            title,
            description,
            images: [absoluteUrl(twitterImagePath)],
        },
    };
}
