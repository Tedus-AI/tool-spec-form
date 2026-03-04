# Project Notes

## Gemini API 踩坑紀錄（2026-03）

### 模型退役問題
- `gemini-1.5-flash` 和所有 1.x 模型已**完全退役**，API 回傳 404
- `gemini-2.0-flash` 預計 2026-06-01 退役
- 目前可用：`gemini-2.5-flash`（首選）、`gemini-2.0-flash`（備用）

### API 呼叫方式
- 端點格式：`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
- 不需要 Firebase，直接用 REST API + API Key 即可
- API Key 從 https://aistudio.google.com/apikey 取得

### 錯誤處理
- **404**：模型已退役或名稱錯誤 → fallback 到下一個模型
- **429**：速率限制 → 稍後重試
- **403**：API Key 無權限 → 需重新產生或啟用 Generative Language API

### 教訓
1. Google 會定期退役舊模型，務必用 fallback 機制
2. 不要硬編碼單一模型，保持模型清單可更新
3. 可用 `curl "https://generativelanguage.googleapis.com/v1beta/models?key=KEY"` 查詢當前可用模型
