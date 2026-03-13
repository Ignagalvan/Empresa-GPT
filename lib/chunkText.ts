type ChunkOptions = {
    maxChunkLength?: number;
    overlap?: number;
    minChunkLength?: number;
};

function normalizeText(text: string): string {
    return text
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function splitIntoParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/g)
        .map((part) => part.trim())
        .filter(Boolean);
}

export function chunkText(
    text: string,
    options: ChunkOptions = {}
): string[] {
    const maxChunkLength = options.maxChunkLength ?? 1200;
    const overlap = options.overlap ?? 200;
    const minChunkLength = options.minChunkLength ?? 200;

    const normalized = normalizeText(text);

    if (!normalized) {
        return [];
    }

    if (normalized.length <= maxChunkLength) {
        return [normalized];
    }

    const paragraphs = splitIntoParagraphs(normalized);
    const chunks: string[] = [];

    let currentChunk = "";

    for (const paragraph of paragraphs) {
        if (!currentChunk) {
            currentChunk = paragraph;
            continue;
        }

        const candidate = `${currentChunk}\n\n${paragraph}`;

        if (candidate.length <= maxChunkLength) {
            currentChunk = candidate;
            continue;
        }

        if (currentChunk.length >= minChunkLength) {
            chunks.push(currentChunk);
        } else {
            currentChunk = candidate.slice(0, maxChunkLength);
            chunks.push(currentChunk);
        }

        const tail = currentChunk.slice(-overlap).trim();
        currentChunk = tail ? `${tail}\n\n${paragraph}` : paragraph;

        while (currentChunk.length > maxChunkLength) {
            const forcedChunk = currentChunk.slice(0, maxChunkLength).trim();
            if (forcedChunk) {
                chunks.push(forcedChunk);
            }

            const rest = currentChunk.slice(maxChunkLength - overlap).trim();
            currentChunk = rest;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter((chunk) => chunk.trim().length > 0);
}