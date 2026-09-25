# 學習資料 Schema 使用說明

`learning-data.schema.json` 是 draft 2020-12 JSON Schema，不是只有示意 TypeScript 型別。頂層區分 content_pack（教材）與 record_export（學習紀錄）。`record-export.example.json` 是合法的空白紀錄範例，日期僅示範，並非替使用者設定考試日期。

`concept-catalog.json` 是分析目錄：150考點皆為 analysis_only，不能直接冒充有短課、解析及已核實答案的教材包。`lecture-inventory.json`保存原始講義觀察值；`plan-v1.json`各日符合DayPlan型別。

## 核心實體關係

Source → Evidence → Chapter / Concept / Question / NumberCard。

Concept可跨章但以canonicalConceptId共用熟練度；Prerequisite建立有向無環圖。Question以familyId識別同題變式，conceptIds供分析，primaryConceptId負責主要學習歸因，避免同題映射多個點就把每點都算掌握。

DayPlan只存計畫；TaskQueue存當天實際產生的快照。Attempt是不可覆寫的事實紀錄；Progress、Mistake、ReadinessSnapshot是可重算狀態。ExamSession保存題目與規格快照，讓教材更新不改掉過去試卷。

## 應用層的語義驗證（JSON Schema之外）

- ID於各集合內唯一，全部外鍵可解析；跨包匯入的未知ID另存孤立區並顯示，不能丟失。
- 題目的primaryConceptId必在conceptIds中；correctOptionId存在於options；optionId不重複；每錯項有對應解析。
- 單選／情境／計算／組合敘述單選皆四選一；回想題沒有選項、以acceptedAnswers比對，支援全半形與空白正規化但不可忽略單位及條件。
- 外部題必有外部來源URL及教材考點映射；講義原題必有章節、題號、頁碼及答案證據；自製題必有講義概念依據。
- 法規及數字題必有RuleScope；正式計分題須verified且examScopeStatus=confirmed，不含未解爭議。歷史題須明示歷史情境。
- 只有public_allowed或original內容進公開教材；private_only原題與原始PDF不進Pages建置。
- 12章星级必须对应原目錄；计划day必须恰为1–15且不重复；Day14 fullExamCount≥2；Day15 newLearningAllowed=false且只回顾／考试。
- prerequisite無自我與循環引用，通常firstDay不早於前置；同日依拓撲排序。
- 每日learn+answer+review=預算，模考日核實規格後可擴增總時數，但不可縮減正式試卷時間。
- Chapter配額合計等於ExamSection題數；配額必須有足夠已審核題目家族；不以重複選題填滿。
- 考試分數門檻介於0與滿分，各科總分由題目配分計；all_sections與total_score各自運算。
- 身分、出生／投保日期、時間期限以明確曆法規則驗算，不使用365天替代一年或30天替代一個月。
- NumberCard的ratio等值与percent有明確轉換；day與business_day不可互換。
- 準備度／錯題統計由原始紀錄重新計算，不信任匯入檔提供的高分。
- `independentMeasurement`由程式重算，不單靠匯入布林值；同日同家族只採第一次無提示作答，已揭示答案則不得補成獨立測量。
- 多考點題的整題正誤只自動更新primaryConceptId；其餘映射作薄弱線索，再以單考點題確認，避免錯一題就推定全不懂。
- ExamSession時間以UTC截止時間計，當地日期用於間隔複習。submitted／expired考卷必有提交時間與每科結算。

## 版本及遷移

schemaVersion改變資料格式，contentVersion改變教材。未知主版本匯入不覆寫現有資料；提供原檔保留及清楚錯誤。新增欄位由遷移函式補預設，舊題以ID＋version保留。合併重複attemptId必須內容一致，若不同則列衝突，不能偷偷採最新。

相同本機資料在不同裝置分別作答後，匯入合併只合併紀錄並重算；計畫設定由使用者在預覽頁選擇保留哪一版。這不是自動雲端同步。
