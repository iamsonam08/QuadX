
import { AppData } from "../types";
import { INITIAL_DATA } from "../constants";

const STORAGE_KEY = 'QUADX_CAMPUS_DATA';

/**
 * Persistence Service
 * This simulates a real-time database connection.
 * To enable global sync across different devices, replace the localStorage 
 * calls with a backend service like Firebase Firestore or Supabase.
 */
export const PersistenceService = {
  /**
   * Loads the latest campus data.
   */
  async loadData(): Promise<AppData> {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load campus data:", e);
    }
    return INITIAL_DATA;
  },

  /**
   * Saves data to the cloud (Simulated via localStorage).
   * Triggers a sync broadcast for real-time updates.
   */
  async saveData(data: AppData): Promise<boolean> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      
      // Simulate network latency for a realistic sync feel
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Broadcast change (for multi-tab sync on same machine)
      window.dispatchEvent(new Event('quadx_data_sync'));
      
      return true;
    } catch (e) {
      console.error("Failed to sync data to cloud:", e);
      return false;
    }
  },

  /**
   * Resets the entire campus database.
   */
  async clearData() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
};
