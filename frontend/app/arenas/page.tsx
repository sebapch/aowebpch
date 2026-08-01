"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

function ArenasPageContent() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/characters");
    }, [router]);

    return null;
}

export default function ArenasPage() {
    return (
        <Suspense fallback={null}>
            <ArenasPageContent />
        </Suspense>
    );
}
