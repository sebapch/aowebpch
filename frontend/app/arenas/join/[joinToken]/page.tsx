"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ArenaJoinPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/characters");
    }, [router]);

    return null;
}
