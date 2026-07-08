import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { api, startTestServer } from "./helpers/server.js";

test("mobile user can use the core cooking flow", { skip: process.env.RUN_PLAYWRIGHT_UI !== "1" }, async () => {
  const server = await startTestServer();
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 703 } });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(server.baseUrl);

    await page.getByLabel("家庭访问码").fill(server.accessCode);
    await page.getByRole("button", { name: "进入" }).click();
    await page.getByText("更新可用食材清单").waitFor();

    await page.locator(".ingredient-panel textarea").fill("豆腐、豆瓣酱、花生、黄瓜、干辣椒");
    await page.getByRole("button", { name: "解析并添加" }).click();
    await page.getByText("宫保鸡丁").waitFor();
    await page.getByText("麻婆豆腐").waitFor();

    await page.getByText("待补食材").click();
    await page.getByText("缺：").waitFor();

    await page.getByText("可做菜谱").click();
    await page.locator("article.recipe-row").filter({ hasText: "宫保鸡丁" }).click();
    await page.getByRole("dialog", { name: "宫保鸡丁" }).getByText("必需食材").waitFor();
    await page.getByRole("dialog", { name: "宫保鸡丁" }).getByText("烹饪步骤").waitFor();
    await page.getByRole("button", { name: "关闭菜谱详情" }).click();

    const draft = await api(server, "/api/drafts/analyze", {
      method: "POST",
      body: {
        sourceType: "text",
        content: "测试保存菜谱。番茄1个，鸡蛋1个。番茄切块，鸡蛋打散，热锅翻炒。",
      },
    });
    assert.equal(draft.response.status, 200);

    await page.reload();
    await page.getByRole("button", { name: "草稿" }).click();
    await page.getByText("测试保存菜谱").waitFor();
    await page.getByRole("button", { name: "确认并保存到菜谱库" }).click();

    const detail = page.getByRole("dialog", { name: "测试保存菜谱" });
    await detail.getByText("测试保存菜谱").waitFor();
    await detail.getByText("烹饪步骤").waitFor();
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser?.close();
    await server.stop();
  }
});
