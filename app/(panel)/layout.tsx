import AppSidebar from "@/components/AppSidebar";
import CompanyProvider from "@/components/providers/CompanyProvider";

export default function PanelLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <CompanyProvider>
            <div className="min-h-screen bg-[#0a0f1f] text-white">
                <div className="flex min-h-screen">
                    <AppSidebar />

                    <main className="flex-1 px-6 py-8">
                        <div className="mx-auto max-w-6xl">{children}</div>
                    </main>
                </div>
            </div>
        </CompanyProvider>
    );
}