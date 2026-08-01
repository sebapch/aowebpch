import { ImageResponse } from "next/og";
import {
    SocialCard,
    getSocialLogoSrc,
    socialImageContentType,
    socialImageSize,
} from "@/lib/social-card";
import { siteTagline, siteTitle } from "@/lib/seo";

export const alt = siteTitle;
export const size = socialImageSize;
export const contentType = socialImageContentType;

export default async function OpenGraphImage() {
    const logoSrc = await getSocialLogoSrc();

    return new ImageResponse(
        <SocialCard
            eyebrow={siteTagline}
            title="CSAO2"
            description="Argentum Online sin descargar nada. Abris el navegador y jugas."
            bullets={[
                "Retos por equipos con veto de mapas",
                "Ranking Elo",
                "Voz por equipo",
            ]}
            accent="#d4a359"
            logoSrc={logoSrc}
        />,
        size,
    );
}
