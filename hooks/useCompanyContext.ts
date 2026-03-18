"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "empresa_gpt_company_id";

export function useCompanyContext() {
    const searchParams = useSearchParams();

    const queryCompanyId = useMemo(() => {
        return searchParams.get("companyId")?.trim() || "";
    }, [searchParams]);

    const [companyId, setCompanyIdState] = useState("");

    useEffect(() => {
        const saved =
            typeof window !== "undefined"
                ? window.localStorage.getItem(STORAGE_KEY) || ""
                : "";

        if (queryCompanyId) {
            setCompanyIdState(queryCompanyId);

            if (typeof window !== "undefined") {
                window.localStorage.setItem(STORAGE_KEY, queryCompanyId);
            }
            return;
        }

        if (saved) {
            setCompanyIdState(saved);
        }
    }, [queryCompanyId]);

    function setCompanyId(value: string) {
        const trimmed = value.trim();
        setCompanyIdState(trimmed);

        if (typeof window !== "undefined") {
            if (trimmed) {
                window.localStorage.setItem(STORAGE_KEY, trimmed);
            } else {
                window.localStorage.removeItem(STORAGE_KEY);
            }
        }
    }

    return {
        companyId,
        setCompanyId,
    };
}