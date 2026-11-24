// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { MANAGE_PAGE, MANAGE_SCRIPT } from "./managePage.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
// The app package has no DOM types; jsdom provides the document at run time.
const doc = (): any => (globalThis as any).document;

it("drives status, people and the two-key removal gate from the real routes it calls", async () => {
  doc().documentElement.innerHTML = MANAGE_PAGE.replace(/^<!doctype html>/i, "").replace(/<script src="\/manage.js"><\/script>/, "");
  const calls: string[] = [];
  (globalThis as any).EventSource = class { addEventListener() {} close() {} };
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const body = String(url).includes("/api/servers/s1/status") ? { ok: true, value: { running: true, state: "running", checkedAt: new Date().toISOString() } }
      : String(url) === "/api/servers" ? { ok: true, value: [{ id: "s1", name: "Survival" }] }
      : String(url) === "/api/accounts" ? { ok: true, accounts: [{ id: "a", name: "Bob", role: "owner", password: true, totp: false, passkeys: 1 }, { id: "b", name: "Ann", role: "viewer", password: true, totp: false, passkeys: 0 }] }
      : String(url) === "/api/auth/status" ? { account: { name: "Bob", role: "owner" } }
      : { ok: true };
    return { status: 200, json: async () => body } as any;
  }) as any;
  new Function(MANAGE_SCRIPT)();
  await new Promise((r) => setTimeout(r, 20));
  expect(doc().getElementById("state")!.textContent).toBe("Running");
  expect(doc().getElementById("accounts")!.children.length).toBe(2);
  (doc().querySelector('[aria-label="Remove Ann"]') as any).click();
  const slide = doc().getElementById("slide") as any;
  expect(slide.disabled).toBe(true);
  (doc().getElementById("key1") as any).click();
  expect(slide.disabled).toBe(true);
  (doc().getElementById("key2") as any).click();
  expect(slide.disabled).toBe(false);
  slide.value = "60"; slide.dispatchEvent(new (globalThis as any).Event("change"));
  expect(calls.some((c) => c.includes("/api/accounts/remove"))).toBe(false);
  slide.value = "100"; slide.dispatchEvent(new (globalThis as any).Event("change"));
  await new Promise((r) => setTimeout(r, 20));
  expect(calls).toContain("POST /api/accounts/remove");
});
