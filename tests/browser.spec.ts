import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
const content = JSON.parse(
  readFileSync(new URL("../public/data/content.json", import.meta.url), "utf8"),
);
async function readState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("insurance-15day-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<any>((resolve, reject) => {
      const r = db.transaction("state").objectStore("state").get("main");
      r.onsuccess = () => {
        resolve(r.result);
        db.close();
      };
      r.onerror = () => reject(r.error);
    });
  });
}
async function firstTask(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "開始今天的任務" }).click();
  await page.getByRole("button", { name: "理解了，進入下一步" }).click();
  await expect(page.getByRole("button", { name: "確認答案" })).toBeVisible();
}
async function configureExam(page: Page) {
  await page.goto("/#/settings");
  await page.getByLabel("每回題數").fill("10");
  await page.getByLabel("限時分鐘").fill("10");
  await page.getByRole("button", { name: "保存設定" }).click();
  await expect(page.getByRole("status")).toContainText("設定已保存");
  await page.goto("/#/exams");
  await page.getByRole("button", { name: "開始自由模考" }).click();
  await expect(
    page.getByRole("heading", { name: "第 1 / 10 題" }),
  ).toBeVisible();
}
test("today tasks, wrong cause and reload persist without double counting", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await firstTask(page);
  const stem = await page.locator(".question-card h2").innerText();
  const q = content.questions.find((q) => q.stem === stem)!;
  const wrong = q.options.find((o) => o.id !== q.correctOptionId)!;
  await page.getByRole("button", { name: new RegExp(wrong.text) }).click();
  await page.getByRole("button", { name: "確認答案" }).click();
  await page.getByLabel("概念不懂", { exact: true }).check();
  await expect(page.getByLabel("概念不懂", { exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("概念不懂", { exact: true })).toBeChecked();
  expect((await readState(page)).attempts).toHaveLength(1);
  await page.getByRole("button", { name: "下一項任務" }).click();
  await page.goto("/#/mistakes");
  await expect(
    page.getByText("最近錯因：概念不懂", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("practice finishes with saved result and supports numeric filtering", async ({
  page,
}) => {
  await page.goto("/#/numbers");
  await page.getByLabel("出題範圍").selectOption("all");
  await page.getByRole("button", { name: "開始10題練習" }).click();
  for (let i = 0; i < 10; i++) {
    await page.locator(".option").first().click();
    await page.getByRole("button", { name: "確認答案" }).click();
    await page
      .getByRole("button", {
        name: i === 9 ? "查看成果" : "下一題",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "又多掌握了一點。" }),
  ).toBeVisible();
  const s = await readState(page);
  expect(s.attempts).toHaveLength(10);
  expect(
    s.attempts.every(
      (a: any) => content.questions.find((q) => q.id === a.questionId)?.numeric,
    ),
  ).toBe(true);
});
test("exam reload retains timer and answers, submit is final", async ({
  page,
}) => {
  await configureExam(page);
  await page.locator(".option").first().click();
  const before = await readState(page);
  await page.reload();
  await expect(page.locator(".option.selected")).toHaveCount(1);
  expect((await readState(page)).exams[0].deadlineAt).toBe(
    before.exams[0].deadlineAt,
  );
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("button", { name: "確認交卷", exact: true }).click();
  await expect(page.getByRole("heading", { name: /這回練習/ })).toBeVisible();
  await page.reload();
  const s = await readState(page);
  expect(s.attempts).toHaveLength(10);
  expect(s.exams[0].submittedAt).toBeTruthy();
  expect(
    s.attempts.filter((a: any) => a.selectedOptionId === null),
  ).toHaveLength(9);
});
test("elapsed exam automatically submits after clock reaches deadline", async ({
  page,
}) => {
  await page.clock.install();
  await configureExam(page);
  await page.clock.fastForward(601000);
  await expect(
    page.getByRole("heading", { name: "這回練習 0 分" }),
  ).toBeVisible();
  expect((await readState(page)).attempts).toHaveLength(10);
});
test("export is reusable; bad import leaves progress untouched", async ({
  page,
}) => {
  await firstTask(page);
  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出學習紀錄", exact: true }).click();
  const dl = await downloadPromise;
  const record = await fs.readFile((await dl.path())!);
  const before = await readState(page);
  await page
    .getByLabel("匯入紀錄檔")
    .setInputFiles({
      name: "record.json",
      mimeType: "application/json",
      buffer: record,
    });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "確認匯入", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("紀錄已匯入");
  expect((await readState(page)).learnEvents).toEqual(before.learnEvents);
  await page
    .getByLabel("匯入紀錄檔")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
  await expect(page.getByRole("status")).toContainText("不是有效的JSON");
  expect((await readState(page)).learnEvents).toEqual(before.learnEvents);
});
test("separate tabs receive saved progress", async ({ page, context }) => {
  await page.goto("/");
  const second = await context.newPage();
  await second.goto("/");
  await page.getByRole("button", { name: "開始今天的任務" }).click();
  await expect(
    second.getByRole("button", { name: "繼續今天的任務" }),
  ).toBeVisible();
  await second.close();
});
test("mobile navigation and core pages fit 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/#/plan",
    "/#/library",
    "/#/numbers",
    "/#/settings",
    "/#/exams",
  ]) {
    await page.goto(route);
    await page.locator("h1").waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page.screenshot({
    path: "../output/mobile-preview.png",
    fullPage: true,
  });
  await page.locator(".bottom-nav").getByText("練習", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "把考點拆小，把核心學會" }),
  ).toBeVisible();
});
test("production PWA reloads offline and can save work", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天，離通關更近一步。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "開始今天的任務" }).click();
  await page.getByRole("button", { name: "理解了，進入下一步" }).click();
  await expect(page.getByRole("button", { name: "確認答案" })).toBeVisible();
  expect((await readState(page)).learnEvents).toHaveLength(1);
  await context.setOffline(false);
});
