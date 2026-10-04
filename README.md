# Codex Desktop Nexus

ابزار محلی برای مدیریت پرووایدر و مدل در Codex CLI، ساخت پروفایل های نام دار `provider + model` و اعمال پوسته Monokai به Codex Desktop یا ChatGPT Desktop.

این پروژه به صورت محلی اجرا می شود. داشبورد فقط روی `127.0.0.1:4321` گوش می دهد و به اینترنت یا یک سرویس ابری واسط برای نمایش رابط کاربری وابسته نیست.

## چه چیزی نصب می شود؟

- داشبورد محلی برای افزودن، ویرایش، آزمودن و انتخاب پرووایدرهای سازگار با OpenAI.
- فهرست مدل هر پرووایدر از مسیر استاندارد `/models` همان پرووایدر دریافت می شود.
- پروفایل های نام دار: هر پروفایل فقط یک نام، شناسه پرووایدر و نام مدل دارد. کلید API، نشانی پرووایدر یا تنظیمات جداگانه در پروفایل کپی نمی شود.
- پوسته Monokai برای Markdown و سازگاری راست به چپ و چپ به راست در Desktop.
- یک دکمه شناور کوچک در پایین سمت راست Desktop. در حالت بسته فقط نام مدل فعال را نشان می دهد؛ با باز کردن آن می توان پروفایل یا زوج `provider + model` را انتخاب کرد.

## پیش نیازها

1. Node.js که از `node --test` پشتیبانی کند. Node.js 18 یا جدیدتر پیشنهاد می شود.
2. یک نصب محلی Codex Desktop یا ChatGPT Desktop، فقط برای بخش patch.
3. دسترسی نوشتن به فایل نصب Desktop. در Linux و معمولاً macOS این دسترسی با `sudo` داده می شود. در Windows ترمینال را با **Run as administrator** باز کنید.

پچر مسیرهای رایج `app.asar` را در Linux، macOS و Windows جستجو می کند. اگر نصب Desktop در مسیر غیرمعمولی باشد، وضعیت آن را «پیدا نشد» گزارش می کند و تغییری در فایل های برنامه نمی دهد.

## نصب از سورس

```bash
git clone https://github.com/amirimatin/chatgpt-desktop-nexus.git
cd chatgpt-desktop-nexus
npm install
npm test
```

پروژه در زمان اجرا وابستگی npm شخص ثالث ندارد، اما اجرای `npm install` باعث می شود محیط npm و فرمان های پروژه آماده باشند. آزمون ها قبل از patch کردن Desktop، منطق پچر، پروفایل ها، سرور محلی و قراردادهای API را بررسی می کنند.

برای دریافت نسخه های بعدی:

```bash
git pull --ff-only
npm install
npm test
```

بعد از هر به روزرسانی این پروژه، اگر Desktop قبلاً patch شده است، بخش «به روزرسانی یا اعمال دوباره patch» را انجام دهید.

## راه اندازی داشبورد محلی

### اجرای موقت در ترمینال

```bash
npm run dashboard
```

یا:

```bash
./bin/cli.js dashboard --port 4321
```

