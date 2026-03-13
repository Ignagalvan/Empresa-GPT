type PublicEnv = {
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
};

type ServerEnv = PublicEnv & {
    OPENAI_API_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
};

function readEnv(name: string): string {
    const value = process.env[name];

    if (!value || !value.trim()) {
        throw new Error(
            `Falta la variable de entorno ${name}. Revisá tu archivo .env.local y reiniciá el servidor.`
        );
    }

    return value.trim();
}

let cachedPublicEnv: PublicEnv | null = null;
let cachedServerEnv: ServerEnv | null = null;

export function getPublicEnv(): PublicEnv {
    if (cachedPublicEnv) return cachedPublicEnv;

    cachedPublicEnv = {
        NEXT_PUBLIC_SUPABASE_URL: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    };

    return cachedPublicEnv;
}

export function getServerEnv(): ServerEnv {
    if (cachedServerEnv) return cachedServerEnv;

    const publicEnv = getPublicEnv();

    cachedServerEnv = {
        ...publicEnv,
        OPENAI_API_KEY: readEnv("OPENAI_API_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    };

    return cachedServerEnv;
}