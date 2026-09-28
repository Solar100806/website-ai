# MindNova AI

Nền tảng học trực tuyến tiếng Việt: học viên mua và học khóa, giảng viên tạo nội dung, admin duyệt user / khóa / payout. Có AI tutor, quiz, study plan.

Product UI là **Next.js**, không phải Blade. Laravel chỉ là API (`/api/*`).

Repo: https://github.com/NgocPhong1609/website-ai.git

```
Browser  :3000   mindnova-ai/                 Next.js 16 + React 19
    │
    └── /api/*  →  :8000   website-MindNova-AI/   Laravel (PHP 8.3) + MySQL
```

Chi tiết kiến trúc: `AGENTS.md`, `PROJECT_CONTEXT.md`, `mindnova-ai/DESIGN.md`, `wiki/Home.md`.

## Yêu cầu máy

Đã đối chiếu với `composer.json`, `package.json`, `.env.example` trên nhánh `main`:

- Git
- PHP **8.3+** với: `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `fileinfo`, `curl`
- Composer 2
- MySQL 8 (hoặc MariaDB tương đương). Default trong config nếu thiếu env là sqlite — **local chuẩn dùng MySQL**
- Node.js **20.9+** (Next.js 16.2)
- pnpm (frontend có `pnpm-lock.yaml`, không dùng npm/yarn)
- Không bắt buộc Redis: cache/session/queue default là `database`

## Cài đặt local

### 1. Clone

```bash
git clone https://github.com/NgocPhong1609/website-ai.git
cd website-ai
```

Không import `database.sql` để cài. File đó là dump cấu trúc; schema chuẩn đi từ `website-MindNova-AI/database/migrations/`.

### 2. Backend (Laravel, port 8000)

```bash
cd website-MindNova-AI
composer install
cp .env.example .env
php artisan key:generate
```

Tạo database rồi sửa `DB_*` trong `.env` cho khớp user MySQL của máy:

```sql
CREATE DATABASE du_an CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Các giá trị local bắt buộc (đã để sẵn trong `.env.example`):

```env
APP_NAME="MindNova AI"
APP_URL=http://127.0.0.1:8000
FRONTEND_URL=http://localhost:3000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=du_an
DB_USERNAME=root
DB_PASSWORD=
```

`SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION` để `database` như `.env.example`. Không đổi sang sqlite trừ khi biết mình đang làm gì.

```bash
php artisan migrate
php artisan db:seed
php artisan storage:link
php artisan serve --host=127.0.0.1 --port=8000
```

Kiểm tra: http://127.0.0.1:8000 phải lên Laravel. API prefix là `/api`.

Terminal riêng nếu cần queue (mail OTP, job):

```bash
php artisan queue:listen --tries=1 --timeout=0
```

Không chạy `composer run dev` để dùng product. Script đó mở Vite/Blade legacy + `pail`, dễ trùng port với Next.js.

### 3. Frontend (Next.js, port 3000)

Mở terminal mới từ root repo:

```bash
cd mindnova-ai
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.local` (không commit):

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_REVERB_HOST=localhost
NEXT_PUBLIC_REVERB_PORT=8080
NEXT_PUBLIC_REVERB_APP_KEY=mindnova_chat_key
NEXT_PUBLIC_REVERB_SCHEME=http
```

Mở http://localhost:3000

`next.config.ts` rewrite `/api/:path*` → Laravel. Callback thanh toán RSC đọc `BACKEND_URL`. Axios browser đọc `NEXT_PUBLIC_API_URL`; để trống sẽ dùng proxy cùng origin. `BACKEND_URL` mặc định local là `http://127.0.0.1:8000`.

Đăng ký nằm ở `/login?mode=register` (không có page `/register`).

## Tài khoản sau `db:seed`

Từ `database/seeders/InstructorSeeder.php` và `StudentFlowTestSeeder.php`. Mật khẩu seed chỉ dùng local.

Giảng viên (password: `password`):

- `teacher@mindnova.ai`
- `alex.teacher@mindnova.ai`

Học viên (password: `password`):

- `hieu.student@mindnova.ai`
- `long.student@mindnova.ai`
- `anh.student@mindnova.ai`

Học viên kịch bản test (password: `password123`):

- `student.empty@mindnova.com`
- `student.progress@mindnova.com`
- `student.completed@mindnova.com`

