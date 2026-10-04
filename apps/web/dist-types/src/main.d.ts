declare global {
    interface Window {
        __probe?: Promise<{
            version: number;
            hashes: Record<string, string>;
            ua: string;
        }>;
        __probeWorker?: Worker;
    }
}
export {};
