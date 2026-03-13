import { PDFParse } from "pdf-parse";

export type PdfExtractionResult = {
    text: string;
    pages: number;
    warnings: string[];
};

function normalizePdfText(text: string): string {
    return text
        .replace(/\r/g, "\n")
        .replace(/\u0000/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function looksScannedOrEmpty(text: string): boolean {
    const cleaned = text.replace(/\s/g, "").trim();
    return cleaned.length < 40;
}

export async function extractTextFromPdfBuffer(
    buffer: Buffer
): Promise<PdfExtractionResult> {
    if (!buffer || buffer.length === 0) {
        throw new Error("El archivo PDF está vacío.");
    }

    try {
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();

        const rawText = typeof parsed.text === "string" ? parsed.text : "";
        const normalizedText = normalizePdfText(rawText);

        const warnings: string[] = [];

        if (looksScannedOrEmpty(normalizedText)) {
            warnings.push(
                "El PDF no contiene suficiente texto legible. Puede ser un PDF escaneado o una imagen sin OCR."
            );
        }

        return {
            text: normalizedText,
            pages: typeof parsed.total === "number" ? parsed.total : 0,
            warnings,
        };
    } catch (error) {
        console.error("Error leyendo PDF:", error);
        throw new Error("No se pudo leer el PDF. Verificá que el archivo sea válido.");
    }
}       