import Link from "next/link";
import LandingCta from "@/components/landing/LandingCta";
import LiveOnlineCounter from "@/components/landing/LiveOnlineCounter";
import { absoluteUrl, siteDescription, siteName, siteTagline } from "@/lib/seo";

const FEATURES = [
    {
        eyebrow: "Sin descargas",
        title: "Abrís una pestaña y estás adentro",
        body: "Sin cliente, sin parches, sin antivirus quejándose. Funciona en cualquier computadora con un navegador moderno.",
    },
    {
        eyebrow: "Competitivo",
        title: "Retos por equipos con veto de mapas",
        body: "De 1v1 a 4v4. Los formatos por equipo (2v2, 3v3 y 4v4) puntúan ranking Elo separado por formato.",
    },
    {
        eyebrow: "Voz integrada",
        title: "Voice chat por equipo",
        body: "Hablás con los tuyos desde adentro del juego. Sin abrir Discord aparte y sin configurar nada.",
    },
];

const WORLD_STATS = [
    { value: "294", label: "Mapas" },
    { value: "348", label: "NPCs" },
    { value: "1062", label: "Objetos" },
    { value: "47", label: "Hechizos" },
    { value: "7", label: "Clases" },
];

const STEPS = [
    {
        step: "1",
        title: "Creá tu cuenta",
        body: "Elegís nombre, raza y clase. Tarda menos de un minuto y no pide tarjeta.",
    },
    {
        step: "2",
        title: "Entrá a una arena",
        body: "Salas públicas o privadas con link de invitación, y personajes PvP ya armados para pelear sin levelear.",
    },
    {
        step: "3",
        title: "Vetá y peleá",
        body: "Los dos equipos vetan mapas por turnos hasta que queda uno. Ganás, sumás Elo.",
    },
];

const FAQ = [
    {
        question: "¿Necesito descargar o instalar algo?",
        answer: "No. CSAO2 corre entero en el navegador. Entrás a la página, creás tu cuenta y jugás.",
    },
    {
        question: "¿Es gratis?",
        answer: "Sí, es gratis. El proyecto se sostiene con donaciones voluntarias y nunca vas a poder comprar stats, items ni ventajas de combate.",
    },
    {
        question: "¿Es el Argentum Online de siempre?",
        answer: "El combate, las clases, las razas, los hechizos, las facciones Armada y Caos y los oficios son los del Argentum Online clásico. Lo que agregamos es la capa competitiva: retos por equipos, veto de mapas y ranking Elo.",
    },
    {
        question: "¿Qué diferencia hay con otros servidores de Argentum Online?",
        answer: "Dos cosas. Que no tenés que instalar nada, y que el formato competitivo está integrado al juego en vez de organizarse por afuera.",
    },
];

const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
        {
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
        },
        {
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: item.answer,
                },
            })),
        },
    ],
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

                {/* Diferenciales */}
                <section className="grid gap-4 md:grid-cols-3">
                    {FEATURES.map((feature) => (
                        <article
                            key={feature.title}
                            className="game-card p-6 shadow-md"
                        >
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                                {feature.eyebrow}
                            </span>
                            <h2 className="mt-2 text-lg font-bold text-white">
                                {feature.title}
                            </h2>
                            <p className="mt-2 text-xs leading-relaxed text-slate-400">
                                {feature.body}
                            </p>
                        </article>
                    ))}
                </section>

                {/* El mundo completo */}
                <section className="game-card p-6 shadow-md md:p-8">
                    <h2 className="border-b border-[#3d2719] pb-3 text-base font-bold uppercase tracking-wider text-white">
                        No es solo la arena
                    </h2>

                    <p className="mt-4 text-xs leading-relaxed text-slate-300">
                        Atrás del competitivo está el mundo entero de Argentum
                        Online: facciones Armada y Caos, criminales y fianza,
                        clanes con bóveda propia, mercado entre jugadores,
                        crafting, fundición, pesca, tala y minería.
                    </p>

                    <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                        {WORLD_STATS.map((stat) => (
                            <div
                                key={stat.label}
                                className="game-card-inset flex flex-col-reverse px-4 py-3 text-center"
                            >
                                <dt className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {stat.label}
                                </dt>
                                <dd className="text-2xl font-black text-[#d4a359]">
                                    {stat.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* Como se juega */}
                <section className="game-card p-6 shadow-md md:p-8">
                    <h2 className="border-b border-[#3d2719] pb-3 text-base font-bold uppercase tracking-wider text-white">
                        Cómo se juega
                    </h2>

                    <ol className="mt-6 grid gap-4 md:grid-cols-3">
                        {STEPS.map((item) => (
                            <li key={item.step} className="game-card-inset p-5">
                                <span className="text-3xl font-black text-[#3d2719]">
                                    {item.step}
                                </span>
                                <h3 className="mt-1 text-sm font-bold text-white">
                                    {item.title}
                                </h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                                    {item.body}
                                </p>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* Posicionamiento */}
                <section className="game-card border-[#6e4624] p-6 shadow-md md:p-8">
                    <h2 className="text-base font-bold uppercase tracking-wider text-[#d4a359]">
                        Acá no se compra poder
                    </h2>
                    <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-300">
                        CSAO2 se sostiene con donaciones voluntarias. Nunca vas
                        a poder comprar stats, items, experiencia ni ventajas de
                        combate. La única forma de subir en el ranking es
                        ganando.
                    </p>
                </section>

                {/* FAQ */}
                <section className="game-card p-6 shadow-md md:p-8">
                    <h2 className="border-b border-[#3d2719] pb-3 text-base font-bold uppercase tracking-wider text-white">
                        Preguntas frecuentes
                    </h2>

                    <dl className="mt-4 divide-y divide-[#3d2719]">
                        {FAQ.map((item) => (
                            <div key={item.question} className="py-4">
                                <dt className="text-sm font-bold text-white">
                                    {item.question}
                                </dt>
                                <dd className="mt-2 text-xs leading-relaxed text-slate-400">
                                    {item.answer}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* Cierre */}
                <section className="game-card p-6 text-center shadow-md md:p-8">
                    <h2 className="text-xl font-black uppercase tracking-wider text-white md:text-3xl">
                        Entrá y probá
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
                        No hay nada que instalar. Creás la cuenta y estás
                        peleando en menos de un minuto.
                    </p>
                    <div className="mt-5 flex justify-center">
                        <LandingCta />
                    </div>
                </section>

                <footer className="pb-8 text-center text-[11px] leading-relaxed text-slate-500">
                    <p>
                        Construido sobre AOWeb, creado por{" "}
                        <a
                            href="https://x.com/DamianCatanzaro"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 underline underline-offset-2 hover:text-slate-200"
                        >
                            Damián Catanzaro
                        </a>
                        .
                    </p>
                    <p className="mt-2">
                        <Link
                            href="/updates"
                            prefetch={false}
                            className="hover:text-slate-300"
                        >
                            Novedades
                        </Link>
                        {" · "}
                        <Link
                            href="/wiki"
                            prefetch={false}
                            className="hover:text-slate-300"
                        >
                            Wiki
                        </Link>
                        {" · "}
                        <Link
                            href="/ranking"
                            prefetch={false}
                            className="hover:text-slate-300"
                        >
                            Ranking
                        </Link>
                    </p>
                </footer>
            </div>
        </main>
    );
}
