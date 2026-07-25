# Pre Online Tracker

上線前 SIT / UAT / Online 測試情境追蹤與 Issue 管理小系統。

## 功能特點

- **驗證機制**：進入系統前輸入簡易密碼，預設 `2026`。
- **頂部導覽頁籤**：`Issue 追蹤` ➔ `測試清單` ➔ `問題提報` ➔ `統計資訊`。

### 1. Issue 追蹤與管理
- **自動流水編號**：自動配發唯一 Issue Key（如 `ISSUE-1`, `ISSUE-2`）。
- **多元型態**：支援 `Feature (需求)`、`Bug (缺陷)`、`Task (任務)`（預設新增為 `Feature`）。
- **豐富欄位**：包含 Key、標題、長內文說明、狀態、優先級、指派人與 **預計完成日 (due_date)**。
- **重要優先排序**：頁面預設採用 **「優先級高 ➔ 低」**（`Blocker` ➔ `High` ➔ `Medium` ➔ `Low`）排序；支援點擊表頭一鍵切換「預計完成日」與「優先級」升降序。
- **已關閉歸檔抽屜**：狀態改為 `Closed` 的 Issue 自動自主要列表隱藏並歸檔至 **「已關閉 (N)」** 抽屜，可隨時檢視、編輯或重開。
- **Excel (XLSX / CSV) 匯出與匯入**：
  - **一鍵匯出**：點擊「匯出 Excel」導出目前過濾/排序後的所有 Issue。
  - **批次匯入**：支援選擇 `.xlsx` 或 `.csv` 檔案進行批次匯入與自動發號。
- **資料管理**：設定抽屜 (Settings Drawer) 提供「Issue 資料管理」清空功能（含輸入 `DELETE` 二次確認防護）。

### 2. 測試情境清單
- **多環境管理**：測試項目可依 `SIT`、`UAT`、`Online` 分環境獨立切換與維護。
- **測試流程狀態**：`未測試` ➔ `Pending` ➔ `Fail` ➔ `Fixed` ➔ `Retest` ➔ `Pass`。
- **詳細屬性**：測試方式、預期結果、備註、測試人員、模組、優先級與排序。
- **圖片附件**：每個測試項目可上傳多張截圖，清單支援首張縮圖預覽與微型圖片展櫃。
- **匯入/匯出與歷程**：支援 CSV / XLSX 試算表匯入匯出，自動保留歷程變更紀錄。

### 3. Dashboard 統計資訊
- 自動統計各環境與測試項目的狀態分布、Pass 率與圖表。

---

## 技術堆棧

- **Frontend**: Vue 3 + Vite + Naive UI + TypeScript
- **Backend**: ElysiaJS + Bun + SQLite (`bun:sqlite`)
- **Container**: Docker Compose

---

## 單元測試 (Unit Tests)

本專案後端包含全套單元測試（包含 API 驗證、CRUD、批次匯入與清空）：

```bash
cd backend
bun test
```

---

## Docker Compose 啟動說明

```bash
docker compose up --build -d
```

啟動後開啟瀏覽器存取：

- **Frontend**: `http://localhost:7005` 或 `http://<server-ip>:7005`
- **Backend API**: 由前端 Nginx 反向代理 `/api`
- **Uploaded files**: 由前端 Nginx 反向代理 `/uploads`

如需自訂通訊埠：

```bash
FRONTEND_PORT=5173 docker compose up --build -d
```

---

## 資料與環境變數設定

### 後端持久化目錄：
- SQLite DB 位置: `backend/data/pre-online-tracker.db`
- 上傳圖片目錄: `backend/uploads/`

### 後端環境變數 (Backend Environment Variables)：
- `SIMPLE_PASSWORD`: 登入密碼（預設 `2026`）
- `APP_TOKEN`: API Token（預設 `local-token`）
- `DB_PATH`: SQLite 檔案路徑
- `UPLOAD_DIR`: 圖片上傳目錄
- `PORT`: API 伺服器埠號
