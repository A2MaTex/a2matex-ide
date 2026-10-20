# A2MaTeX Studio

Desktop IDE để xây dựng, kiểm thử và đóng gói workflow automation Android cho hệ sinh thái A2MaTeX. Studio dùng Electron + React + TypeScript; renderer được cách ly và chỉ làm việc với hệ điều hành qua preload API có type.

## Yêu cầu

- Node.js 22 trở lên
- npm 10 trở lên
- Linux cần các system library của Electron và display server; có thể dùng xvfb-run trong CI

## Chạy desktop app

```bash
npm install
npm run dev:desktop
```

Lệnh trên khởi động Vite dev server và Electron với hot reload cho renderer. Chỉ chạy giao diện web để phát triển nhanh:

```bash
npm run dev:web
```

Build và chạy bản production local:

```bash
npm run build:desktop
npm exec electron .
```

Nếu shell đang đặt ELECTRON_RUN_AS_NODE, bỏ biến đó trước khi chạy Electron:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev:desktop
```

## Project format (schema v1)

Project đang author là một thư mục:

```text
my-automation/
├── a2matex.project.json
└── workflows/
    └── main.workflow.json
```

Create/Open/Save/Save As chạy qua Electron main process. Renderer chỉ giữ location token được main process cấp, không nhận quyền đọc một path tùy ý. File JSON được validate bằng Zod và ghi theo cơ chế temporary-file + fsync + rename để giảm nguy cơ project bị hỏng.

Web preview dùng in-memory repository; dữ liệu không tồn tại sau khi reload.

## Visual workflow editor

Workspace Phase 2 cung cấp:

- React Flow canvas và node palette có search/category/drag-drop.
- Bốn node built-in: Start, Delay, Tap và Log.
- Schema-driven Inspector và Problems navigation.
- Domain validation cho property, port, cardinality, reference và cycle.
- Undo/redo, delete, duplicate, copy/paste và revision-safe dirty state.

Phím tắt:

- Ctrl/Cmd+S: save
- Ctrl/Cmd+Z và Ctrl/Cmd+Shift+Z: undo/redo
- Ctrl/Cmd+C và Ctrl/Cmd+V: copy/duplicate node
- Delete/Backspace: xóa node đang chọn
- /: focus node search

## Kiểm tra chất lượng

```bash
npm run quality
npm run test:e2e
```

Các lệnh riêng:

- npm run lint
- npm run typecheck
- npm run test
- npm run build:desktop
- npm run format:check

Trên Linux headless:

```bash
xvfb-run -a npm run test:e2e:run
```

## Tài liệu

- [`docs/`](docs/README.md): requirements, thiết kế, kế hoạch và decision log của project.
- [`specs/`](specs/README.md): kiến trúc chuẩn tắc và ADR chi phối implementation.