Seeder **không tạo tài khoản admin**. Role `admin` có trong bảng `roles`, nhưng không có user gắn sẵn.

## Biến tùy chọn (không cần để boot app)

Để trống thì app vẫn chạy; thiếu key thì từng chức năng đó tắt/lỗi.

- AI: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` (Gemini primary, Groq tutor/quiz, OpenAI backup)
- Thanh toán sandbox: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`
- Video/media cloud: `CLOUDFLARE_R2_*` — default `FILESYSTEM_DISK=local`
- Mail OTP quên mật khẩu: `MAIL_*` (`.env.example` đang trỏ SMTP Gmail)
- Google login: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — callback quay về `${FRONTEND_URL}/login-success`

Return URL VNPay/MoMo dùng `${FRONTEND_URL}/payment/callback`; cấu hình domain/cổng bằng env backend.

## Realtime chat

FE Echo/Reverb đọc `NEXT_PUBLIC_REVERB_*` (default host `localhost`, port `8080`, key `mindnova_chat_key`).

Trên `main` hiện **chưa chạy được chat realtime nếu chỉ copy env**:

- `config/broadcasting.php` không có, chỉ còn `config/broadcasting.php.bak`
- `.env.example` để `BROADCAST_CONNECTION=log`

Học bài / REST API không phụ thuộc Reverb.

## Test

Frontend:

```bash
cd mindnova-ai
pnpm test
```

Backend (Pest). `phpunit.xml` trỏ MySQL database `du_an_testing` — tạo DB này trước:

```sql
CREATE DATABASE du_an_testing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
cd website-MindNova-AI
php artisan test
```

End-to-end (Playwright, luồng học viên). Cần backend `:8000` và frontend `:3000` đang chạy, catalog có ít nhất một khóa **miễn phí** đã publish:

```bash
cd mindnova-ai
npx playwright install chromium   # lần đầu
pnpm test:e2e                     # E2E_BASE_URL / E2E_API_URL để đổi địa chỉ
```

Bộ E2E tự đăng ký tài khoản `e2e.student.*@mindnova.test`. Dọn dữ liệu này (chỉ chạy ở local/testing):

```bash
cd website-MindNova-AI
php artisan e2e:purge-users --dry-run   # xem trước
php artisan e2e:purge-users
```

## Git (làm việc nhóm)

Làm trên branch riêng, không commit thẳng lên `main` trừ khi được giao rõ.

```bash
git checkout main
git pull origin main
git checkout -b feature/[ten-thanh-vien]
# ... commit
git push origin feature/[ten-thanh-vien]
```

Mở Pull Request: base `main` ← compare `feature/[ten-thanh-vien]`.

Cập nhật từ `main`:

```bash
git checkout main
git pull origin main
git checkout feature/[ten-branch]
git merge main
```

Không commit file `.env`, `.env.local`, hay service-account JSON.


## Cấu hình local và deploy

Các URL ứng dụng nằm trong biến môi trường; không sửa domain trong source để chuyển môi trường.
Xem [hướng dẫn cấu hình kết nối](docs/environment-urls.md) cho frontend local dùng backend Railway,
Vercel, callback đăng nhập/thanh toán và WebSocket.

Thông báo lỗi frontend dùng bộ xử lý chung; xem [quy ước và kiểm thử thông báo lỗi](docs/user-error-messages.md).

### OTP email on Railway via Resend

The backend includes `resend/resend-php` for Laravel's built-in HTTPS mail transport.
In the Railway backend service, configure `MAIL_MAILER=resend`, `RESEND_API_KEY`
(secret), `MAIL_FROM_ADDRESS=no-reply@mail.halong.website`, and
`MAIL_FROM_NAME="MindNova AI"`. The sender domain must be verified in Resend.
Deploy the SDK before switching the running mailer; rebuild cached configuration
on deployment. SMTP variables are unused with this mailer. Never commit API keys.
Existing OTP expiry, verification, and password reset behavior is unchanged.
Validate transport with Resend's `delivered@resend.dev` test recipient, then confirm
receipt using an owned inbox; API acceptance alone does not establish inbox delivery.

### Gemini model fallback

