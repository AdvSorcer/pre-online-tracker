# Pre Online Tracker

上線前 SIT / UAT / Online 測試情境追蹤小系統。

## 功能

- 進入系統前輸入簡易密碼，預設 `2026`
- **Issue 追蹤與管理**：全域 Issue 追蹤（自動生成編號如 `ISSUE-1`）
  - 支援 `Feature (需求)`、`Bug (缺陷)`、`Task (任務)`（預設新增為 Feature）
  - 支援優先級、預計完成日、指派人、標題與長內文描述
  - 支援優先級（高 ➔ 低）與預計完成日排序（預設優先級高者優先）
  - 關閉 (Closed) 之 Issue 自動自主列表隱藏並歸檔至「已關閉」抽屜，支援查看與重開
- **測試清單**：測試項目可依 `SIT`、`UAT`、`Online` 分環境管理
- 測試狀態流程：`未測試`、`Pending`、`Fail`、`Fixed`、`Retest`、`Pass`
- 測試方式、預期結果、備註、測試人員欄位
- 模組、優先級、負責人、排序欄位，支援篩選與排序
- CSV / XLSX 匯入與匯出
- 測試紀錄歷程，保留建立、匯入、狀態變更與欄位更新紀錄
- 每個測試項目可上傳多張圖片
- 清單顯示第一張縮圖與圖片張數，可用「查看更多」檢視完整內容
- Dashboard 顯示各環境測試統計

## 技術

- Frontend: Vue 3 + Vite + Naive UI
- Backend: ElysiaJS
- Database: SQLite
- Runtime: Bun
- Container: Docker Compose

## 單元測試

```bash
cd backend
bun test
```

## Docker Compose 啟動

```bash
docker compose up --build -d
```

啟動後開啟：

- Frontend: `http://localhost:7005` 或 `http://<server-ip>:7005`
- Backend API: 由前端 Nginx 反向代理 `/api`
- Uploaded files: 由前端 Nginx 反向代理 `/uploads`

如果要改用其他 port：

```bash
FRONTEND_PORT=5173 docker compose up --build -d
```

然後開啟 `http://<server-ip>:5173`。

Production compose 不需要把 backend port 對外公開；frontend 與 backend 會透過 Docker Compose 內部網路互通。

Backend 資料會直接存放在 server 上的專案資料夾：

- SQLite DB: `backend/data/pre-online-tracker.db`
- Uploaded files: `backend/uploads/`

## 環境變數

Backend:

- `SIMPLE_PASSWORD`: 登入密碼，預設 `2026`
- `APP_TOKEN`: API token，預設 `local-token`
- `DB_PATH`: SQLite 檔案位置
- `UPLOAD_DIR`: 圖片上傳目錄
- `PORT`: API port
