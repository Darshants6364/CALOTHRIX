import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { ValidationCheckCode, VerificationStatus } from '../types';
import { isDatabaseAdmin } from '../utils/adminAccess';
import {
  buildDatabaseQualityReport,
  exportValidationReportCsv,
  getNutrientsPer100g,
  validateFoodCatalog,
} from '../utils/foodValidationEngine';

type QualityFilter =
  | 'all_issues'
  | 'needs_review'
  | 'all_records'
  | ValidationCheckCode;

function getStatusBadgeStyle(status?: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    case 'enriched':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
    case 'estimated':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
    case 'user_provided':
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30';
    case 'needs_review':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    default:
      return 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/20';
  }
}

export const AdminQualityPage: React.FC = () => {
  const { allFoods, authUser, state, notify } = useMacroLogStore();
  const hasAdminAccess = isDatabaseAdmin(authUser, state.profile);

  const [filterMode, setFilterMode] = useState<QualityFilter>('needs_review');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { validatedFoods, summary } = useMemo(() => {
    const validated = validateFoodCatalog(allFoods).validatedFoods;
    const report = buildDatabaseQualityReport(allFoods);
    return { validatedFoods: validated, summary: report };
  }, [allFoods]);

  const distinctSources = useMemo(() => {
    const set = new Set<string>();
    validatedFoods.forEach((f) => {
      if (f.sourceName) set.add(f.sourceName);
    });
    return ['All', ...Array.from(set).sort()];
  }, [validatedFoods]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return validatedFoods.filter((f) => {
      if (sourceFilter !== 'All' && f.sourceName !== sourceFilter) return false;
      if (q) {
        const hit =
          f.name.toLowerCase().includes(q) ||
          (f.foodCode || '').toLowerCase().includes(q) ||
          (f.sourceId || '').toLowerCase().includes(q) ||
          (f.sourceName || '').toLowerCase().includes(q);
        if (!hit) return false;
      }

      const issues = f.validationIssues || [];
      if (filterMode === 'all_records') return true;
      if (filterMode === 'needs_review') return f.verificationStatus === 'needs_review';
      if (filterMode === 'all_issues') return issues.length > 0;
      return issues.some((i) => i.code === filterMode);
    });
  }, [filterMode, searchQuery, sourceFilter, validatedFoods]);

  if (!hasAdminAccess) {
    return (
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-8 text-center max-w-xl mx-auto">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Admin Access Required
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The Nutrition Database Quality & Audit dashboard is an internal administrative view.
        </p>
      </section>
    );
  }

  const handleDownloadCsv = () => {
    const csv = exportValidationReportCsv(allFoods);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calothrix-nutrition-quality-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Exported database validation audit CSV');
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4E6800] dark:text-[#C8FF00]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Internal Admin Quality Dashboard
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Nutrition Database Audit & Quality
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Monitors IFCT 2017 integrity, Atwater vs source energy checks, NULL preservation, and verification statuses.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          Download CSV Audit Report
        </button>
      </section>

      {/* Summary Metrics Grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Total Records</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {summary.totalRecords}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">IFCT 2017 Master</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-emerald-700 dark:text-emerald-400">
            {summary.ifctCount}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Verified</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {summary.verifiedCount}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Estimated</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-amber-600 dark:text-amber-400">
            {summary.estimatedCount}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Needs Review</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-rose-600 dark:text-rose-400">
            {summary.needsReviewCount}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Duplicates</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {summary.duplicateCount}
          </div>
        </div>
      </section>

      {/* Nutrient Null & Validation Counts */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-xs">
          <span className="text-slate-500 dark:text-slate-400 block">Missing Protein (NULL)</span>
          <span className="font-mono-nums font-bold text-base text-slate-900 dark:text-slate-100">
            {summary.missingProteinCount}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-xs">
          <span className="text-slate-500 dark:text-slate-400 block">Missing Carbs (NULL)</span>
          <span className="font-mono-nums font-bold text-base text-slate-900 dark:text-slate-100">
            {summary.missingCarbsCount}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-xs">
          <span className="text-slate-500 dark:text-slate-400 block">Missing Fat (NULL)</span>
          <span className="font-mono-nums font-bold text-base text-slate-900 dark:text-slate-100">
            {summary.missingFatCount}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-xs">
          <span className="text-slate-500 dark:text-slate-400 block">Missing Fibre (NULL)</span>
          <span className="font-mono-nums font-bold text-base text-slate-900 dark:text-slate-100">
            {summary.missingFibreCount}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-xs">
          <span className="text-slate-500 dark:text-slate-400 block">Energy Mismatch (&gt;15%)</span>
          <span className="font-mono-nums font-bold text-base text-rose-600 dark:text-rose-400">
            {summary.inconsistentEnergyCount}
          </span>
        </div>
      </section>

      {/* Filters & Search */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by food name, IFCT code (e.g. N001), or source..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            />
          </div>

          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as QualityFilter)}
            aria-label="Filter validation issue type"
            className="h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            <option value="needs_review">Flagged Needs Review ({summary.needsReviewCount})</option>
            <option value="energy_inconsistency">
              Energy Mismatch &gt;15% ({summary.inconsistentEnergyCount})
            </option>
            <option value="missing_nutrient">Has Missing/NULL Nutrients</option>
            <option value="proximate_sum_anomaly">Proximate Sum &gt; 105g</option>
            <option value="duplicate_code">Duplicate Codes</option>
            <option value="duplicate_food_record">Duplicate Records</option>
            <option value="negative_value">Negative Values</option>
            <option value="unit_range_error">Unit/Range Errors</option>
            <option value="all_issues">All Records With Any Notice</option>
            <option value="all_records">All Records ({summary.totalRecords})</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label="Filter by source"
            className="h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            {distinctSources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredRecords.length}</span> records
        </div>
      </section>

      {/* Inspection Table */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl divide-y divide-stone-100 dark:divide-white/10 overflow-hidden">
        {filteredRecords.slice(0, 120).map((food) => {
          const per100 = getNutrientsPer100g(food);
          const issues = food.validationIssues || [];
          return (
            <div key={food.id} className="p-4 space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {(food.foodCode || food.sourceId) && (
                    <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-slate-800 font-mono-nums font-semibold text-slate-700 dark:text-slate-300">
                      {food.foodCode || food.sourceId}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {food.name}
                  </span>
                  {food.foodState && (
                    <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-white/10 text-[11px] capitalize text-slate-600 dark:text-slate-300">
                      {food.foodState}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold capitalize ${getStatusBadgeStyle(
                      food.verificationStatus
                    )}`}
                  >
                    {(food.verificationStatus || 'verified').replace('_', ' ')}
                  </span>
                </div>

                <div className="text-slate-500 dark:text-slate-400 font-mono-nums">
                  {food.sourceName || 'Unknown'} · {food.measurementBasis || 'per_100g'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300 font-mono-nums">
                <span>
                  Source: <strong className="text-slate-900 dark:text-slate-100">{per100.calories ?? 'NULL'}</strong> kcal/100g
                </span>
                <span>
                  Atwater: <strong>{food.atwaterCalories ?? '—'}</strong> kcal/100g
                </span>
                <span>P: {per100.protein ?? 'NULL'}g</span>
                <span>C: {per100.carbs ?? 'NULL'}g</span>
                <span>F: {per100.fat ?? 'NULL'}g</span>
                <span>Fib: {per100.fibre ?? 'NULL'}g</span>
              </div>

              {issues.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {issues.map((issue, idx) => (
                    <div
                      key={`${food.id}-${issue.code}-${idx}`}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] ${
                        issue.severity === 'error'
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : issue.severity === 'warning'
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {issue.severity === 'error' ? (
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                      ) : (
                        <FileWarning className="w-3 h-3 shrink-0" />
                      )}
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Passed all validation checks
                </div>
              )}
            </div>
          );
        })}

        {filteredRecords.length > 120 && (
          <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Showing first 120 of {filteredRecords.length} records. Download the CSV report for the complete {summary.totalRecords}-record audit.
          </div>
        )}

        {filteredRecords.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No records match the selected validation filter.
          </div>
        )}
      </section>
    </div>
  );
};