Set `GEMINI_MODEL=gemini-3.8-flash` and
`GEMINI_FALLBACK_MODELS=gemini-3.7-flash,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite`
to try the configured Gemini models in order after transient failures. Authentication
and other permanent errors retain the existing behavior. Each model retains the
existing retry policy; a long chain can increase latency. Usage records retain the
actual model and shared request ID. The existing backup provider (Groq in production)
is tried after the Gemini chain is exhausted. Keep credentials in private environment
variables, never in tracked files.

Course outline generation reserves up to 32,768 output tokens for full lesson content.
Before returning success it requires 4–6 chapters, each containing three nonempty
document lessons followed by one quiz with three questions, four answers per
question, and exactly one correct answer. Incomplete model responses are recorded
as `invalid_response` and use the existing retry/fallback policy. Other AI features
retain their own response handling and token limits. This validates structure, not
pedagogical quality or a precise document word count.

Outline generation uses a 180-second total AI deadline across all retries/models,
with PHP's execution limit raised to 210 seconds only for this endpoint. Each HTTP
attempt is capped by the remaining deadline (and the existing 90-second cap).
Exhaustion returns the normal JSON error instead of PHP terminating at its default
30 seconds. Validate deployment over authenticated HTTP; CLI execution does not
exercise PHP's web execution limit.

In the create-course draft, dragging a lesson's grip onto another lesson moves it
to that position. Cross-chapter moves preserve the original lesson ID, media and
quiz data, renumber both lesson lists, and persist the updated draft to session
storage. Dropping a lesson onto itself leaves its position unchanged.

## Tạo quiz AI theo chương

Trong **Tạo bài kiểm tra → Tạo bằng AI**, chọn khóa học rồi chọn **Phạm vi nội dung**:

- **Toàn khóa học**: giữ luồng tạo quiz tổng hợp hiện tại.
- **Một chương cụ thể**: chỉ dùng nội dung văn bản của bài học trong chương; bỏ qua quiz có sẵn và bài chưa có văn bản. Chương không có nội dung phù hợp sẽ được báo để bổ sung, không tự chuyển sang đọc toàn khóa.

Sau khi duyệt câu hỏi và lưu, quiz theo chương được gắn vào cuối chương đã chọn trong cùng giao dịch lưu. Tạo lại một câu hỏi vẫn dùng nội dung chương đó; sửa quiz đã lưu không đổi vị trí gắn.

API instructor `ai-quiz/generate`, `ai-quiz/regenerate-question` và `ai-quiz/store` nhận thêm `module_id` tùy chọn kèm `course_id`. Máy chủ kiểm tra chương thuộc đúng khóa học và quyền sở hữu. Bỏ `module_id` để dùng hành vi hiện có. Không cần migration.

Thời gian tạo quiz AI: các lượt gọi mô hình dùng chung giới hạn 180 giây; giao diện chờ tối đa 210 giây để nhận kết quả hoặc lỗi từ máy chủ. Riêng tạo quiz, mỗi mô hình thử một lần rồi chuyển dự phòng khi gặp lỗi tạm thời. Các tính năng AI khác giữ số lần thử mặc định.

Điều kiện gửi duyệt và phát hành khóa học: phải chọn chính thức cả **Bài kiểm tra tổng quát** (`capability_assessment`) và **Bài kiểm tra cuối khóa học** (`end_of_course`), mỗi bài có ít nhất một câu hỏi. Đề chưa chọn, đề rỗng và quiz trong chương không thay thế hai bài này. Course Health báo lỗi khi thiếu; máy chủ kiểm tra lúc gửi duyệt và kiểm tra lại lúc quản trị viên phát hành, kể cả hồ sơ đã gửi trước khi áp dụng điều kiện này.

Xem trước của giảng viên (`/courses/lesson?course_id=…&preview=true`) lấy thông tin và cấu trúc bản nháp qua API instructor có kiểm tra quyền sở hữu, tách khỏi bộ nhớ đệm khóa học của học viên. Video tải lên dùng URL có chữ ký của instructor. Xem bài và làm thử quiz không ghi tiến độ, không nộp/lưu kết quả học viên; tự luận cho đối chiếu đáp án mẫu và rubric, không chấm điểm AI trong preview. Khóa trống hoặc lỗi quyền truy cập được báo rõ.

Course detail includes a read-only “Điều kiện hoàn tiền” popup: paid/unrefunded order, within 30 days of purchase, progress at most 10% AND at most 5 completed lessons. Opening it never submits a refund.
