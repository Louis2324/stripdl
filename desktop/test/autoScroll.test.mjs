import test from "node:test";
import assert from "node:assert/strict";
import {
  getAutoScrollStep,
  getNextAutoScrollTop,
  isAutoScrollScrollEvent,
} from "../renderer/src/lib/autoScroll.mjs";

test("auto-scroll advances according to the selected speed", () => {
  assert.equal(getAutoScrollStep(1, 50), 3);
  assert.equal(getAutoScrollStep(4, 50), 12);
});

test("auto-scroll clamps at the bottom and reports the end", () => {
  assert.deepEqual(
    getNextAutoScrollTop({
      scrollTop: 90,
      scrollHeight: 100,
      clientHeight: 20,
      speed: 1,
      elapsedMs: 100,
    }),
    { nextTop: 80, atEnd: true },
  );
});

test("auto-scroll markers distinguish its own scroll from user movement", () => {
  const marker = { top: 120, expiresAt: 200 };
  assert.equal(isAutoScrollScrollEvent(120, marker, 150), true);
  assert.equal(isAutoScrollScrollEvent(130, marker, 150), false);
  assert.equal(isAutoScrollScrollEvent(120, marker, 250), false);
});
