
import { AppData } from "../types";
import { INITIAL_DATA } from "../constants";

// This is a unique identifier for your college database on the cloud.
// In a real production, you would store this in an environment variable.
const CLOUD_API_URL = 'https://api.npoint.io/468846059c19358178a9'; 
const STORAGE_KEY = 'QUADX_CAMPUS_DATA';

export const PersistenceService = {
  /**
   * Loads the latest campus data from the Global Cloud first,
   * falling back to Local Storage if offline.
   */
  async loadData(): Promise<AppData> {
    try {
      console.log("Syncing with Global Cloud...");
      const response = await fetch(CLOUD_API_URL);
      if (response.ok) {
        const cloudData = await response.json();
        // Save a local copy for offline use
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
        return cloudData;
      }
    } catch (e) {
      console.warn("Global Cloud unreachable, loading local backup.");
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
   * Saves data to both Local Storage AND the Global Cloud.
   * This ensures all users get the update immediately.
   */
  async saveData(data: AppData): Promise<boolean> {
    try {
      // 1. Save locally for immediate feedback
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

      // 2. Deploy to Global Cloud
      // Note: npoint.io allows POSTing to update the bin
      const response = await fetch(CLOUD_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Cloud update failed");

      // Broadcast change for other tabs on the same machine
      window.dispatchEvent(new Event('quadx_data_sync'));
      return true;
    } catch (e) {
      console.error("Global Sync Error:", e);
      return false;
    }
  },

  /**
   * Resets the cloud database to initial state.
   */
  async resetGlobal() {
    await this.saveData(INITIAL_DATA);
    window.location.reload();
  }
};
