import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { CategorySource, TransactionFlow } from "@prisma/client";
import {
  extractTxFeatures,
  featuresToTokenBag,
  type TxFeatures,
} from "@/server/taxonomy/features";

export const MODEL_MATCHER_PREFIX = "clf-";
export const DEFAULT_MODEL_MIN_CONFIDENCE = 90;
export const DEFAULT_HASH_DIMS = 2048;

export type ModelPrediction = {
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  categorySource: CategorySource;
  categoryMatcherVersion: string;
  reasons: string[];
};

export type CategoryModelArtefact = {
  version: string;
  trainedAt: string;
  hashDims: number;
  labels: string[];
  /** One weight vector per label (length = hashDims + 1 bias). */
  weights: number[][];
  metrics: {
    trainCount: number;
    testCount: number;
    accuracy: number;
    precisionAt90: number | null;
    coverageAt90: number | null;
  };
  labelToFlow: Record<string, TransactionFlow>;
};

export type TrainExample = {
  features: TxFeatures;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  merchantKey: string | null;
};

function labelKey(parent: string, expense: string): string {
  return `${parent}||${expense}`;
}

function parseLabel(key: string): { parentCategory: string; expenseCategory: string } {
  const [parentCategory, expenseCategory] = key.split("||");
  return { parentCategory, expenseCategory };
}

function hashToken(token: string, dims: number): number {
  const digest = createHash("sha256").update(token).digest();
  return digest.readUInt32BE(0) % dims;
}

function vectorize(bag: string, dims: number): Float64Array {
  const vec = new Float64Array(dims);
  const tokens = bag.split(" ").filter(Boolean);
  if (tokens.length === 0) return vec;
  const tf = 1 / Math.sqrt(tokens.length);
  for (const token of tokens) {
    const idx = hashToken(token, dims);
    vec[idx] += tf;
  }
  return vec;
}

function dot(weights: number[], vec: Float64Array): number {
  let sum = weights[weights.length - 1] ?? 0; // bias
  const n = Math.min(weights.length - 1, vec.length);
  for (let i = 0; i < n; i += 1) sum += weights[i]! * vec[i]!;
  return sum;
}

function sigmoid(x: number): number {
  if (x >= 20) return 1;
  if (x <= -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((v) => v / sum);
}

export function modelsRootDir(): string {
  return path.join(process.cwd(), "models", "category-clf");
}

export function resolveModelVersion(explicit?: string | null): string | null {
  return explicit || process.env.CATEGORY_MODEL_VERSION || null;
}

export function modelMinConfidence(): number {
  const raw = process.env.CATEGORY_MODEL_MIN_CONFIDENCE;
  const n = raw ? Number(raw) : DEFAULT_MODEL_MIN_CONFIDENCE;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : DEFAULT_MODEL_MIN_CONFIDENCE;
}

export function isModelShadowMode(): boolean {
  return process.env.CATEGORY_MODEL_SHADOW === "1" || process.env.CATEGORY_MODEL_SHADOW === "true";
}

let cachedArtefact: CategoryModelArtefact | null = null;
let cachedVersion: string | null = null;

export function invalidateModelCache() {
  cachedArtefact = null;
  cachedVersion = null;
}

export function loadCategoryModel(version?: string | null): CategoryModelArtefact | null {
  const ver = resolveModelVersion(version);
  if (!ver) return null;
  if (cachedArtefact && cachedVersion === ver) return cachedArtefact;

  const file = path.join(modelsRootDir(), ver, "model.json");
  if (!existsSync(file)) return null;
  const artefact = JSON.parse(readFileSync(file, "utf8")) as CategoryModelArtefact;
  cachedArtefact = artefact;
  cachedVersion = ver;
  return artefact;
}

export function saveCategoryModel(artefact: CategoryModelArtefact): string {
  const dir = path.join(modelsRootDir(), artefact.version);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "model.json");
  writeFileSync(file, JSON.stringify(artefact, null, 2), "utf8");
  invalidateModelCache();
  return file;
}

export function predictWithModel(
  artefact: CategoryModelArtefact,
  features: TxFeatures,
): ModelPrediction | null {
  const bag = featuresToTokenBag(features);
  const vec = vectorize(bag, artefact.hashDims);
  const logits = artefact.weights.map((w) => dot(w, vec));
  const probs = softmax(logits);
  let bestIdx = 0;
  for (let i = 1; i < probs.length; i += 1) {
    if ((probs[i] ?? 0) > (probs[bestIdx] ?? 0)) bestIdx = i;
  }
  const label = artefact.labels[bestIdx];
  if (!label) return null;
  const confidence = Math.round((probs[bestIdx] ?? 0) * 100);
  const { parentCategory, expenseCategory } = parseLabel(label);
  const flowType = artefact.labelToFlow[label] ?? "EXPENSE";
  const version = artefact.version.startsWith(MODEL_MATCHER_PREFIX)
    ? artefact.version
    : `${MODEL_MATCHER_PREFIX}${artefact.version}`;

  return {
    parentCategory,
    expenseCategory,
    flowType,
    confidence,
    categorySource: "MODEL",
    categoryMatcherVersion: version,
    reasons: [`model:${version}`],
  };
}

export function predictFromPayload(
  payload: unknown,
  directionHint?: string | null,
  options?: { version?: string | null; minConfidence?: number },
): ModelPrediction | null {
  const artefact = loadCategoryModel(options?.version);
  if (!artefact) return null;
  const features = extractTxFeatures(payload, directionHint);
  const pred = predictWithModel(artefact, features);
  if (!pred) return null;
  const minConf = options?.minConfidence ?? modelMinConfidence();
  if (pred.confidence < minConf) return null;
  return pred;
}

