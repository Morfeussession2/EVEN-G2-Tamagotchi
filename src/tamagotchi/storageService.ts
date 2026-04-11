import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

/**
 * StorageService handles CRUD operations for persistent data on the Even G2 glasses.
 * It uses the official Even Hub SDK bridge.LocalStorage methods.
 */
export class StorageService {
    private static bridgePromise: ReturnType<typeof waitForEvenAppBridge> | null = null;

    private static getBridge() {
        if (!this.bridgePromise) {
            this.bridgePromise = waitForEvenAppBridge();
        }
        return this.bridgePromise;
    }

    /**
     * Creates a new entry (or overwrites existing) in the bridge's local storage.
     * @param key The unique identifier for the data.
     * @param value The value to store (must be a string).
     */
    static async create(key: string, value: string): Promise<boolean> {
        try {
            const bridge = await this.getBridge();
            const result = await bridge.setLocalStorage(key, value);
            console.log(`[StorageService] Create/Update: ${key} -> result: ${result}`);
            return result;
        } catch (error) {
            this.bridgePromise = null;
            console.error(`[StorageService] Error creating key "${key}":`, error);
            return false;
        }
    }

    /**
     * Reads a value from the bridge's local storage.
     * @param key The unique identifier for the data.
     * @returns The stored string value, or null if empty/not found.
     */
    static async read(key: string): Promise<string | null> {
        try {
            const bridge = await this.getBridge();
            const value = await bridge.getLocalStorage(key);
            console.log(`[StorageService] Read: ${key} -> ${value ? 'exists' : 'empty'}`);
            // In the Even SDK, an empty string "" typically represents a non-existent value.
            if (!value || value === "") return null;
            return value;
        } catch (error) {
            this.bridgePromise = null;
            console.error(`[StorageService] Error reading key "${key}":`, error);
            return null;
        }
    }

    /**
     * Updates an existing entry in the bridge's local storage.
     * Functional alias for create() in this key-value context.
     */
    static async update(key: string, value: string): Promise<boolean> {
        return this.create(key, value);
    }

    /**
     * Deletes an entry from the bridge's local storage by setting it to an empty string.
     * @param key The unique identifier to remove.
     */
    static async delete(key: string): Promise<boolean> {
        console.log(`[StorageService] Deleting: ${key}`);
        return this.create(key, "");
    }
}
