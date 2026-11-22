/**
 * CALOTHRIX Production Verification Suite
 * Verifies:
 * 1. Smart Calorie Calculator math, unrounded internal reconciliation, minor/pregnancy safety
 * 2. Food search accuracy for Indian staples & household portions (roti, dosa, idli, dal, rice, katori)
 * 3. Nutrition scaling & missing-nutrient safety (never outputs NaN/Infinity)
 * 4. Security & API hardening against live local server (/healthz, security headers, 401 auth gates,
 *    MIME validation on media upload, OAuth callback origin safety, privacy disclosure)
 */

import assert from 'node:assert/strict';
import { DEFAULT_FOODS } from '../src/data/defaultFoods.ts';
import type { UserProfile } from '../src/types/index.ts';
import { calculateSmartFitnessTargets } from '../src/utils/fitnessCalculator.ts';
import { searchFoodsIntelligent } from '../src/utils/foodSearchEngine.ts';
import { calculateScaledNutrition } from '../src/utils/nutritionUtils.ts';
import { getPortionsForFood } from '../src/utils/portionEngine.ts';

let passed = 0;
let failed = 0;

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'test-user',
    name: 'Test Athlete',
    email: 'test@example.com',
    age: 26,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 72,
    targetWeightKg: 66,
    dailyAverageSteps: 8000,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    workoutIntensity: 'moderate',
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    dietaryPreference: 'omnivore',
    foodRestrictions: [],
    accountRole: 'individual',
    roleSelected: true,
    isDemoProfile: false,
    ...overrides,
  };
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runSuite() {
  console.log('\n=== 1. Calculator & Safety Verification ===');

  await test('Adult Mifflin-St Jeor BMR & TDEE reconcile cleanly without double-counting', () => {
    const plan = calculateSmartFitnessTargets(makeProfile());
    // Mifflin-St Jeor: 10*72 + 6.25*175 - 5*26 + 5 = 720 + 1093.75 - 130 + 5 = 1688.75
    assert.ok(Math.abs(plan.bmrExact - 1688.75) < 0.01, `Unexpected BMR ${plan.bmrExact}`);
    assert.ok(plan.estimatedTdee > plan.bmr, 'TDEE must exceed BMR');
    assert.ok(plan.recommendedCalories < plan.estimatedTdee, 'Lose weight target must be below TDEE');
    assert.ok(plan.recommendedCalories >= 1500, 'Adult male calorie floor respected');
    assert.ok(plan.activityMultiplier >= 1.2 && plan.activityMultiplier <= 2.2);
  });

  await test('Minor (age 16) safety flow blocks automated calorie deficit', () => {
    const minorPlan = calculateSmartFitnessTargets(
      makeProfile({
        age: 16,
        biologicalSex: 'female',
        heightCm: 160,
        currentWeightKg: 58,
        targetWeightKg: 50,
        goalSpeed: 'aggressive',
      })
    );
    assert.equal(minorPlan.pathway, 'adolescent', 'Adolescent safety pathway must trigger for age 16');
    assert.equal(minorPlan.deficitBlocked, true, 'Minors must never receive automated calorie deficit');
    assert.ok(Math.abs(minorPlan.calorieDelta) <= 5, 'Minor targets must stay at maintenance (no automated deficit)');
  });

  await test('Pregnancy/breastfeeding safety blocks calorie deficit', () => {
    const pregPlan = calculateSmartFitnessTargets(
      makeProfile({
        age: 29,
        biologicalSex: 'female',
        heightCm: 162,
        currentWeightKg: 64,
        targetWeightKg: 56,
        isPregnantOrBreastfeeding: true,
      })
    );
    assert.equal(pregPlan.deficitBlocked, true, 'Deficit must be blocked during pregnancy/breastfeeding');
    assert.ok(
      /pregnan|breastfeed|deficit/i.test(pregPlan.safetyNote || ''),
      'Pregnancy safety note must be present'
    );
    assert.ok(
      pregPlan.recommendedCalories >= pregPlan.estimatedTdee,
      'Must not prescribe deficit during pregnancy'
    );
  });

  console.log('\n=== 2. Indian Food Search & Portion Engine Verification ===');

  for (const staple of ['roti', 'dosa', 'idli', 'dal', 'paneer', 'rice']) {
    await test(`Food search finds Indian staple "${staple}" in top results`, () => {
      const results = searchFoodsIntelligent(DEFAULT_FOODS, staple, { limit: 8 });
      assert.ok(results.length > 0, `Expected search results for "${staple}"`);
      const topNames = results.slice(0, 5).map((f) => f.name.toLowerCase());
      assert.ok(
        topNames.some((n) => n.includes(staple) || (staple === 'roti' && n.includes('chapati'))),
        `Expected "${staple}" in top 5 results, got: ${topNames.join(', ')}`
      );
    });
  }

  await test('Household portion options exist for staple foods & scaling avoids NaN', () => {
    const dalRes = searchFoodsIntelligent(DEFAULT_FOODS, 'dal', { limit: 3 });
    assert.ok(dalRes.length > 0);
    const dal = dalRes[0];
    const portions = getPortionsForFood(dal);
    assert.ok(portions.length >= 2, 'Expected multiple household portion presets');
    const scaled = calculateScaledNutrition(dal, 150);
    assert.ok(Number.isFinite(scaled.calories) && scaled.calories > 0);
    assert.ok(Number.isFinite(scaled.protein));
    assert.ok(Number.isFinite(scaled.carbs));
    assert.ok(Number.isFinite(scaled.fat));
  });

  console.log('\n=== 3. Live Server Security & API Verification ===');

  const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
  let serverReachable = false;
  try {
    const health = await fetch(`${baseUrl}/healthz`);
    serverReachable = health.ok;
  } catch {
    serverReachable = false;
  }

  if (!serverReachable) {
    console.log(`  SKIP  Live HTTP checks (no server listening on ${baseUrl})`);
  } else {
    await test('GET /healthz returns 200 and security headers (no X-Powered-By)', async () => {
      const res = await fetch(`${baseUrl}/healthz`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By must be disabled');
      assert.ok(res.headers.get('x-content-type-options') === 'nosniff');
      assert.ok(res.headers.get('x-request-id'));
    });

    await test('Unauthenticated POST /api/ai/coach is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'How much protein?' }),
      });
      assert.equal(res.status, 401);
    });

    await test('Unauthenticated POST /api/ai/training-event is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/ai/training-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputMode: 'text' }),
      });
      assert.equal(res.status, 401);
    });

    await test('Unauthenticated DELETE /api/account is rejected with 401', async () => {
      const res = await fetch(`${baseUrl}/api/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      assert.equal(res.status, 401);
    });

    await test('POST /api/ai/analyze-meal rejects disallowed MIME types with 400', async () => {
      const res = await fetch(`${baseUrl}/api/ai/analyze-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'photo',
          imageBase64: Buffer.from('hello').toString('base64'),
          imageMimeType: 'application/x-msdownload',
        }),
      });
      assert.equal(res.status, 400);
    });

    await test('GET /auth/callback uses window.location.origin (never wildcard *)', async () => {
      const res = await fetch(`${baseUrl}/auth/callback`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('window.location.origin'), 'OAuth callback must target window.location.origin');
      assert.ok(!html.includes(", '*'"), 'OAuth callback must never postMessage to wildcard *');
    });

    await test('GET /privacy discloses external AI processing (Google Gemini)', async () => {
      const res = await fetch(`${baseUrl}/privacy`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(/Gemini/i.test(html), 'Privacy policy must disclose Google Gemini AI processing');
      assert.ok(!html.includes('darshants6364@gmail.com'), 'Personal Gmail must not be hardcoded');
    });
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
