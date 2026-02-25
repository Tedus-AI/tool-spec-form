# 工具開發規格填寫表單

軟體工具開發規格的標準化填寫表單，整合 Firebase 即時儲存功能。

## 功能特色

- **多步驟表單** — Phase 0~4 完整的工具開發規格流程（需求定義、規格設計、技術架構、功能拆解、預覽推送）
- **Firebase 即時儲存** — 每次修改自動同步到 Firestore，不怕資料遺失
- **下拉選單切換表單** — 頂部下拉可選擇已建立的表單，以工具名稱顯示
- **支援多次編輯** — 隨時回來繼續填寫，自動記錄上次停留的步驟
- **GitHub 推送** — 完成後可直接將規格書（SPEC.md）推送到指定的 GitHub repo
- **設定記憶** — Firebase 和 GitHub 設定可儲存在瀏覽器 localStorage

## 使用方式

1. 開啟 `index.html`
2. 展開 Firebase 設定面板，填入你的 Firebase 專案資訊
3. 點「連接 Firebase」
4. 點「+ 新增表單」建立新的規格表，或從下拉選單選擇已有的表單
5. 隨時填寫，所有修改自動儲存
6. 最後一步可預覽並推送 SPEC.md 到 GitHub

## Firebase 設定

需要一個 Firebase 專案，啟用 Cloud Firestore。表單資料儲存在 `tool-specs` collection 中。

## 技術

- 純 HTML + CSS + JavaScript（無框架依賴）
- Firebase Firestore（即時資料庫）
- GitHub REST API（推送規格文件）
