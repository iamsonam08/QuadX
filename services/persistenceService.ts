
import { AppData } from "../types";
import { INITIAL_DATA } from "../constants";

/**
 * GLOBAL CLOUD SYNC
 * Using npoint.io shared JSON hub for real-time global state.
 */
const CLOUD_BIN_ID = '9307f5984f884a441416'; // Using the user's provided BIN
const CLOUD_URL = `https://api.npoint.io/${CLOUD_BIN_ID}`;
const STORAGE_KEY = 'QUADX_SHARED_STATE';
const DB_NAME = 'QuadX_Global_DB';
const STORE_NAME = 'campus_data_store';

const getIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
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
   * Loads global data from cloud bin. Adds cache-busting to ensure fresh data.
   */
  async loadData(): Promise<AppData> {
    try {
      const response = await fetch(`${CLOUD_URL}?cb=${Date.now()}`);
      if (response.ok) {
        const cloudData = await response.json();
        if (cloudData && typeof cloudData === 'object' && !Array.isArray(cloudData)) {
          await idbSet(STORAGE_KEY, cloudData);
          return cloudData as AppData;
        }
      }
    } catch (e) {
      console.warn("Global cloud hub offline, using local cache.");
    }

    try {
      const saved = await idbGet(STORAGE_KEY);
      if (saved) return saved;
    } catch (e) {}
    
    return INITIAL_DATA;
  },

  /**
   * Saves data to both local storage and the global cloud hub.
   */
  async saveData(data: AppData): Promise<boolean> {
    try {
      await idbSet(STORAGE_KEY, data);

      const response = await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        window.dispatchEvent(new Event('quadx_data_sync'));
        return true;
      }
      return false;
    } catch (e) {
      console.error("Cloud Sync Failure:", e);
      return false;
    }
  }
};
