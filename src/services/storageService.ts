import { createDemoState, createEmptyState } from '../data/demoData';
import { AuthSessionPlaceholder, MacroLogPersistedState } from '../types';

const STORAGE_KEY = 'calothrix_app_state_v1';
const LEGACY_KEYS = ['macrofit_app_state_v1', 'macrolog_app_state_v1'];

/**
 * Storage repository interface designed so LocalStorageRepository can later be
 * swapped with a SupabaseRepository (authenticated via Google Auth) without
 * modifying any UI components or hooks.
 */
export interface StorageRepository {
  loadState(): MacroLogPersistedState;
  saveState(state: MacroLogPersistedState): void;
  resetToDemo(): MacroLogPersistedState;
  clearAll(preserveTheme?: 'light' | 'dark' | 'system'): MacroLogPersistedState;
  getAuthSession(): AuthSessionPlaceholder;
}

class LocalStorageRepository implements StorageRepository {
  loadState(): MacroLogPersistedState {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ||
        LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
      if (!raw) {
        const initial = createDemoState();
        this.saveState(initial);
        return initial;
      }
      const parsed = JSON.parse(raw) as MacroLogPersistedState;
      if (!parsed || typeof parsed !== 'object' || !parsed.profile || !parsed.goals) {
        const fallback = createDemoState();
        this.saveState(fallback);
        return fallback;
      }
      if (!localStorage.getItem(STORAGE_KEY)) {
        this.saveState(parsed);
      }
      return parsed;
    } catch {
      return createDemoState();
    }
  }

  saveState(state: MacroLogPersistedState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors gracefully
    }
  }

  resetToDemo(): MacroLogPersistedState {
    const fresh = createDemoState();
    this.saveState(fresh);
    return fresh;
  }

  clearAll(preserveTheme: 'light' | 'dark' | 'system' = 'dark'): MacroLogPersistedState {
    const empty = createEmptyState(preserveTheme);
    this.saveState(empty);
    return empty;
  }

  getAuthSession(): AuthSessionPlaceholder {
    return {
      provider: 'local_demo',
      isAuthenticated: false,
      userId: 'demo-user-01',
    };
  }
}

export const storageService: StorageRepository = new LocalStorageRepository();

export function exportStateAsJson(state: MacroLogPersistedState): string {
  return JSON.stringify(state, null, 2);
}

export function exportFoodAndWeightAsCsv(state: MacroLogPersistedState): string {
  const lines: string[] = [
    'RecordType,Date,MealOrNotes,ItemName,QuantityGramsOrWeightKg,Calories,ProteinG,CarbsG,FatG,FibreG',
  ];

  const escape = (v: string | number | undefined) => {
    const str = String(v ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  for (const e of state.foodEntries) {
    lines.push(
      [
        'FOOD',
        e.date,
        e.mealType,
        e.foodName,
        e.quantityGrams,
        e.calories,
        e.protein,
        e.carbs,
        e.fat,
        e.fibre,
      ]
        .map(escape)
        .join(',')
    );
  }

  for (const w of state.weightEntries) {
    lines.push(
      ['WEIGHT', w.date, w.notes || '', 'Body Weight', w.weightKg, '', '', '', '', '']
        .map(escape)
        .join(',')
    );
  }

  return lines.join('\n');
}