function splitByMerchant(
  examples: TrainExample[],
  testRatio = 0.2,
): { train: TrainExample[]; test: TrainExample[] } {
  const byMerchant = new Map<string, TrainExample[]>();
  for (const ex of examples) {
    const key = ex.merchantKey || `anon:${ex.features.descriptionNormalized.slice(0, 40)}`;
    const list = byMerchant.get(key) ?? [];
    list.push(ex);
    byMerchant.set(key, list);
  }
  const keys = [...byMerchant.keys()].sort();
  const testKeyCount = Math.max(1, Math.floor(keys.length * testRatio));
  const testKeys = new Set(keys.slice(0, testKeyCount));
  const train: TrainExample[] = [];
  const test: TrainExample[] = [];
  for (const [key, list] of byMerchant) {
    (testKeys.has(key) ? test : train).push(...list);
  }
  if (train.length === 0 || test.length === 0) {
    const cut = Math.max(1, Math.floor(examples.length * (1 - testRatio)));
    return { train: examples.slice(0, cut), test: examples.slice(cut) };
  }
  return { train, test };
}

export function trainCategoryModel(
  examples: TrainExample[],
  options?: { version?: string; hashDims?: number; epochs?: number; learningRate?: number },
): CategoryModelArtefact {
  if (examples.length < 10) {
    throw new Error("Need at least 10 labelled examples to train");
  }

  const hashDims = options?.hashDims ?? DEFAULT_HASH_DIMS;
  const epochs = options?.epochs ?? 8;
  const lr = options?.learningRate ?? 0.35;
  const version =
    options?.version ??
    `${MODEL_MATCHER_PREFIX}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  const { train, test } = splitByMerchant(examples);
  const labelSet = new Map<string, TransactionFlow>();
  for (const ex of train) {
    const key = labelKey(ex.parentCategory, ex.expenseCategory);
    if (!labelSet.has(key)) labelSet.set(key, ex.flowType);
  }
  // Ensure rare test labels exist
  for (const ex of examples) {
    const key = labelKey(ex.parentCategory, ex.expenseCategory);
    if (!labelSet.has(key)) labelSet.set(key, ex.flowType);
  }

  const labels = [...labelSet.keys()].sort();
  if (labels.length < 2) {
    throw new Error("Need at least 2 distinct labels to train");
  }

  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const weights: number[][] = labels.map(() => Array(hashDims + 1).fill(0));

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const ex of train) {
      const y = labelIndex.get(labelKey(ex.parentCategory, ex.expenseCategory));
      if (y == null) continue;
      const vec = vectorize(featuresToTokenBag(ex.features), hashDims);
      const logits = weights.map((w) => dot(w, vec));
      const probs = softmax(logits);
      for (let c = 0; c < labels.length; c += 1) {
        const target = c === y ? 1 : 0;
        const err = (probs[c] ?? 0) - target;
        const w = weights[c]!;
        for (let i = 0; i < hashDims; i += 1) {
          if (vec[i]) w[i] = w[i]! - lr * err * vec[i]!;
        }
        w[hashDims] = w[hashDims]! - lr * err;
      }
    }
  }

  let correct = 0;
  let at90Correct = 0;
  let at90Total = 0;
  const artefactPreview: CategoryModelArtefact = {
    version,
    trainedAt: new Date().toISOString(),
    hashDims,
    labels,
    weights,
    metrics: {
      trainCount: train.length,
      testCount: test.length,
      accuracy: 0,
      precisionAt90: null,
      coverageAt90: null,
    },
    labelToFlow: Object.fromEntries(labelSet),
  };

  const evalSet = test.length > 0 ? test : train;
  for (const ex of evalSet) {
    const pred = predictWithModel(artefactPreview, ex.features);
    if (!pred) continue;
    const ok =
      pred.parentCategory === ex.parentCategory &&
      pred.expenseCategory === ex.expenseCategory;
    if (ok) correct += 1;
    if (pred.confidence >= 90) {
      at90Total += 1;
      if (ok) at90Correct += 1;
    }
  }

  artefactPreview.metrics.accuracy = evalSet.length === 0 ? 0 : correct / evalSet.length;
  artefactPreview.metrics.precisionAt90 =
    at90Total === 0 ? null : at90Correct / at90Total;
  artefactPreview.metrics.coverageAt90 =
    evalSet.length === 0 ? null : at90Total / evalSet.length;

  return artefactPreview;
}

/** Convenience: predict and optionally ignore confidence floor (shadow). */
export function applyModelToPayload(
  payload: unknown,
  direction: string,
  options?: { shadow?: boolean; version?: string | null },
): ModelPrediction | null {
  const shadow = options?.shadow ?? isModelShadowMode();
  const artefact = loadCategoryModel(options?.version);
  if (!artefact) return null;
  const features = extractTxFeatures(payload, direction);
  const pred = predictWithModel(artefact, features);
  if (!pred) return null;
  if (shadow) {
    console.info(
      "[category-model:shadow]",
      pred.categoryMatcherVersion,
      pred.confidence,
      pred.parentCategory,
      pred.expenseCategory,
    );
    return null;
  }
  if (pred.confidence < modelMinConfidence()) return null;
  return pred;
}
