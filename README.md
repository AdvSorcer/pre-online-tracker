# Pre Online Tracker

上線前 SIT / UAT / Online 測試情境追蹤小系統。

## 功能

- 進入系統前輸入簡易密碼，預設 `2026`
- 測試項目可依 `SIT`、`UAT`、`Online` 分環境管理
- 測試狀態：`未測試`、`Pass`、`Fail`
- 測試方式、預期結果、備註、測試人員欄位
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
docker compose up --build
```

啟動後開啟：

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## 環境變數

Backend:

- `SIMPLE_PASSWORD`: 登入密碼，預設 `2026`
- `APP_TOKEN`: API token，預設 `local-token`
- `DB_PATH`: SQLite 檔案位置
- `UPLOAD_DIR`: 圖片上傳目錄
- `PORT`: API port
