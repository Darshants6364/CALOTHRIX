import type {
  DietaryPreference,
  FoodItem,
  FoodLogEntry,
  FoodRestriction,
  MacroNutrients,
  NutritionGoals,
  UserProfile,
  WeightEntry,
  WeeklySummaryResult,
} from '../types';
import { addDaysToDateKey, formatShortDate, getMondayToSundayWeek } from './dateUtils';
import {
  calculateScaledNutrition,
  getEntriesForDate,
  round1,
  round2,
  roundCal,
  sortWeightEntriesChronological,
  sumMacros,
} from './nutritionUtils';

export interface SmartFoodRecommendation {
  food: FoodItem;
  suggestedGrams: number;
  suggestedServingsLabel: string;
  projectedMacros: MacroNutrients;
  reason: string;
}

/**
 * Rule-based Smart Food Recommendation Engine (Module 4.2)
 * Uses existing nutrition data + remaining targets + dietary preferences/restrictions
 * without invoking any external paid LLM.
 */
export function getSmartFoodRecommendations(params: {
  foods: FoodItem[];
  goals: NutritionGoals;
  consumedToday: MacroNutrients;
  dietaryPreference: DietaryPreference;
  foodRestrictions: FoodRestriction[];
  limit?: number;
}): SmartFoodRecommendation[] {
  const { foods, goals, consumedToday, dietaryPreference, foodRestrictions, limit = 4 } = params;

  const remainingCalories = goals.calories > 0 ? Math.max(0, goals.calories - consumedToday.calories) : 450;
  const remainingProtein = goals.protein > 0 ? Math.max(0, goals.protein - consumedToday.protein) : 25;
  const remainingCarbs = goals.carbs > 0 ? Math.max(0, goals.carbs - consumedToday.carbs) : 40;
  const remainingFat = goals.fat > 0 ? Math.max(0, goals.fat - consumedToday.fat) : 15;
  const remainingFibre = goals.fibre > 0 ? Math.max(0, goals.fibre - consumedToday.fibre) : 8;

  const isAllowedByDiet = (food: FoodItem): boolean => {
    const tags = food.dietaryTags || [];
    const nameLower = food.name.toLowerCase();

    if (dietaryPreference === 'vegan') {
      if (
        tags.includes('vegan') === false &&
        (food.category === 'Meat and poultry' ||
          food.category === 'Fish and seafood' ||
          food.category === 'Dairy' ||
          /egg|milk|curd|dahi|paneer|yoghurt|yogurt|whey|chicken|fish|salmon/i.test(nameLower))
      ) {
        return false;
      }
    } else if (dietaryPreference === 'vegetarian') {
      if (
        food.category === 'Meat and poultry' ||
        food.category === 'Fish and seafood' ||
        /chicken|fish|salmon|rohu|egg|meat/i.test(nameLower)
      ) {
        return false;
      }
    } else if (dietaryPreference === 'eggetarian') {
      if (
        food.category === 'Fish and seafood' ||
        /chicken|fish|salmon|rohu|meat/i.test(nameLower)
      ) {
        return false;
      }
    }

    if (foodRestrictions.includes('dairy_free')) {
      if (
        food.category === 'Dairy' ||
        /milk|curd|dahi|paneer|yoghurt|yogurt|whey|buttermilk|chaas/i.test(nameLower)
      ) {
        return false;
      }
    }
    if (foodRestrictions.includes('nut_free')) {
      if (
        (food.category === 'Nuts and seeds' && !/chia/i.test(nameLower)) ||
        /almond|cashew|peanut|walnut/i.test(nameLower)
      ) {
        return false;
      }
    }
    if (foodRestrictions.includes('gluten_free')) {
      if (/wheat|roti|chapati|bread|upma|oats/i.test(nameLower) && !tags.includes('gluten_free')) {
        return false;
      }
    }
    return true;
  };

  const candidates = foods
    .filter((f) => f.calories > 0 && f.servingWeightGrams > 0 && isAllowedByDiet(f))
    .map((food) => {
      // Pick sensible serving multiplier (0.5x to 2x) that fits remaining calorie budget
      const calBudget = Math.max(120, remainingCalories);
      const desiredRatio =
        remainingProtein >= 15 && food.protein > 0
          ? Math.min(2, Math.max(0.5, remainingProtein / food.protein))
          : 1;

      const maxServingsByCalories = calBudget / Math.max(1, food.calories);
      const rawServings = Math.min(desiredRatio, Math.max(0.5, maxServingsByCalories));
      // Snap to nearest 0.5 serving
      const servings = Math.max(0.5, Math.min(2.5, Math.round(rawServings * 2) / 2));
      const suggestedGrams = Math.round(food.servingWeightGrams * servings * 10) / 10;
      const projected = calculateScaledNutrition(food, suggestedGrams);

      let score = 0;
      const reasons: string[] = [];

      // Prioritize protein gap when protein remaining is meaningful
      if (remainingProtein >= 10 && projected.protein >= 6) {
        const proteinCoverage = Math.min(1, projected.protein / Math.max(1, remainingProtein));
        const proteinDensity = projected.protein / Math.max(1, projected.calories / 100);
        score += proteinCoverage * 40 + proteinDensity * 4;
        reasons.push(`+${projected.protein}g protein`);
      }

      if (remainingFibre >= 4 && projected.fibre >= 2.5) {
        score += 20;
        reasons.push(`+${projected.fibre}g fibre`);
      }

      if (remainingCarbs >= 20 && projected.carbs >= 12) {
        score += 10;
      }

      if (remainingFat >= 8 && projected.fat >= 3 && projected.fat <= remainingFat + 5) {
        score += 6;
      }

      // Penalize overshooting remaining calories or fat severely when goals are set
      if (goals.calories > 0 && projected.calories > remainingCalories + 60) {
        score -= 35;
      }
      if (goals.fat > 0 && projected.fat > remainingFat + 8) {
        score -= 18;
      }

      // Slight preference for verified reference / personal custom foods
      if (food.isCustom) score += 4;
      if (food.sourceType === 'verified_reference') score += 3;

      return {
        food,
        suggestedGrams,
        suggestedServingsLabel:
          servings === 1 ? food.servingName : `${servings}× (${food.servingName})`,
        projectedMacros: projected,
        reason:
          reasons.length > 0
            ? `${reasons.join(' · ')} within ${projected.calories} kcal`
            : `Balanced ${projected.calories} kcal option`,
        score,
      };
    })
    .filter((item) => item.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return candidates.map(({ food, suggestedGrams, suggestedServingsLabel, projectedMacros, reason }) => ({
    food,
    suggestedGrams,
    suggestedServingsLabel,
    projectedMacros,
    reason,
  }));
}

export interface MultiWeekTrendPoint {
  weekStart: string;
  label: string;
  avgWeightKg: number | null;
  weightReadings: number;
  avgCalories: number;
  avgProtein: number;
  loggedFoodDays: number;
}

export function getMultiWeekProgressSeries(
  foodEntries: FoodLogEntry[],
  weightEntries: WeightEntry[],
  referenceDateKey: string,
  weeksCount = 4
): MultiWeekTrendPoint[] {
  const points: MultiWeekTrendPoint[] = [];
  for (let offset = -(weeksCount - 1); offset <= 0; offset++) {
    const dates = getMondayToSundayWeek(referenceDateKey, offset);
    const weekStart = dates[0];
    const weekEnd = dates[6];

    const weekWeights = weightEntries.filter((w) => w.date >= weekStart && w.date <= weekEnd);
    const avgWeightKg =
      weekWeights.length > 0
        ? round2(weekWeights.reduce((s, w) => s + w.weightKg, 0) / weekWeights.length)
        : null;

    let loggedFoodDays = 0;
    let totalCal = 0;
    let totalPro = 0;
    for (const d of dates) {
      const dayEntries = getEntriesForDate(foodEntries, d);
      if (dayEntries.length > 0) {
        loggedFoodDays++;
        const sum = sumMacros(dayEntries);
        totalCal += sum.calories;
        totalPro += sum.protein;
      }
    }

    points.push({
      weekStart,
      label: formatShortDate(weekStart),
      avgWeightKg,
      weightReadings: weekWeights.length,
      avgCalories: loggedFoodDays > 0 ? roundCal(totalCal / loggedFoodDays) : 0,
      avgProtein: loggedFoodDays > 0 ? round1(totalPro / loggedFoodDays) : 0,
      loggedFoodDays,
    });
  }
  return points;
}

export interface AdaptiveCalorieSuggestion {
  hasSufficientData: boolean;
  loggedFoodDaysLast28: number;
  weeksWithWeights: number;
  observedTdee: number | null;
  currentTargetCalories: number;
  suggestedTargetCalories: number | null;
  calorieDelta: number;
  avgWeeklyWeightChangeKg: number | null;
  headline: string;
  rationale: string;
}

/**
 * Module 3: 2–4 Week Optional Maintenance / Target Calorie Adjustment Advisor.
 * Never alters user goals automatically — returns a clear recommendation requiring user confirmation.
 */
export function evaluateAdaptiveCalorieAdjustment(params: {
  foodEntries: FoodLogEntry[];
  weightEntries: WeightEntry[];
  goals: NutritionGoals;
  profile: UserProfile;
  todayKey: string;
}): AdaptiveCalorieSuggestion {
  const { foodEntries, weightEntries, goals, profile, todayKey } = params;
  const start28 = addDaysToDateKey(todayKey, -27);

  // Count distinct logged food days in last 28 days
  const dailyCalMap = new Map<string, number>();
  for (const e of foodEntries) {
    if (e.date >= start28 && e.date <= todayKey) {
      dailyCalMap.set(e.date, (dailyCalMap.get(e.date) || 0) + e.calories);
    }
  }
  const loggedFoodDaysLast28 = dailyCalMap.size;

  const series = getMultiWeekProgressSeries(foodEntries, weightEntries, todayKey, 4);
  const weeksWithAvgWeight = series.filter((w) => w.avgWeightKg !== null);

  if (loggedFoodDaysLast28 < 10 || weeksWithAvgWeight.length < 2 || goals.calories <= 0) {
    return {
      hasSufficientData: false,
      loggedFoodDaysLast28,
      weeksWithWeights: weeksWithAvgWeight.length,
      observedTdee: null,
      currentTargetCalories: goals.calories,
      suggestedTargetCalories: null,
      calorieDelta: 0,
      avgWeeklyWeightChangeKg: null,
      headline: 'Adaptive calorie insights unlock after 2–4 weeks of consistent tracking',
      rationale: `Currently ${loggedFoodDaysLast28}/10 food logging days and ${weeksWithAvgWeight.length}/2 weekly weight averages recorded over the past 28 days.`,
    };
  }

  const firstWeek = weeksWithAvgWeight[0];
  const lastWeek = weeksWithAvgWeight[weeksWithAvgWeight.length - 1];
  const weekSpan = Math.max(1, weeksWithAvgWeight.length - 1);
  const totalWeightChangeKg = (lastWeek.avgWeightKg ?? 0) - (firstWeek.avgWeightKg ?? 0);
  const avgWeeklyWeightChangeKg = round2(totalWeightChangeKg / weekSpan);

  const avgDailyIntake = Math.round(
    Array.from(dailyCalMap.values()).reduce((a, b) => a + b, 0) / loggedFoodDaysLast28
  );

  // Estimated actual TDEE from observed intake + weight delta (7,700 kcal/kg tissue energy eq.)
  const dailyEnergyImbalance = (avgWeeklyWeightChangeKg * 7700) / 7;
  const observedTdee = Math.max(1100, Math.round(avgDailyIntake - dailyEnergyImbalance));

  let desiredWeeklyDeltaKg = 0;
  if (profile.fitnessGoal === 'fat_loss') desiredWeeklyDeltaKg = -0.35;
  else if (profile.fitnessGoal === 'muscle_gain') desiredWeeklyDeltaKg = 0.2;
  else desiredWeeklyDeltaKg = 0;

  const idealCaloriesForGoal = Math.round(observedTdee + (desiredWeeklyDeltaKg * 7700) / 7);
  const rawDiff = idealCaloriesForGoal - goals.calories;
  // Cap suggested change gently to +/- 200 kcal so adjustments stay sustainable
  const clampedDiff = Math.max(-200, Math.min(200, Math.round(rawDiff / 25) * 25));

  if (Math.abs(clampedDiff) < 50) {
    return {
      hasSufficientData: true,
      loggedFoodDaysLast28,
      weeksWithWeights: weeksWithAvgWeight.length,
      observedTdee,
      currentTargetCalories: goals.calories,
      suggestedTargetCalories: null,
      calorieDelta: 0,
      avgWeeklyWeightChangeKg,
      headline: 'Your current calorie target aligns well with your 2–4 week weight trend',
      rationale: `Across ${loggedFoodDaysLast28} logged days (avg ${avgDailyIntake.toLocaleString()} kcal/day), weekly average weight shifted ${avgWeeklyWeightChangeKg > 0 ? '+' : ''}${avgWeeklyWeightChangeKg} kg/wk, pointing to an observed maintenance near ${observedTdee.toLocaleString()} kcal/day.`,
    };
  }

  const suggestedTargetCalories = Math.max(1200, goals.calories + clampedDiff);

  return {
    hasSufficientData: true,
    loggedFoodDaysLast28,
    weeksWithWeights: weeksWithAvgWeight.length,
    observedTdee,
    currentTargetCalories: goals.calories,
    suggestedTargetCalories,
    calorieDelta: clampedDiff,
    avgWeeklyWeightChangeKg,
    headline: `Optional adjustment: ${clampedDiff > 0 ? '+' : ''}${clampedDiff} kcal/day`,
    rationale: `Based on ${loggedFoodDaysLast28} logged days averaging ${avgDailyIntake.toLocaleString()} kcal/day and a ${avgWeeklyWeightChangeKg > 0 ? '+' : ''}${avgWeeklyWeightChangeKg} kg/wk average weight trend, your observed maintenance is ~${observedTdee.toLocaleString()} kcal/day. You can review and confirm adjusting to ${suggestedTargetCalories.toLocaleString()} kcal/day if desired.`,
  };
}

export function buildDeterministicWeeklySummary(params: {
  weekLabel: string;
  avgCalories: number;
  targetCalories: number;
  avgProtein: number;
  targetProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFibre: number;
  targetFibre: number;
  loggedDays: number;
  weightEntries: WeightEntry[];
  weekDates: string[];
  consistencyPct: number;
}): WeeklySummaryResult {
  const {
    weekLabel,
    avgCalories,
    targetCalories,
    avgProtein,
    targetProtein,
    avgCarbs,
    avgFat,
    avgFibre,
    targetFibre,
    loggedDays,
    weightEntries,
    weekDates,
    consistencyPct,
  } = params;

  const start = weekDates[0];
  const end = weekDates[6];
  const sortedWeights = sortWeightEntriesChronological(
    weightEntries.filter((w) => w.date >= start && w.date <= end),
    'asc'
  );
  const weightChangeKg =
    sortedWeights.length >= 2
      ? round2(sortedWeights[sortedWeights.length - 1].weightKg - sortedWeights[0].weightKg)
      : null;

  const highlights: string[] = [];
  const areasToImprove: string[] = [];
  const practicalSuggestions: string[] = [];

  if (loggedDays === 0) {
    areasToImprove.push('No food entries logged during this week.');
    practicalSuggestions.push('Log at least one meal today to build your weekly baseline.');
  } else {
    highlights.push(
      `Logged ${loggedDays}/7 days averaging ${avgCalories.toLocaleString()} kcal and ${avgProtein}g protein/day.`
    );
    if (targetCalories > 0) {
      const diff = avgCalories - targetCalories;
      if (Math.abs(diff) <= targetCalories * 0.1) {
        highlights.push('Calorie intake stayed within ±10% of your daily goal.');
      } else if (diff > 0) {
        areasToImprove.push(`Calories averaged +${Math.round(diff)} kcal above your daily target.`);
        practicalSuggestions.push('Trim high-fat extras slightly or swap snacks for Greek yoghurt or fruit.');
      } else {
        areasToImprove.push(`Calories averaged ${Math.abs(Math.round(diff))} kcal under target.`);
        practicalSuggestions.push('Add a nutrient-dense snack like oats, milk, or nuts if energy feels low.');
      }
    }
    if (targetProtein > 0) {
      if (avgProtein >= targetProtein * 0.9) {
        highlights.push(`Strong protein adherence (${Math.round((avgProtein / targetProtein) * 100)}% of target).`);
      } else {
        areasToImprove.push(`Protein averaged ${avgProtein}g vs ${targetProtein}g target.`);
        practicalSuggestions.push('Include one dedicated protein item (eggs, curd, paneer, tofu, chicken, or whey) at breakfast.');
      }
    }
    if (targetFibre > 0 && avgFibre < targetFibre * 0.75) {
      areasToImprove.push(`Fibre averaged ${avgFibre}g vs ${targetFibre}g goal.`);
      practicalSuggestions.push('Add 1 bowl of sambar/dal, steamed broccoli, or chia seeds daily.');
    }
  }

  if (weightChangeKg !== null) {
    highlights.push(`In-week weight shift: ${weightChangeKg > 0 ? '+' : ''}${weightChangeKg} kg.`);
  }

  return {
    provider: 'deterministic_analytics',
    weekLabel,
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFat,
    avgFibre,
    loggedDays,
    weightChangeKg,
    consistencyPct,
    headline:
      loggedDays >= 5
        ? 'Consistent weekly nutrition tracking.'
        : loggedDays > 0
        ? 'Steady progress — keep logging daily.'
        : 'Start logging meals this week to see trends.',
    highlights,
    areasToImprove,
    practicalSuggestions,
  };
}
