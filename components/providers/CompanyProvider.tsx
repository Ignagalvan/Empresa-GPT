"use client";

import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useSearchParams } from "next/navigation";

type CompanyContextValue = {
    companyId: string;
    setCompanyId: (value: string) => void;
};

export const STORAGE_KEY = "empresa_gpt_company_id";

export const CompanyContext = createContext<CompanyContextValue | undefined>(
    undefined
);

export default function CompanyProvider({
    children,
}: {
    children: React.ReactNode;
}) {
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

    const setCompanyId = useCallback((value: string) => {
        const trimmed = value.trim();
        setCompanyIdState(trimmed);

        if (typeof window !== "undefined") {
            if (trimmed) {
                window.localStorage.setItem(STORAGE_KEY, trimmed);
            } else {
                window.localStorage.removeItem(STORAGE_KEY);
            }
        }
    }, []);

    const value = useMemo(
        () => ({
            companyId,
            setCompanyId,
        }),
        [companyId, setCompanyId]
    );

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
}