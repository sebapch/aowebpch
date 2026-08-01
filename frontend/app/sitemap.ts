import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();

    return [
        {
            url: absoluteUrl("/"),
            lastModified: now,
            changeFrequency: "weekly",
            priority: 1,
        },
        {
            url: absoluteUrl("/updates"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/wiki"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/wiki/factions"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/wiki/maps"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/wiki/npcs"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/wiki/equipment"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/wiki/spells"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/ranking"),
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9,
        },
        {
            url: absoluteUrl("/login"),
            lastModified: now,
            changeFrequency: "monthly",
            priority: 0.7,
        },
        {
            url: absoluteUrl("/register"),
            lastModified: now,
            changeFrequency: "monthly",
            priority: 0.8,
        },
    ];
}
