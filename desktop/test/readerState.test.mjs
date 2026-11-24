import test from "node:test";
import assert from "node:assert/strict";
import {
  getReaderContentState,
  resolveReaderStartPage,
} from "../renderer/src/lib/readerState.mjs";

test("reader content state distinguishes loading from empty", () => {
  assert.equal(getReaderContentState({ loading: true, error: null, pageCount: 0 }), "loading");
  assert.equal(getReaderContentState({ loading: false, error: null, pageCount: 0 }), "empty");
});

test("reader content state preserves error and ready states", () => {
  assert.equal(getReaderContentState({ loading: false, error: "disk failure", pageCount: 0 }), "error");
  assert.equal(getReaderContentState({ loading: false, error: null, pageCount: 3 }), "ready");
});

test("an explicit chapter start overrides saved per-chapter progress", () => {
  assert.equal(resolveReaderStartPage(0, 24, 26), 0);
  assert.equal(resolveReaderStartPage(null, 24, 26), 24);
  assert.equal(resolveReaderStartPage(null, 100, 26), 25);
});

