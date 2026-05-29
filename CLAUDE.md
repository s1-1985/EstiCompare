# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# Development (runs Vite dev server + Express backend concurrently via tsx)
npm run dev

# Type-check (no emit)
npm run lint

# Production build (Vite + esbuild for server.ts)
npm run build

# Run production build
npm start
```

`npm run dev` starts the Express backend (`server.ts`) via `tsx`, which also serves as the Vite dev proxy host. Vite forwards `/api/**` requests to `http://localhost:3000` (configured in `vite.config.ts`).

There is no test runner configured.

---

## Architecture Overview

EstiCompare is a **manufacturing cost estimation comparison SPA** for Japanese suppliers. Its core purpose is helping users create "dressed-up" (架空) quote breakdowns — where the internal actual cost differs from the client-facing itemized cost — while maintaining a defined profit margin.

### Stack

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4
- **Backend**: Express (`server.ts`) — all API calls go through this for Gemini proxying and auth verification
- **AI**: Google Gemini 2.5 Flash via `@google/genai` (model: `gemini-2.5-flash`)
- **Auth**: Firebase Auth (Google Sign-In popup)
- **DB**: Firestore (real-time subscription via `onSnapshot`)
- **Hosting**: Firebase Hosting + Cloud Run (asia-northeast1); CI/CD via `.github/workflows/deploy.yml`

### Key Files

| File | Role |
|------|------|
| `src/App.tsx` | Root component; auth state, layout (resizable header + scroll pane), `handleAutoReconcile` |
| `src/types.ts` | All shared types (`DetailedEstimate`, `ProcessRow`, `Scenario`, etc.) |
| `src/utils/calculations.ts` | Pure cost calculation logic (`calculateEstimate`) |
| `src/utils/firestoreService.ts` | Firestore CRUD + real-time subscription |
| `src/utils/apiClient.ts` | Auth-aware `fetch` wrapper with 429 retry |
| `src/firebase.ts` | Firebase init, `handleFirestoreError`, `OperationType` enum |
| `src/components/ExcelGrid.tsx` | Process/material/logistics input grid (Sheet 1) |
| `src/components/CompareResults.tsx` | AI audit report display (Sheet 2) |
| `src/components/PrintSheet.tsx` | Print/Excel export (Sheet 3) |
| `src/components/ScenarioLibrary.tsx` | Saved scenarios list with AI analysis |
| `server.ts` | Express server; all `/api/*` endpoints with Firebase ID token auth + rate limiting |
| `KNOWLEDGE.md` | Business domain knowledge injected into Gemini system prompts |

### Cost Calculation Logic (calculations.ts)

```
primeCost = materialCost + sum(processCosts)
grandTotalUnitPrice = primeCost + sgaCost + shippingCostPerUnit + otherAdjustment
actualTotalCost = actualPrimeCost + actualShippingCost
auditVariance = grandTotalUnitPrice - targetUnitPrice   // 0 = perfectly balanced
```

**SGA (利管費) modes** — `sgaCalcMode` field:
- `'markup'` (外掛け): `sgaCost = primeCost × rate / (1 - rate)`, sell = cost ÷ (1 - rate)
- `'margin'` (内掛け): `sgaCost = primeCost × rate`, sell = cost × (1 + rate)

**Critical distinction** — 外掛け vs 内掛け are fundamentally different:
- 外掛け 15%: sell = cost ÷ 0.85 ≈ cost × 1.176
- 内掛け 15%: sell = cost × 1.15

Rate conversion helpers in `calculations.ts`: `rateFromCostSell()`, `sellFromCost()`, `costFromSell()`, `convertRate()`.

### ProcessRow Calculation Modes (`calcMode`)

Each process row has a `calcMode: 'standard' | 'kg' | 'lump' | 'direct'`:
- `standard`: hourlyRate ÷ yieldPerHour (cycle) + hourlyRate × totalHours ÷ lotSize (setup)
- `kg`: (finishedWeightG / 1000) × kgPrice
- `lump`: lumpSumPrice ÷ lotSize
- `direct`: directProcessingCost

Each mode has a parallel `actual*` field for internal true cost.

### Auto-Reconcile (`handleAutoReconcile` in App.tsx)

Adjusts client-facing rates proportionally so `auditVariance → 0`:
1. Back-calculates target `primeCost` from target sell price and SGA constraints
2. Scales all process `hourlyRate` / `kgPrice` / `lumpSumPrice` / `directProcessingCost` proportionally
3. Rounds rates to nearest 100 yen
4. Fine-tunes residual via SGA rate (clamped 5–15%)
5. Old estimate: sell price is fixed; new estimate: adjusts `targetUnitPrice` if not locked

### API Endpoints (server.ts)

All endpoints require **Firebase ID token** (`Authorization: Bearer <token>`) and are rate-limited (10 req/min per IP).

| Endpoint | Purpose |
|----------|---------|
| `POST /api/ping-ai` | Connection health check |
| `POST /api/parse-estimate` | Text → estimate JSON |
| `POST /api/compare-estimates` | New/old AI audit report |
| `POST /api/generate-estimate` | Spec → estimate |
| `POST /api/infer-process-params` | Process name → yield/rate estimates |
| `POST /api/calculate-shipping` | AI freight estimate |
| `POST /api/get-scrap-price` | AI scrap market price |
| `POST /api/analyze-scenario` | Scenario pattern analysis (persisted to Firestore) |

### Firestore Schema

Collection: `scenarios` — each doc has `userId`, `name`, `notes`, `newEstimate`, `oldEstimate`, `comparisonResult`, `aiAnalysis`, `createdAt`, `updatedAt`. Security rules enforce `userId == request.auth.uid`.

### Business Rules (from KNOWLEDGE.md / AGENTS.md)

- **Do not change** `yieldPerHour` or `totalHours` (setup time) during auto-reconcile — these reflect real production constraints
- Adjusted rates must be rounded to nearest **100 yen** to avoid suspicion
- SGA rate healthy range: 5–25%; warn outside this range
- Gemini calls use a 4-second interval queue to avoid rate limits

---

## Environment Variables

```
GEMINI_API_KEY=        # Required for all /api/* AI endpoints
VITE_FIREBASE_*        # Optional — firebase.ts has hardcoded fallbacks for the esticompare project
```

In production (Cloud Run), `GEMINI_API_KEY` is injected via `--set-env-vars` in the deploy workflow.
