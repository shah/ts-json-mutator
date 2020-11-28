import { jsonPatch, safety } from "./deps.ts";

export type JsonPointer = string;

export interface JsonMutationsSupplier {
  readonly addValue: <V>(path: JsonPointer, value: V) => unknown;
  readonly replaceValue: <V>(path: JsonPointer, value: V) => unknown;
  readonly removeValues: (...path: JsonPointer[]) => unknown;
  readonly removeValue: (path: JsonPointer) => unknown;
}

export interface JsonMutationResult<T> {
  readonly mutated: T;
}

export function isJsonMutationResult<T>(
  o: unknown,
): o is JsonMutationResult<T> {
  const isJMR = safety.typeGuard<JsonMutationResult<T>>("mutated");
  return isJMR(o);
}

export interface JsonMutationError {
  readonly isJsonMutationError: true;
}

export const isJsonMutationError = safety.typeGuard<JsonMutationError>(
  "isJsonMutationError",
);

export interface JsonMutator<T> {
  (): JsonMutationResult<T> | JsonMutationError;
}

export type JsonPatchOps = JsonPatchOp[];

export interface JsonPatchOp {
  readonly op: "add" | "remove" | "replace";
}

export const isJsonPatchOp = safety.typeGuard<JsonPatchOp>("op");
export const isJsonPatchOpPath = safety.typeGuard<{ path: JsonPointer }>(
  "path",
);

export interface JsonPatchAddOp<V> extends JsonPatchOp {
  readonly op: "add";
  readonly path: JsonPointer;
  readonly value: V;
}

export interface JsonPatchReplaceOp<V> extends JsonPatchOp {
  readonly op: "replace";
  readonly path: JsonPointer;
  readonly value: V;
}

export interface JsonPatchRemoveOp extends JsonPatchOp {
  readonly op: "remove";
  readonly path: JsonPointer;
}

export interface JsonPatchOpsSupplier {
  (): JsonPatchOps;
}

export interface JsonPatchMutationsSupplier extends JsonMutationsSupplier {
  readonly addValue: <V>(path: JsonPointer, value: V) => JsonPatchAddOp<V>;
  readonly replaceValue: <V>(
    path: JsonPointer,
    value: V,
  ) => JsonPatchReplaceOp<V>;
  readonly removeValues: (...path: JsonPointer[]) => JsonPatchRemoveOp[];
  readonly removeValue: (path: JsonPointer) => JsonPatchRemoveOp;
  readonly patchOps: JsonPatchOpsSupplier;
}

export function jsonPatchMutationsSupplier(): JsonPatchMutationsSupplier {
  const patchOps: JsonPatchOps = [];
  return {
    addValue: <V>(path: JsonPointer, value: V): JsonPatchAddOp<V> => {
      const op: JsonPatchAddOp<V> = { op: "add", path, value };
      patchOps.push(op);
      return op;
    },
    replaceValue: <V>(path: JsonPointer, value: V): JsonPatchReplaceOp<V> => {
      const op: JsonPatchReplaceOp<V> = { op: "replace", path, value };
      patchOps.push(op);
      return op;
    },
    removeValues: (...path: JsonPointer[]): JsonPatchRemoveOp[] => {
      const removes = [];
      for (const p of path) {
        const op: JsonPatchRemoveOp = { op: "remove", path: p };
        patchOps.push(op);
        removes.push(op);
      }
      return removes;
    },
    removeValue: (path: JsonPointer): JsonPatchRemoveOp => {
      const op: JsonPatchRemoveOp = { op: "remove", path };
      patchOps.push(op);
      return op;
    },
    patchOps: (): JsonPatchOp[] => {
      return patchOps;
    },
  };
}

export interface AnchoredJsonMutationsSupplier
  extends JsonPatchMutationsSupplier {
  readonly anchor: (path: JsonPointer) => JsonPointer;
}

