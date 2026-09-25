# 15 天人身保險考試通關系統

手機、桌面皆可使用的離線學習網站。以每日至少 180 分鐘、零基礎、15 天備考為目標；重要度源於使用者的《保險講義》115 年 7 月版，並非保證通過。

## 開始使用

安裝 Node.js 22.12 以上（建議 22 LTS），在本資料夾執行：

```sh
npm ci
npm run dev
```

開啟畫面顯示的網址。設定計畫開始日、考試日期，按「開始今天的任務」。Day 1 先理解，Day 12 A 卷，Day 13 弱點補強，Day 14 B、C 兩卷，Day 15 D 卷與最後複習。

## 自行部署到 GitHub Pages

1. 在 GitHub 建立自己的儲存庫，例如 `insurance-study`。把**本資料夾內**所有專案檔案放到儲存庫根目錄，包含隱藏的 `.github` 資料夾；不要上傳 `node_modules`。
2. 確認預設分支叫 `main`。若用其他名稱，修改 `.github/workflows/pages.yml` 的分支設定。
3. 儲存庫 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
4. 推送程式後，等待 **Actions → Deploy study site to GitHub Pages** 完成。部署網址顯示在 Pages 設定。
5. 連網開啟一次，等候「離線教材已準備好」，再安裝到主畫面。

部署流程自動辨識 `/儲存庫名稱/` 子路徑，也支援 `帳號.github.io` 根網域。使用自訂網域時，請依實際路徑將 workflow 的 `BASE_PATH` 改為 `/`。

本專案未替你建立 GitHub 儲存庫、推送或公開發布。原講義 PDF 與章末原題全文**不在公開程式包中**。

## 已包含

- 12 章、150 個知識點（109 MUST／35 SHOULD／6 OPTIONAL），白話短課、情境、回想問題、頁碼與重要度依據。
- 300 題原創改寫，其中 280 題啟用、20 題因 10 個待核考點隔離。兩種檢核／知識點；不是官方歷屆題。
- 今日任務：核心先修、漏學補排、錯題、到期複習、數字期限、限時卷及檢討。
- 跨日掌握、錯因記錄、弱點排序、準備度、練習及模考歷史。
- IndexedDB 本機保存、JSON 匯入匯出、跨分頁同步、PWA 更新與離線。

## 目前範圍與限制

正式考試名稱、科目、題數、時間及及格標準尚未確認。預設為**40 題／60 分鐘講義綜合練習卷**，實務與法規各半，可自行調整；沒有假設官方通過門檻。模考成績與新題型比例另列，準備度的正式模考 25 分暫不採計，所以目前準備度上限 75。若另需金融市場常識與職業道德，此教材未涵蓋。

20 題待核內容不進入練習、模考或掌握證據；其核心仍留在分母，避免缺資料卻顯示全部完成。稅務、長照、個資、申報與投資限額須核對適用年度及法源後才可開放。其他內容是依講義改寫，並非全部現行法規逐條查核。

題量有限，模考可能重複題型，系統標示新題型比例。每日計畫以 180 分鐘為建議配置；短課閱讀時間以外，保留回想、筆記與檢討時間。初期證據不足時不顯示「保證及格」。

## 驗證與正式預覽

```sh
npm run check:content
npm test
npm run build
npm run preview
```

離線功能只在正式建置或 GitHub Pages 上啟用，開發預覽不啟用快取。自動瀏覽器測試：

```sh
npx playwright install chromium
npm run test:e2e
```

## 專案結構

- `public/data/content.json`：網站使用的 JSON 教材。
- `content/lessons.tsv`：短課與改寫題的編輯來源（管線分隔），每列兩題。
- `scripts/build-content.py`：從原規格與短課產生教材；執行 `npm run content:build` 後再檢查內容。
- `src/domain.ts`：學習證據、排程、弱點、模考與準備度。
- `src/importer.ts`：紀錄驗證與合併；`src/storage.ts`：本機儲存。
- `docs/spec/`：114 頁分析、完整章節重要度、15 天計畫、原始設計 Schema。
- `docs/record-export.schema.json`：**實作採用**的紀錄 JSON Schema；原設計 Schema 是設計參考，兩者不可混用。
- `docs/implementation.md`：實作規則與維護說明。

不要把私人學習紀錄或原講義上傳到公開儲存庫。學習紀錄只保存在使用的瀏覽器，可在設定頁匯出移轉。沒有伺服器、登入或自動跨裝置同步。
