import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { api, startTestServer } from "./helpers/server.js";

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

test("家庭成员 can use the redesigned mobile cooking flow", { skip: process.env.RUN_PLAYWRIGHT_UI !== "1" }, async () => {
  const server = await startTestServer();
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(server.baseUrl);

    // Access Gate
    await page.getByLabel("家庭访问码").fill(server.accessCode);
    await page.getByRole("button", { name: "进入" }).click();
    await page.locator(".hero-card").waitFor();

    // Today layout & Random Pick
    await page.getByRole("button", { name: "帮我挑一道" }).click();
    const pickDialog = page.getByRole("dialog");
    await pickDialog.getByText("今天不如就做这道").waitFor();
    await pickDialog.getByRole("button", { name: "关闭推荐" }).click();

    // Quick composer on Today at 320px narrow screen
    await page.setViewportSize({ width: 320, height: 700 });
    await page.getByLabel("家里新添了什么").fill("冬瓜、豆腐、豆瓣酱、花生、黄瓜、干辣椒");
    await page.getByRole("button", { name: "解析并添加" }).click();
    await page.getByText("宫保鸡丁").waitFor();
    await page.getByText("麻婆豆腐").waitFor();

    // Ingredients tab: search alias, sticky category rail, manual add/edit/delete
    await page.getByRole("button", { name: "食材", exact: true }).click();
    await page.getByRole("button", { name: "切换食材搜索" }).click();
    await page.getByLabel("搜索食材").fill("西红柿");
    await page.getByRole("button", { name: "编辑番茄" }).waitFor();
    await page.getByLabel("搜索食材").fill("青葱");
    await page.getByRole("button", { name: "编辑葱花" }).waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".ingredient-tools-sticky")).position), "sticky");
    await page.getByLabel("搜索食材").fill("");

    // Typing on Ingredients tab should not auto-parse or unmount the textarea mid-input
    const ingredientTextarea = page.getByLabel("自然语言录入食材");
    await ingredientTextarea.click();
    await ingredientTextarea.pressSequentially("j");
    assert.equal(await ingredientTextarea.isVisible(), true);
    assert.equal(await ingredientTextarea.inputValue(), "j");
    assert.equal(await page.getByText("识别到 1 种，确认后加入").count(), 0);

    // Explicit parse preview on Ingredients tab
    await ingredientTextarea.fill("胡萝卜、牛肉");
    await page.getByRole("button", { name: "识别食材" }).click();
    await page.getByText("识别到 2 种，确认后加入").waitFor();
    await page.getByRole("button", { name: "修改" }).click();
    assert.equal(await page.getByLabel("自然语言录入食材").inputValue(), "胡萝卜、牛肉");
    await page.getByRole("button", { name: "清空" }).click();

    // Add, edit, delete single ingredient
    await page.getByRole("button", { name: "添加食材" }).click();
    const addIngredient = page.getByRole("dialog", { name: "添加食材" });
    await addIngredient.getByLabel("食材名称").fill("茭白");
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

    // Recipe Library: search + chip filters + 2-col cards
    await page.getByRole("button", { name: "菜谱", exact: true }).click();
    await page.getByLabel("搜索菜谱或食材").fill("西红柿");
    await page.getByRole("button", { name: "煮", exact: true }).click();
    await page.getByRole("button", { name: "⏱ 15 分钟内" }).click();
    const filteredTitles = await page.locator("article.recipe-grid-card h3").allTextContents();
    assert.equal(filteredTitles.includes("番茄鸡蛋汤"), true);
    assert.equal(filteredTitles.every((title) => title.includes("番茄") || title.includes("西红柿")), true);
    await page.getByRole("button", { name: "清除筛选" }).click();

    // Detail Sheet + Dark Step-by-Step Cooking Mode + Persistence
    const beforeCooking = await api(server, "/api/app");
    await page.locator("article.recipe-grid-card").filter({ hasText: "番茄炒蛋" }).click();
    await page.getByRole("button", { name: "开始做菜" }).click();
    await page.getByText("第 1 步 / 共").waitFor();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByText("第 2 步 / 共").waitFor();

    // Open overview drawer & check off first ingredient
    await page.getByRole("button", { name: "食材与步骤总览" }).click();
    const firstCheck = page.locator(".cook-checklist input").first();
    await firstCheck.check();
    await page.getByRole("button", { name: "关闭总览" }).click();
    await page.getByRole("button", { name: "退出烹饪模式" }).click();

    // Reopen and verify step & checklist persisted
    await page.locator("article.recipe-grid-card").filter({ hasText: "番茄炒蛋" }).click();
    await page.getByRole("button", { name: "开始做菜" }).click();
    await page.getByText("第 2 步 / 共").waitFor();
    await page.getByRole("button", { name: "食材与步骤总览" }).click();
    assert.equal(await page.locator(".cook-checklist input").first().isChecked(), true);
    await page.getByRole("button", { name: "关闭总览" }).click();
    await page.getByRole("button", { name: "退出烹饪模式" }).click();

    const afterCooking = await api(server, "/api/app");
    assert.deepEqual(afterCooking.payload.ingredients, beforeCooking.payload.ingredients);

    // Center "+" Create Sheet & Draft confirmation flow
    const draft = await api(server, "/api/drafts/analyze", {
      method: "POST",
      body: {
        sourceType: "text",
        content: "测试保存菜谱。番茄1个，鸡蛋1个。番茄切块，鸡蛋打散，热锅翻炒。",
      },
    });
    assert.equal(draft.response.status, 200);

    await page.reload();
    await page.getByRole("button", { name: "添加菜谱" }).click();
    await page.getByText("测试保存菜谱").waitFor();
    await page.getByRole("button", { name: "去确认" }).first().click();

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
    await detail.getByText("2个").waitFor();
    await detail.getByRole("button", { name: "编辑菜谱" }).click();

    const formalEditor = page.getByRole("dialog", { name: "编辑菜谱" });
    await formalEditor.getByLabel("菜谱标题").fill("测试正式菜谱");
    await formalEditor.getByRole("button", { name: "保存修改" }).click();

    const updatedDetail = page.getByRole("dialog", { name: "测试正式菜谱" });
    await updatedDetail.getByRole("button", { name: "删除菜谱" }).click();
    await updatedDetail.getByRole("button", { name: "取消" }).click();
    await updatedDetail.getByRole("button", { name: "删除菜谱" }).click();
    await updatedDetail.getByRole("button", { name: "确认删除" }).click();
    await updatedDetail.waitFor({ state: "detached" });
    assert.equal(await page.getByText("测试正式菜谱").count(), 0);

    // Family tab
    await page.getByRole("button", { name: "家庭", exact: true }).click();
    await page.getByText("常备调味品").waitFor();

    // Check zero horizontal overflow across tabs at 320px
    for (const tabName of ["今天", "食材", "菜谱", "家庭"]) {
      await page.getByRole("button", { name: tabName, exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${tabName} overflowed`);
    }

    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser?.close();
    await server.stop();
  }
});

test("家庭成员 can select ingredients for AI recipe generation via Create sheet", { skip: process.env.RUN_PLAYWRIGHT_UI !== "1" }, async () => {
  const llm = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "自选番茄炒蛋",
              method: "炒",
              minutes: 15,
              preferenceWarning: "",
              requiredIngredients: [
                { name: "番茄", quantityLabel: "2个" },
                { name: "鸡蛋", quantityLabel: "2个" },
              ],
              optionalIngredients: [{ name: "生抽", quantityLabel: "1勺" }],
              steps: ["番茄切块，鸡蛋打散。", "鸡蛋炒熟后加入番茄翻炒2分钟。"],
            }),
          },
        }],
      }));
    });
  });
  llm.listen(0, "127.0.0.1");
  await once(llm, "listening");
  const server = await startTestServer({
    env: {
      DASHSCOPE_API_KEY: "test-key",
      DASHSCOPE_BASE_URL: `http://127.0.0.1:${llm.address().port}`,
    },
  });
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(server.baseUrl);
    await page.getByLabel("家庭访问码").fill(server.accessCode);
    await page.getByRole("button", { name: "进入" }).click();

    await page.getByRole("button", { name: "添加菜谱" }).click();
    await page.getByRole("button", { name: "选食材并生成" }).click();
    const selector = page.getByRole("dialog", { name: "选择想用的食材" });
    await selector.getByRole("button", { name: "选择番茄" }).click();
    await selector.getByRole("button", { name: "选择鸡蛋" }).click();
    assert.equal(await selector.getByRole("button", { name: "选择番茄" }).getAttribute("aria-pressed"), "true");
    await selector.getByRole("button", { name: "用已选 2 种食材生成" }).click();

    const editor = page.getByRole("dialog", { name: "检查菜谱草稿" });
    await editor.waitFor();
    assert.equal(await editor.getByLabel("菜谱标题").inputValue(), "自选番茄炒蛋");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  } finally {
    await browser?.close();
    await server.stop();
    llm.close();
    await once(llm, "close");
  }
});