export function jsonPatchAnchoredMutationsSupplier(
  jpms: JsonPatchMutationsSupplier,
  anchor: (path: JsonPointer) => JsonPointer,
): AnchoredJsonMutationsSupplier {
  const patchOps: JsonPatchOps = [];
  return {
    anchor: anchor,
    addValue: <V>(path: JsonPointer, value: V): JsonPatchAddOp<V> => {
      return jpms.addValue(anchor(path), value);
    },
    replaceValue: <V>(
      path: JsonPointer,
      value: V,
    ): JsonPatchReplaceOp<V> => {
      return jpms.replaceValue(anchor(path), value);
    },
    removeValues: (...paths: JsonPointer[]): JsonPatchRemoveOp[] => {
      const removes = [];
      for (const path of paths) {
        removes.push(jpms.removeValue(anchor(path)));
      }
      return removes;
    },
    removeValue: (path: JsonPointer): JsonPatchRemoveOp => {
      return jpms.removeValue(anchor(path));
    },
    patchOps: jpms.patchOps,
  };
}

export interface JsonPatchMutationResult<T> extends JsonMutationResult<T> {
  readonly patchOps: JsonPatchOps;
}

export function isJsonPatchMutationResult<T>(
  o: unknown,
): o is JsonPatchMutationResult<T> {
  const isJMR = safety.typeGuard<JsonPatchMutationResult<T>>(
    "mutated",
    "patchOps",
  );
  return isJMR(o);
}

export interface JsonPatchMutationError extends JsonMutationError {
  readonly patchOps: JsonPatchOps;
  readonly error: Error;
}

export const isJsonPatchMutationError = safety.typeGuard<
  JsonPatchMutationError
>(
  "isJsonMutationError",
  "error",
  "patchOps",
);

export interface JsonPatchOpValidator<T> {
  (
    jpo: JsonPatchOp,
    opIndex: number,
    src: T,
    pathFragment: JsonPointer,
  ): boolean;
}

export interface JsonPatchError {
  readonly name: string;
  readonly index: number;
  readonly operation: JsonPatchOp;
  readonly tree: unknown;
}

export function jsonPatchOpEquivalent(
  jpo: JsonPatchOp,
  jpe: JsonPatchError,
): boolean {
  if (jpo.op != jpe.operation.op) return false;
  if (isJsonPatchOpPath(jpo) && isJsonPatchOpPath(jpe.operation)) {
    if (jpo.path != jpe.operation.path) return false;
  }
  return true;
}

export interface JsonPatchMutatorOptions<T> {
  readonly patchOpValidator?: JsonPatchOpValidator<T>;
}

export function jsonPatchMutator<T>(
  src: T,
  patchOps: JsonPatchOps,
  options: JsonPatchMutatorOptions<T> = {},
): JsonMutator<T> {
  const { patchOpValidator } = options;
  return (): JsonMutationResult<T> | JsonMutationError => {
    try {
      const patches = jsonPatch.applyPatch(
        src,
        patchOps,
        patchOpValidator || false,
        false,
        true,
      );
      const result: JsonPatchMutationResult<T> = {
        mutated: patches[patches.length - 1].newDocument as T,
        patchOps,
      };
      return result;
    } catch (err) {
      const result: JsonPatchMutationError = {
        isJsonMutationError: true,
        patchOps: patchOps,
        error: err,
      };
      return result;
    }
  };
}

export function filterInvalidOps<T>(
  patchOps: JsonPatchOps,
  src: T,
): JsonPatchOps {
  const jpe = jsonPatch.validate(
    patchOps,
    src,
    null,
  ) as (JsonPatchError | undefined);
  if (jpe) {
    if (
      jpe && jpe.operation.op == "remove" &&
      jpe.name == "OPERATION_PATH_UNRESOLVABLE"
    ) {
      const filtered = patchOps.filter((po) => {
        return !jsonPatchOpEquivalent(po, jpe);
      });
      return filterInvalidOps(
        filtered,
        src,
      );
    }
  }
  return patchOps;
}

export function buildArrayItemsJsonPatchOps<T>(
  src: Record<string, unknown>,
  parent: JsonPointer,
  predicate: (
    item: T,
    index: number,
    parent: JsonPointer,
  ) => JsonPatchOp | JsonPatchOps | undefined,
): JsonPatchOps {
  const result: JsonPatchOps = [];
  const value = jsonPatch.getValueByPointer(src, parent);
  if (value) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const op = predicate(value[i], i, parent);
        if (op) {
          if (Array.isArray(op)) {
            result.push(...op);
          } else {
            result.push(op);
          }
        }
      }
    }
  }
  return result;
}
