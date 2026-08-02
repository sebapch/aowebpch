import LandingCta from "@/components/landing/LandingCta";
import LiveOnlineCounter from "@/components/landing/LiveOnlineCounter";
import { absoluteUrl, siteDescription, siteName, siteTagline } from "@/lib/seo";

const structuredData = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: siteName,
    alternateName: siteTagline,
    description: siteDescription,
    url: absoluteUrl("/"),
    inLanguage: "es-AR",
    genre: ["MMORPG", "PvP", "Juego de rol multijugador"],
    gamePlatform: "Navegador web",
    applicationCategory: "Game",
    operatingSystem: "Cualquiera con navegador web",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
    },
};

export default function HomePage() {
    return (
        <main className="min-h-screen csao-bg px-4 py-10 text-slate-100">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData),
                }}
            />

            <div className="mx-auto max-w-5xl space-y-8">
                {/* Hero */}
                <section className="game-card p-6 shadow-xl md:p-10">
                    <div className="max-w-3xl space-y-5">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                                {siteTagline}
                            </span>
                            <LiveOnlineCounter />
                        </div>

                        <h1 className="text-4xl font-black uppercase tracking-wider text-white md:text-6xl">
                            CSAO<span className="text-[#d4a359]">2</span>
                        </h1>

                        <p className="text-lg font-semibold text-white md:text-2xl">
                            El Argentum Online que abrís y jugás.
                        </p>

                        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                            Sin descargas, sin parches, sin instalar nada. Retos
                            por equipos con veto de mapas, ranking Elo y voz por
                            equipo, directo desde el navegador.
                        </p>

                        <LandingCta />
                    </div>
                </section>

            </div>
        </main>
    );
}
