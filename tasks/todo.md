# tool-spec-form 改版任務清單

## P0：RWD 響應式設計
- [ ] 三斷點 CSS (375px / 768px / 1024px+)
- [ ] 手機單欄排版、按鈕 100% 寬、44px 最小點擊區
- [ ] 平板 2 欄卡片
- [ ] 桌機 800px 最大寬度置中
- [ ] iOS Safari 相容 (font-size 16px, no hover-only)
- [ ] Modal bottom-sheet 手機版

## P1：Firebase 專案管理系統升級
- [ ] Collection 改為 `projects`，document 結構升級 (phase0~phase5 + currentPhase)
- [ ] 桌機左側固定側欄 (200px)
- [ ] 手機漢堡選單 + bottom sheet
- [ ] 新增專案流程 (Modal)
- [ ] 刪除專案 (二次確認)
- [ ] 即時儲存 debounce 800ms + 狀態指示
- [ ] 離線/連線狀態顯示
- [ ] 切換專案前強制儲存

## P2：Phase 編號統一 + 進度條
- [ ] 7 個 Phase (0~6) 重新命名
- [ ] 桌機/平板：7 步驟圓點 + 文字標籤
- [ ] 手機：Step N/7 + 細進度條
- [ ] 已完成步驟可跳轉

## P3：設定頁
- [ ] GitHub PAT + 帳號設定
- [ ] AI 模型四家 API (Gemini/OpenRouter/Groq/Anthropic)
- [ ] callAI() 統一函式
- [ ] Skills Repo 設定 + 自動建立
- [ ] .skill 批次匯入 (JSZip 解壓)
- [ ] 所有設定存 localStorage

## P4：Skill 管理
- [ ] Phase 3 Skill 選擇頁面
- [ ] 從 claude-skills repo 讀取 .md
- [ ] 多選 Skill 卡片 UI
- [ ] 手動新增 Skill
- [ ] 空狀態處理

## P5：AI 輔助填表
- [ ] 層級 1：AI 幫我填這頁按鈕
- [ ] 層級 2：即時建議卡片
- [ ] 層級 3：一鍵 AI 整理規格 (SPEC.md)

## P6：一條龍推送升級
- [ ] Step 1~5 逐步進度 UI
- [ ] 自動建 repo + 目錄結構
- [ ] 推送 SPEC.md + CLAUDE.md + Skills
- [ ] 推送完成頁面 + 複製連結

## P7：前端框架選項新增
- [ ] 新增 React + AI 推薦選項

## P8：欄位說明文字優化
- [ ] Phase 0 欄位說明文字 + placeholder 更新
- [ ] Phase 1 功能清單新增優先級 + 工時 + 排序
- [ ] Phase 4 測試計畫欄位
- [ ] Phase 5 部署計畫欄位
