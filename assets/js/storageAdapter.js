// Stores timers to apply debounce to network requests
const syncTimers = {};
const pendingSyncs = {}; // Stores the latest values pending synchronization

/**
 * StorageAdapter handles hybrid synchronization between the local browser
 * and the Phoenix backend. It ensures the UI remains fast by resolving
 * synchronously from localStorage while keeping the cloud updated.
 */
export const StorageAdapter = {
    /**
     * Reads a value from local storage. Synchronous.
     * @param {string} key The key to read.
     * @returns {string|null} The value from localStorage.
     */
    getItem(key) {
        return localStorage.getItem(key);
    },

    /**
     * Writes a value to local storage and triggers an async sync to the cloud.
     * @param {string} key The key to write.
     * @param {any} value The value to write.
     */
    setItem(key, value) {
        // 1. Optimistic local update for a fast UI
        localStorage.setItem(key, value);

        // 2. Fire-and-forget sync to the cloud
        this._syncToCloud(key, value);
    },

    async _syncToCloud(key, value, isUrgent = false) {
        // Avoid network requests if the user is an anonymous visitor
        if (typeof logged_in === 'undefined' || !logged_in) {
            console.debug("Cloud sync ignored: User is not logged in.");
            return;
        }

        const csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content") || 
                          document.querySelector("input[name='_csrf_token']")?.value;
        if (!csrfToken) {
            console.warn("Cloud sync ignored: CSRF token not found.");
            return; 
        }

        const payloadStr = JSON.stringify({ key: key, value: String(value) });

        if (isUrgent) {
            // Immediate sync when closing the tab or switching apps.
            try {
                // The fetch keepalive flag allows the request to outlive the page,
                // but it has a strict 64KB limit.
                const useKeepAlive = payloadStr.length < 60000;
                
                console.debug(`Urgent cloud sync: ${key} | keepalive: ${useKeepAlive}`);
                await fetch('/api/progress/sync', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-csrf-token': csrfToken
                    },
                    body: payloadStr,
                    keepalive: useKeepAlive
                });
                delete pendingSyncs[key];
            } catch (error) {
                console.error("Cloud Sync Error (Urgent): Failed to save key '" + key + "'.", error);
            }
            return;
        }

        // Store the latest value in case the user closes the tab before the debounce fires
        pendingSyncs[key] = value;

        // Clear existing timer for this key (debounce)
        if (syncTimers[key]) {
            clearTimeout(syncTimers[key]);
        }

        syncTimers[key] = setTimeout(async () => {
            const valToSync = pendingSyncs[key];
            delete pendingSyncs[key];
            delete syncTimers[key];
            
            if (valToSync === undefined) return;

            try {
                console.debug("Syncing with cloud:", key);
                await fetch('/api/progress/sync', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-csrf-token': csrfToken
                    },
                    body: JSON.stringify({ key: key, value: String(valToSync) })
                });
            } catch (error) {
                console.error("Cloud Sync Error: Failed to save key '" + key + "'.", error);
            }
        }, 5000);
    },

    /**
     * Forces synchronization of any pending data in memory.
     */
    forceSyncAll() {
        for (const key in pendingSyncs) {
            if (syncTimers[key]) {
                clearTimeout(syncTimers[key]);
                delete syncTimers[key];
            }
            this._syncToCloud(key, pendingSyncs[key], true);
        }
    },

    /**
     * Removes an item from local storage.
     * Note: This implementation does not sync the deletion to the cloud.
     * @param {string} key The key to remove.
     */
    removeItem(key) {
        localStorage.removeItem(key);
        // Depending on your backend implementation, you might want to
        // trigger a DELETE request here as well to keep the DB perfectly clean.
    }
};

// Modern event to detect when the user closes the tab, reloads the page,
// or switches to another app (common on mobile devices).
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        StorageAdapter.forceSyncAll();
    }
});