سپس نشانی [http://127.0.0.1:4321](http://127.0.0.1:4321) را در مرورگر باز کنید. تا زمانی که این فرمان در حال اجراست، داشبورد و منوی شناور Desktop در دسترس هستند. برای توقف اجرای موقت، در همان ترمینال `Ctrl+C` بزنید.

### اجرای پس زمینه در Linux با systemd کاربر

برای اینکه داشبورد بعد از بستن ترمینال نیز در دسترس بماند:

```bash
./bin/cli.js service install
systemctl --user status codex-desktop-nexus.service
```

این فرمان یک سرویس کاربری به نام `codex-desktop-nexus.service` می سازد و آن را روی پورت `4321` اجرا می کند. برای مشاهده گزارش ها:

```bash
journalctl --user -u codex-desktop-nexus.service -f
```

برای حذف سرویس:

```bash
./bin/cli.js service remove
```

دستور `service` مخصوص Linux و systemd است. در macOS و Windows از اجرای موقت داشبورد یا ابزار سرویس سازگار با سیستم عامل خود استفاده کنید.

## ساخت و استفاده از پروفایل مدل

1. داشبورد را باز کنید.
2. ابتدا پرووایدر مورد نظر را در بخش مدیریت پرووایدرها بسازید یا ویرایش کنید. هر پروفایل فقط می تواند به یک پرووایدر از قبل پیکربندی شده اشاره کند.
3. مدل را انتخاب کنید.
4. از منوی شناور Desktop، دکمه **Save profile** را بزنید و یک نام به یادماندنی وارد کنید.
5. برای فعال سازی مجدد، پروفایل را از فهرست **Profile** انتخاب کنید. Desktop پس از اعمال، Codex را برای بارگذاری مدل جدید بازنشانی می کند.

پروفایل ها در `~/.codex/nexus-model-profiles.json` نگهداری می شوند. این فایل فقط نام، `providerId` و `model` را ذخیره می کند و نباید آن را محل نگهداری کلید API بدانید. حذف یا تغییر یک پرووایدر می تواند پروفایل وابسته به آن را غیرقابل استفاده کند.

برای مشاهده یا تغییر مدل فعال از خط فرمان:

```bash
./bin/cli.js provider list
./bin/cli.js provider use <provider-id> <model-name>
```

نمونه:

```bash
./bin/cli.js provider use omniroute antigravity/gemini-3.8-flash-high
```

## اعمال patch روی Codex Desktop

### 1. Desktop را کامل ببندید

پیش از patch کردن، Codex Desktop یا ChatGPT Desktop را کاملاً ببندید. فقط بستن پنجره کافی نیست اگر برنامه در system tray یا پس زمینه باقی بماند؛ همه پردازش های آن باید متوقف شوند. این کار از بازنویسی همزمان `app.asar` جلوگیری می کند.

### 2. وضعیت نصب را بررسی کنید

```bash
npm run status:desktop
```

خروجی این فرمان محل `app.asar`، وجود پشتیبان، قابل نوشتن بودن نصب، و وضعیت پوسته و منوی مدل را نشان می دهد. اگر برنامه پیدا نشد یا قابل نوشتن نبود، هنوز patch را اجرا نکنید؛ بخش رفع اشکال را ببینید.

### 3. patch را اعمال کنید

در Linux یا macOS:

```bash
sudo npm run patch:desktop -- --force
```

در Windows، PowerShell یا Command Prompt را با دسترسی Administrator باز کنید و اجرا کنید:

```powershell
npm run patch:desktop -- --force
```

گزینه `--force` ابتدا تزریق قبلی Nexus را از `webview/index.html` پاک می کند، سیاست امنیت محتوا را با حفظ تنظیمات اصلی بازسازی می کند و سپس نسخه فعلی پوسته و منوی مدل را قرار می دهد. استفاده از آن پس از به روزرسانی پروژه یا به روزرسانی Desktop ضروری است.

اولین اجرای موفق، یک نسخه پشتیبان هم نام با این الگو ایجاد می کند:

```text
<path-to-app.asar>.codex-nexus-markdown-theme.bak
```

### 4. Desktop را دوباره اجرا کنید

پس از پایان موفق فرمان، Codex Desktop یا ChatGPT Desktop را دوباره باز کنید. منوی بسته در پایین سمت راست باید تنها نام مدل فعال را نمایش دهد. با کلیک روی آن، منوی انتخاب پروفایل، پرووایدر و مدل باز می شود.

منوی شناور برای این است که مستقل از ساختار داخلی و متغیر هدر چت Desktop باقی بماند. وجود کد patch شده به تنهایی اثبات نمی کند که نسخه نصب شده تغییر کرده است؛ مشاهده منو پس از اجرای مجدد برنامه، معیار تأیید نهایی است.

### به روزرسانی یا اعمال دوباره patch

هرگاه این مخزن یا خود برنامه Desktop به روز شد:

```bash
git pull --ff-only
npm install
npm test
sudo npm run patch:desktop -- --force
```

سپس Desktop را کامل ببندید و دوباره اجرا کنید. به روزرسانی Desktop ممکن است `app.asar` را جایگزین کند؛ در آن حالت لازم است patch دوباره اعمال شود.

## بازگردانی به حالت اصلی

برای بازگردانی فایل پشتیبان Nexus:

```bash
sudo npm run restore:desktop
```

در Windows همان فرمان را در ترمینال Administrator و بدون `sudo` اجرا کنید:

```powershell
npm run restore:desktop
```

سپس Desktop را دوباره اجرا کنید. بازگردانی فقط patch مربوط به Nexus را برمی دارد؛ تنظیمات پرووایدر و پروفایل های محلی را حذف نمی کند.

## راهنمای رفع اشکال

| نشانه | بررسی و اقدام |
| --- | --- |
| `Codex Desktop app.asar was not found` | مطمئن شوید Codex Desktop یا ChatGPT Desktop نصب است و با `npm run status:desktop` مسیرهای تشخیص داده شده را بررسی کنید. پچر فقط مسیرهای رایج سیستم عامل را جستجو می کند. |
| `Permission denied` | Desktop را ببندید و فرمان patch یا restore را با دسترسی Administrator اجرا کنید. در Linux و macOS از `sudo` استفاده کنید. |
| منوی مدل نمایش داده نمی شود | ابتدا داشبورد را روی `127.0.0.1:4321` اجرا کنید. سپس از آخرین سورس استفاده کنید، `sudo npm run patch:desktop -- --force` را اجرا کنید و Desktop را کاملاً راه اندازی مجدد کنید. |
| پیام `Nexus dashboard is offline` | بررسی کنید داشبورد در حال اجراست: `npm run dashboard` یا `systemctl --user status codex-desktop-nexus.service`. پورت پیش فرض `4321` است. |
| فهرست مدل ها بارگذاری نمی شود | پرووایدر انتخابی باید پیش تر در داشبورد پیکربندی شده باشد و نشانی `/models` آن قابل دسترس باشد. پروفایل به تنهایی پرووایدر یا کلید API ایجاد نمی کند. |
| بعد از patch صفحه سیاه است | Desktop را ببندید، `sudo npm run restore:desktop` را اجرا و برنامه را دوباره باز کنید. سپس وضعیت را با `npm run status:desktop` بررسی کنید و قبل از patch دوباره، آزمون ها را با `npm test` اجرا کنید. |

## مرجع فرمان ها

| هدف | فرمان |
| --- | --- |
| اجرای داشبورد | `npm run dashboard` |
| نصب سرویس پس زمینه Linux | `./bin/cli.js service install` |
| وضعیت سرویس Linux | `systemctl --user status codex-desktop-nexus.service` |
| مشاهده وضعیت patch | `npm run status:desktop` |
| اعمال یا اعمال دوباره patch | `sudo npm run patch:desktop -- --force` |
| بازگردانی Desktop | `sudo npm run restore:desktop` |
| فهرست پرووایدرها | `./bin/cli.js provider list` |
| انتخاب مدل از خط فرمان | `./bin/cli.js provider use <provider-id> <model-name>` |
| اجرای آزمون ها | `npm test` |

## محدودیت و نکته امنیتی

- این پروژه فایل بسته برنامه Desktop، یعنی `app.asar`، را تغییر می دهد. قبل از این کار برنامه را ببندید و پشتیبان ساخته شده را نگه دارید.
- patch فقط روی کپی نصب شده همین ماشین اثر می گذارد و با انتشار مخزن یا اجرای آزمون ها، خودکار روی Desktop نصب نمی شود.
- کلیدهای API را در README، issue، commit یا فایل پروفایل قرار ندهید.
- رفتار و ساختار داخلی Codex Desktop ممکن است با هر به روزرسانی OpenAI تغییر کند. پس از هر به روزرسانی، ابتدا وضعیت را بررسی و سپس patch را با `--force` اعمال کنید.

## آزمون

```bash
npm test
```

این فرمان باید پیش از patch کردن نسخه نصب شده و پس از هر تغییر سورس با خروجی بدون خطا تمام شود.
