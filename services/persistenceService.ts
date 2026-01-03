
import { AppData } from "../types";
import { INITIAL_DATA } from "../constants";

/**
 * GLOBAL CLOUD SYNC (FREE EDITION)
 * We use npoint.io as a high-speed, free JSON hub. 
 * LIMIT: 1MB total payload.
 */
const CLOUD_BIN_ID = '468846059c19358178a9'; 
const CLOUD_URL = `https://api.npoint.io/${CLOUD_BIN_ID}`;
const DB_NAME = 'QuadX_DB';
const STORE_NAME = 'campus_data';
const STORAGE_KEY = 'QUADX_CAMPUS_DATA';

// Helper to interact with IndexedDB (No Quota Limit)
const getIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const idbGet = async (key: string): Promise<any> => {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const idbSet = async (key: string, value: any): Promise<void> => {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const request = transaction.objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const PersistenceService = {
  /**
   * Loads the latest campus data from the Global Cloud Hub or IndexedDB.
   */
  async loadData(): Promise<AppData> {
    try {
      const response = await fetch(CLOUD_URL);
      if (response.ok) {
        const cloudData = await response.json();
        await idbSet(STORAGE_KEY, cloudData);
        return cloudData;
      }
    } catch (e) {
      console.warn("Cloud Hub offline, loading IndexedDB backup.");
    }

    try {
      const saved = await idbGet(STORAGE_KEY);
      if (saved) return saved;
    } catch (e) {
      console.error("Critical: Failed to load local data.");
    }
    
    return INITIAL_DATA;
  },

  /**
   * Saves data to IndexedDB AND pushes it to the Global Cloud.
   */
  async saveData(data: AppData): Promise<boolean> {
    try {
      await idbSet(STORAGE_KEY, data);

      const jsonString = JSON.stringify(data);
      if (jsonString.length > 1000000) {
        console.error("Data too large for Cloud Sync (1MB limit). Local save only.");
        return false;
      }

      const response = await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonString,
      });

      if (response.ok) {
        window.dispatchEvent(new Event('quadx_data_sync'));
        return true;
      }
      return false;
    } catch (e) {
      console.error("Sync Error:", e);
      return false;
    }
  },

  /**
   * Wipes the cloud and resets to factory settings.
   */
  async resetGlobal() {
    if (confirm("Reset the entire global database?")) {
      await this.saveData(INITIAL_DATA);
      window.location.reload();
    }
  }
};
