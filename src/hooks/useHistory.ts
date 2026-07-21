import { useCallback, useReducer } from "react";

const MAX_HISTORY = 50;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

type HistoryAction<T> =
  | { type: "commit"; updater: T | ((prev: T) => T) }
  | { type: "replace"; updater: T | ((prev: T) => T) }
  | { type: "undo" }
  | { type: "redo" };

function resolve<T>(updater: T | ((prev: T) => T), prev: T): T {
  return typeof updater === "function"
    ? (updater as (prev: T) => T)(prev)
    : updater;
}

function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case "commit": {
      const next = resolve(action.updater, state.present);
      if (next === state.present) return state;
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: next,
        future: [],
      };
    }
    case "replace": {
      const next = resolve(action.updater, state.present);
      if (next === state.present) return state;
      return { ...state, present: next };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
      };
    }
  }
}

/**
 * Undo/redo state container. Unlike a setState-plus-log approach, commits are
 * handled inside a pure reducer, so StrictMode's double-invocation can't
 * duplicate history entries and there is no stale-index closure to go wrong.
 *
 * `commit` records an undo step; `replace` updates the value without one
 * (useful for changes that shouldn't be individually undoable).
 */
export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(historyReducer<T>, {
    past: [],
    present: initial,
    future: [],
  });

  const commit = useCallback(
    (updater: T | ((prev: T) => T)) => dispatch({ type: "commit", updater }),
    [],
  );
  const replace = useCallback(
    (updater: T | ((prev: T) => T)) => dispatch({ type: "replace", updater }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    replace,
    undo,
    redo,
  };
}
