import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function resolveBuildId(): string {
    if (process.env.NEXT_BUILD_ID?.trim()) {
        return process.env.NEXT_BUILD_ID.trim();
    }

    try {
        return execSync("git rev-parse --short=12 HEAD", {
            encoding: "utf8",
        }).trim();
    } catch {
        return "development";
    }
}

const buildId = resolveBuildId();

const nextConfig: NextConfig = {
    allowedDevOrigins: [
        "127.0.0.1",
        "localhost",
        "*.trycloudflare.com",
        "trycloudflare.com",
    ],
    env: {
        NEXT_PUBLIC_NEXT_BUILD_ID: buildId,
    },
    generateBuildId: async () => buildId,
};

export default nextConfig;
