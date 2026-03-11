export function chunkText(
    text: string,
    chunkSize: number = 1200,
    overlap: number = 200
): string[] {
    if (!text) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end).trim();

        if (chunk) {
            chunks.push(chunk);
        }

        if (end === text.length) break;

        start += chunkSize - overlap;
    }

    return chunks;
}