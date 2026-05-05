# Pre Online Tracker

上線前 SIT / UAT / Online 測試情境追蹤小系統。

## 功能

- 進入系統前輸入簡易密碼，預設 `2026`
- 測試項目可依 `SIT`、`UAT`、`Online` 分環境管理
- 測試狀態流程：`未測試`、`Fail`、`Fixed`、`Retest`、`Pass`
- 測試方式、預期結果、備註、測試人員欄位
- 模組、功能、優先級、負責人、排序欄位，支援篩選與排序
- CSV 匯入，CSV / XLSX 匯出
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
