import { EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

/**
 * Handles persistent storage exclusively through the Even App Bridge.
 * This ensures data is synchronized with the Even G2 glasses and survives app reloads.
 */
export class BridgeStorage {
    private static bridgePromise: Promise<EvenAppBridge | null> | null = null;

    /**
     * Internal helper to get the bridge instance with a timeout to avoid hanging
     * in environments where the bridge is not available.
     */
    private static async getBridge(): Promise<EvenAppBridge | null> {
        if (!this.bridgePromise) {
            this.bridgePromise = (async () => {
                try {
                    return await Promise.race([
                        waitForEvenAppBridge(),
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
                    ]);
                } catch (e) {
                    console.warn('[BridgeStorage] Failed to initialize bridge:', e);
                    return null;
                }
            })();
        }
        return this.bridgePromise;
    }

    /**
     * Gets a value from the Bridge Local Storage.
     * @param key Storage key name
     * @returns The stored value, or null if not found or bridge is unavailable.
     */
    static async getItem(key: string): Promise<string | null> {
        try {
            const bridge = await this.getBridge();
            if (bridge) {
                const value = await bridge.getLocalStorage(key);
                console.log(`[BridgeStorage] Read: ${key}=${value ? 'exists' : 'empty'}`);
                // Per SDK pattern, "" means not found.
                if (value === "") return null;
                return value;
            }
        } catch (e) {
            console.error(`[BridgeStorage] Error reading key "${key}":`, e);
        }
        return null;
    }

    /**
     * Sets a value in the Bridge Local Storage.
     * @param key Storage key name
     * @param value Storage value (string)
     * @returns Whether the operation succeeded.
     */
    static async setItem(key: string, value: string): Promise<boolean> {
        try {
            const bridge = await this.getBridge();
            if (bridge) {
                const ok = await bridge.setLocalStorage(key, value);
                console.log(`[BridgeStorage] Write: ${key} result=${ok}`);
                return ok;
            }
        } catch (e) {
            console.error(`[BridgeStorage] Error writing key "${key}":`, e);
        }
        return false;
    }
}
