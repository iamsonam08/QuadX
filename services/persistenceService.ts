
import { AppData } from "../types";
import { INITIAL_DATA } from "../constants";

/**
 * GLOBAL CAMPUS CLOUD HUB
 * Using npoint.io shared JSON bin for high-speed cross-device sync.
 */
const CLOUD_BIN_ID = '9307f5984f884a441416'; 
const CLOUD_URL = `https://api.npoint.io/${CLOUD_BIN_ID}`;
const STORAGE_KEY = 'QUADX_GLOBAL_STATE_V3';
const DB_NAME = 'QuadX_Global_IDB';
const STORE_NAME = 'main_store';

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
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) { return null; }
};

const idbSet = async (key: string, value: any): Promise<void> => {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {}
};

export const PersistenceService = {
  /**
   * Loads data from Cloud with local fallback.
   * Forces cache-busting to ensure students see Admin updates immediately.
   */
  async loadData(): Promise<AppData> {
    try {
      const response = await fetch(`${CLOUD_URL}?cache_bust=${Date.now()}`);
      if (response.ok) {
        const cloudData = await response.json();
        // Validation: Ensure the response is the full AppData object
        if (cloudData && typeof cloudData === 'object' && cloudData.timetable !== undefined) {
          await idbSet(STORAGE_KEY, cloudData);
          return cloudData as AppData;
        }
      }
    } catch (e) {
      console.warn("Sync: Hub offline. Using local persistence.");
    }

    const cached = await idbGet(STORAGE_KEY);
    return cached || INITIAL_DATA;
  },

  /**
   * Pushes full state to the cloud hub.
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
      console.error("Sync Failure:", e);
      return false;
    }
  }
};
