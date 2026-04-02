import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

export class DualStorage {
    /**
     * Tries to get an item from the Bridge storage (persistent on glasses).
     * Falls back to standard window.localStorage (volatile on glasses, persistent in browser).
     */
    static async getItem(key: string): Promise<string | null> {
        try {
            // We use a short timeout for the bridge to avoid hanging in non-bridge environments
            const bridge = await Promise.race([
                waitForEvenAppBridge(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
            ]);

            if (bridge) {
                const value = await bridge.getLocalStorage(key);
                console.log(`[DualStorage] Read from bridge: ${key}=${value ? 'exists' : 'null'}`);
                if (value) return value;
            }
        } catch (e) {
            console.warn('[DualStorage] Bridge error in getItem:', e);
        }

        const local = localStorage.getItem(key);
        console.log(`[DualStorage] Fallback to localStorage: ${key}=${local ? 'exists' : 'null'}`);
        return local;
    }

    /**
     * Sets an item in both localStorage (immediate) and Bridge storage (async persistence).
     */
    static async setItem(key: string, value: string): Promise<void> {
        // Immediate local save
        localStorage.setItem(key, value);

        try {
            const bridge = await Promise.race([
                waitForEvenAppBridge(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
            ]);

            if (bridge) {
                const ok = await bridge.setLocalStorage(key, value);
                console.log(`[DualStorage] Write to bridge: ${key} result=${ok}`);
            }
        } catch (e) {
            console.warn('[DualStorage] Bridge error in setItem:', e);
        }
    }
}
