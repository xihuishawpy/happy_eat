import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { api, startTestServer } from "./helpers/server.js";

test("家庭成员 can use the core mobile cooking flow", { skip: process.env.RUN_PLAYWRIGHT_UI !== "1" }, async () => {
  const server = await startTestServer();
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(server.baseUrl);

    await page.getByLabel("家庭访问码").fill(server.accessCode);
    await page.getByRole("button", { name: "进入" }).click();
    await page.getByText("家里食材有变化？").waitFor();

    const todayLayout = await page.evaluate(() => ({
      decisionTop: document.querySelector(".matches-panel").getBoundingClientRect().top,
      ingredientEntryTop: document.querySelector(".today-ingredient-entry").getBoundingClientRect().top,
    }));
    assert.equal(todayLayout.decisionTop < todayLayout.ingredientEntryTop, true);
    await page.setViewportSize({ width: 320, height: 700 });

    await page.getByRole("button", { name: "更新食材" }).click();
    await page.locator(".today-ingredient-form textarea").fill("冬瓜、豆腐、豆瓣酱、花生、黄瓜、干辣椒");
    await page.getByRole("button", { name: "解析并添加" }).click();
    await page.getByText("宫保鸡丁").waitFor();
    await page.getByText("麻婆豆腐").waitFor();

    await page.getByRole("button", { name: "食材", exact: true }).click();
    await page.getByLabel("搜索食材").fill("西红柿");
    await page.getByRole("button", { name: "编辑番茄" }).waitFor();
    await page.getByLabel("搜索食材").fill("青葱");
    await page.getByRole("button", { name: "编辑葱花" }).waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".ingredient-tools")).position), "sticky");
    await page.getByLabel("搜索食材").fill("");

    await page.getByRole("button", { name: "添加食材" }).click();
    const addIngredient = page.getByRole("dialog", { name: "添加食材" });
    await addIngredient.getByLabel("食材名称").fill("茭白");
    assert.equal(await addIngredient.getByLabel("参考用量").count(), 0);
    await addIngredient.getByRole("radio", { name: "蔬菜" }).check();
    await addIngredient.getByRole("radio", { name: "优先用掉" }).check();
    await addIngredient.getByRole("button", { name: "保存食材" }).click();

    await page.getByRole("button", { name: "编辑茭白" }).click();
    const editIngredient = page.getByRole("dialog", { name: "编辑食材" });
    await editIngredient.getByRole("button", { name: "保存修改" }).click();
    await page.getByRole("button", { name: "编辑茭白" }).waitFor();

    await page.getByRole("button", { name: "编辑茭白" }).click();
    await page.getByRole("dialog", { name: "编辑食材" }).getByRole("button", { name: "删除食材" }).click();
    await page.getByRole("button", { name: "取消" }).click();
    await page.getByRole("button", { name: "删除食材" }).click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await page.getByRole("button", { name: "编辑茭白" }).waitFor({ state: "detached" });

    await page.getByRole("button", { name: "菜谱", exact: true }).click();
    await page.getByLabel("搜索菜谱或食材").fill("西红柿");
    await page.getByLabel("烹饪方式").selectOption("煮");
    await page.getByLabel("烹饪时间").selectOption("15");
    const filteredRecipeTitles = await page.locator("article.recipe-row h3").allTextContents();
    assert.equal(filteredRecipeTitles.includes("番茄鸡蛋汤"), true);
    assert.equal(filteredRecipeTitles.every((title) => title.includes("番茄") || title.includes("西红柿")), true);
    assert.equal(await page.locator(".match-tabs button.active").innerText(), `可做菜谱（${filteredRecipeTitles.length}）`);

    const unfiltered = await api(server, "/api/app");
    await page.getByRole("button", { name: "今天做什么", exact: true }).click();
    assert.equal(await page.locator(".match-tabs button.active").innerText(), `可做菜谱（${unfiltered.payload.matches.ready.length}）`);
    await page.getByRole("button", { name: "菜谱", exact: true }).click();
    await page.getByRole("button", { name: "清除" }).click();

    const beforeCooking = await api(server, "/api/app");
    await page.locator("article.recipe-row").filter({ hasText: "番茄炒蛋" }).click();
    await page.getByRole("button", { name: "开始烹饪" }).click();
    const cookingIngredient = page.locator(".cooking-checklist input").first();
    const cookingStep = page.locator(".cooking-steps input").first();
    await cookingIngredient.check();
    await cookingStep.check();
    await page.getByRole("button", { name: "返回菜谱详情" }).click();

    await page.locator("article.recipe-row").filter({ hasText: "番茄炒蛋" }).click();
    await page.getByRole("button", { name: "开始烹饪" }).click();
    assert.equal(await page.locator(".cooking-checklist input").first().isChecked(), true);
    assert.equal(await page.locator(".cooking-steps input").first().isChecked(), true);
    await page.getByRole("button", { name: "返回菜谱详情" }).click();

    const afterCooking = await api(server, "/api/app");
    assert.deepEqual(afterCooking.payload.ingredients, beforeCooking.payload.ingredients);
    assert.deepEqual(afterCooking.payload.matches, beforeCooking.payload.matches);

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
    assert.equal(await page.locator(".draft-input").inputValue(), "");
    assert.equal(await page.getByRole("button", { name: "解析为草稿" }).isDisabled(), true);
    assert.equal(await page.getByRole("tab", { name: "文本" }).getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "检查草稿" }).click();

    const draftEditor = page.getByRole("dialog", { name: "检查菜谱草稿" });
    await draftEditor.getByLabel("菜谱标题").fill("测试编辑菜谱");
    await draftEditor.getByLabel("烹饪方式").selectOption("炒");
    assert.equal(await draftEditor.getByLabel("烹饪时间（分钟）").getAttribute("max"), "240");
    await draftEditor.getByLabel("烹饪时间（分钟）").fill("12");
    await draftEditor.getByLabel("食材用量 1").fill("2个");
    await draftEditor.getByLabel("烹饪步骤 1").fill("番茄切块并翻炒。");
    await draftEditor.getByRole("button", { name: "添加食材项" }).click();
    await draftEditor.getByRole("button", { name: "确认并保存" }).click();
    assert.equal(await draftEditor.isVisible(), true);
    await draftEditor.getByRole("button", { name: "删除食材 3" }).click();
    await draftEditor.getByRole("button", { name: "确认并保存" }).click();

    const detail = page.getByRole("dialog", { name: "测试编辑菜谱" });
    await detail.getByText("测试编辑菜谱").waitFor();
    await detail.getByText("番茄 × 2个").waitFor();
    await detail.getByText("烹饪步骤").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.getByRole("button", { name: "关闭菜谱详情" }).click();
    await page.getByRole("button", { name: "偏好", exact: true }).click();
    await page.getByRole("heading", { name: "偏好设置" }).waitFor();
    await page.getByRole("button", { name: "食材", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser?.close();
    await server.stop();
  }
});
