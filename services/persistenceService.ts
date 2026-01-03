
import { AppData } from "../types";
import { INITIAL_DATA } from "../constants";

/**
 * VERCEL KV INTEGRATION
 * To use this, go to your Vercel Dashboard -> Storage -> Create Database -> KV (Redis).
 * Vercel will automatically provide KV_REST_API_URL and KV_REST_API_TOKEN.
 */
const KV_URL = (process.env as any).KV_REST_API_URL;
const KV_TOKEN = (process.env as any).KV_REST_API_TOKEN;
const STORAGE_KEY = 'QUADX_CAMPUS_DATA';

export const PersistenceService = {
  /**
   * Loads the latest campus data from Vercel KV Global Cloud.
   * Falls back to Local Storage if offline or KV not configured.
   */
  async loadData(): Promise<AppData> {
    if (KV_URL && KV_TOKEN) {
      try {
        console.log("Syncing with Vercel KV Hub...");
        // Vercel KV REST GET
        const response = await fetch(`${KV_URL}/get/${STORAGE_KEY}`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
        });
        
        if (response.ok) {
          const result = await response.json();
          // Vercel KV returns { result: "stringified_json" }
          if (result.result) {
            const cloudData = JSON.parse(result.result);
            // Save a local copy for offline use
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
            return cloudData;
          }
        }
      } catch (e) {
        console.warn("Vercel KV unreachable, using local backup:", e);
      }
    } else {
      console.warn("Vercel KV credentials not found. Running in Local Storage mode.");
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Critical: Failed to load local data.");
    }
    
    return INITIAL_DATA;
  },

  /**
   * Saves data to both Local Storage AND Vercel KV.
   */
  async saveData(data: AppData): Promise<boolean> {
    // 1. Save locally for immediate UI responsiveness
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    if (KV_URL && KV_TOKEN) {
      try {
        console.log("Deploying to Vercel KV...");
        // Vercel KV REST SET (We send the data as a JSON string in the body)
        const response = await fetch(`${KV_URL}/set/${STORAGE_KEY}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_TOKEN}` },
          body: JSON.stringify(data),
        });

        if (!response.ok) throw new Error("Vercel KV Cloud Update Failed");

        // Broadcast change for other tabs on the same machine
        window.dispatchEvent(new Event('quadx_data_sync'));
        return true;
      } catch (e) {
        console.error("Global Sync Error:", e);
        return false;
      }
    }
    
    return true; // Local success
  },

  /**
   * Resets the cloud database to initial state.
   */
  async resetGlobal() {
    await this.saveData(INITIAL_DATA);
    window.location.reload();
  }
};
