"use client";

import { useContext } from "react";
import { CompanyContext } from "@/components/providers/CompanyProvider";

export function useCompanyContext() {
    const context = useContext(CompanyContext);

    if (!context) {
        throw new Error(
            "useCompanyContext debe usarse dentro de <CompanyProvider>"
        );
    }

    return context;
}