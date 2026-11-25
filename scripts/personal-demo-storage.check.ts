import assert from "node:assert/strict";
import { MENU_STORAGE_KEY } from "../src/lib/menu";
import {
  loadPersonalDemo,
  personalDemoStorageKey,
  PERSONAL_DEMO_KEY_PREFIX,
  resetPersonalDemo,
  savePersonalDemo,
} from "../src/lib/personal-demo-storage";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

const memory = new Map<string, string>();
const localStorage = {
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  setItem(key: string, value: string) {
    if (String(value).length > 3_500_000) {
      const err = new Error("quota") as Error & { name: string };
      err.name = "QuotaExceededError";
      throw err;
    }
    memory.set(key, String(value));
  },
  removeItem(key: string) {
    memory.delete(key);
  },
};

Object.defineProperty(globalThis, "window", {
  value: {
    localStorage,
    dispatchEvent() {},
  },
  configurable: true,
});

assert.equal(personalDemoStorageKey(userA), `${PERSONAL_DEMO_KEY_PREFIX}${userA}`);
assert.equal(personalDemoStorageKey(userB), `${PERSONAL_DEMO_KEY_PREFIX}${userB}`);
assert.notEqual(personalDemoStorageKey(userA), personalDemoStorageKey(userB));
assert.notEqual(personalDemoStorageKey(userA), MENU_STORAGE_KEY);

const firstA = loadPersonalDemo(userA);
assert.equal(firstA.ok, true);
if (!firstA.ok) throw new Error("firstA");
assert.equal(firstA.value.userId, userA);

firstA.value.menu.venue.name = "Кафе А";
const savedA = savePersonalDemo(userA, firstA.value);
assert.equal(savedA.ok, true);
if (!savedA.ok) throw new Error("savedA");
assert.equal(savedA.value.menu.venue.name, "Кафе А");

const reloadA = loadPersonalDemo(userA);
assert.equal(reloadA.ok, true);
if (!reloadA.ok) throw new Error("reloadA");
assert.equal(reloadA.value.menu.venue.name, "Кафе А");

const firstB = loadPersonalDemo(userB);
assert.equal(firstB.ok, true);
if (!firstB.ok) throw new Error("firstB");
assert.notEqual(firstB.value.menu.venue.name, "Кафе А");
assert.equal(memory.has(`${PERSONAL_DEMO_KEY_PREFIX}${userA}`), true);
assert.equal(memory.has(`${PERSONAL_DEMO_KEY_PREFIX}${userB}`), true);
assert.equal(memory.has(MENU_STORAGE_KEY), false);

const cross = savePersonalDemo(userA, { ...firstB.value, userId: userB });
assert.equal(cross.ok, false);
if (cross.ok) throw new Error("cross");
assert.equal(cross.code, "userid");

const reset = resetPersonalDemo(userA);
assert.equal(reset.ok, true);
if (!reset.ok) throw new Error("reset");
assert.notEqual(reset.value.menu.venue.name, "Кафе А");

memory.set(`${PERSONAL_DEMO_KEY_PREFIX}${userA}`, "{not-json");
const recovered = loadPersonalDemo(userA);
assert.equal(recovered.ok, true);
if (!recovered.ok) throw new Error("recovered");
assert.equal(typeof recovered.value.menu.venue.name, "string");

const huge = structuredClone(reloadA.value);
huge.userId = userA;
huge.menu.venue.banner = `data:image/jpeg;base64,${"a".repeat(2_000_000)}`;
const quota = savePersonalDemo(userA, huge);
assert.equal(quota.ok, false);
if (quota.ok) throw new Error("quota");
assert.ok(quota.code === "quota" || quota.code === "image");

console.log("personal-demo-storage.check: OK");
