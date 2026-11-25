# 🤖 Expends Bot: pencatat keuangan pribadi & keluarga di Telegram

Bot ini mencatat pengeluaran dari **teks**, **voice note**, dan **foto struk**, lalu menyimpannya ke Google Sheets milikmu sendiri. Semuanya berjalan gratis (Rp 0) di Vercel, tanpa laptop yang harus menyala.

Baca dari atas ke bawah, kerjakan **satu langkah dalam satu waktu**, dan jangan loncat. Total waktu sekitar 45–60 menit untuk pemula.

---

## Bab 1. Gambaran Umum & Cara Kerja Bot

Bayangkan kamu punya **asisten pribadi** yang duduk di kantor kecil:

| Di dunia nyata | Di bot ini | Fungsinya |
|---|---|---|
| Kamu kirim surat/WA ke asisten | **Telegram** | Tempat kamu mengetik "kopi 20rb" |
| Meja kerja asisten (hanya terang saat ada surat masuk) | **Vercel** | Menjalankan kode bot, gratis |
| Buku besar kas | **Google Sheets** | Menyimpan semua catatan |
| Juru tulis yang bisa baca tulisan, struk, dan suara | **Gemini (AI)** | Mengubah ucapan/foto/teks jadi data rapi |
| Kasir yang menghitung pakai kalkulator | **Kode bot** | Semua jumlah, pajak, dan persen budget dihitung di sini, **bukan oleh AI** |

Alurnya: kamu kirim pesan → Telegram meneruskannya ke Vercel → Gemini membaca isi pesannya → kode bot menghitung → hasilnya ditulis ke Google Sheets → bot membalas "✅ Tercatat".

**Yang bisa dilakukan bot:** catat via teks/suara/foto struk · pilih sebagian item struk (patungan) · budget bulanan + peringatan 75%/90%/100% + peringatan "boros terlalu cepat" · laporan dengan grafik · cari riwayat · ekspor CSV · mode keluarga (satu kolam budget) · hapus/edit lewat tombol atau balasan pesan.

**Batasan jujur (baca sebelum mulai):**
- Bot hanya bekerja di **chat pribadi** (bukan grup).
- Foto harus dikirim sebagai **foto** (bukan sebagai "file/dokumen").
- Voice note maksimal **60 detik**.
- Edit lewat balasan **tidak bisa** mengubah tanggal ke masa depan.
- Anggota keluarga bisa memakai bot, tetapi **tidak otomatis bisa membuka file Google Sheets**. Itu harus kamu bagikan sendiri lewat tombol Share kalau mau.
- Vercel paket gratis (Hobby) hanya untuk pemakaian **pribadi/non-komersial**.
- Data foto/suara/teks dikirim ke Gemini versi gratis. Menurut ketentuan Google untuk paket gratis, data itu **boleh dipakai Google untuk memperbaiki produknya**. Jangan kirim foto dokumen sensitif.

---

## Bab 2. Langkah 1: Membuat Bot di Telegram (@BotFather) & Mendapatkan ID Telegram

### A. Membuat bot dan menyalin token

1. Buka aplikasi **Telegram** di HP atau komputer.
2. Ketuk/klik **kolom pencarian** di bagian atas (ikon kaca pembesar).
3. Ketik `BotFather`. Pilih hasil yang bernama **BotFather** dengan **centang biru** di sebelah namanya (`@BotFather`).
4. Ketuk tombol **Start** (Mulai) di bagian bawah. Kalau tidak ada tombol Start, ketik `/start` lalu tekan kirim.
5. Ketik `/newbot` lalu tekan kirim.
6. BotFather bertanya nama bot. Ketik `Expends` lalu kirim. (Nama ini bebas dan boleh sama dengan bot orang lain.)
7. BotFather bertanya *username*. Ketik `Expendsbot` lalu kirim. Username harus **unik** dan **berakhiran `bot`**. Kalau dijawab "sorry, this username is already taken", coba nama lain, misalnya `ExpendsKeluargaBot`.
8. BotFather membalas pesan panjang berisi tulisan **"Use this token to access the HTTP API:"**. Di bawahnya ada deretan seperti `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`. Itulah **TOKEN** kamu.
9. **Tekan dan tahan** token itu (di komputer: klik-ganda lalu Ctrl+C) sampai muncul menu → pilih **Copy** (Salin).
10. Tempel token ke tempat sementara, misalnya aplikasi **Catatan/Notes** atau Notepad, dengan judul `TELEGRAM_BOT_TOKEN`. **Jangan kirim token ini ke siapa pun** dan jangan tulis di GitHub. Siapa pun yang punya token itu bisa mengendalikan botmu.

### B. Mendapatkan ADMIN_TELEGRAM_ID (angka ID Telegram kamu)

1. Masih di Telegram, ketuk kolom pencarian lagi.
2. Ketik `userinfobot` lalu pilih `@userinfobot`.
3. Ketuk **Start**.
4. Bot membalas beberapa baris. Cari baris **`Id:`** diikuti angka, misalnya `Id: 987654321`. Angka itu adalah **ADMIN_TELEGRAM_ID** kamu.
5. Salin **angkanya saja** (tanpa tulisan `Id:`) ke Catatan dengan judul `ADMIN_TELEGRAM_ID`.

### C. Membuat kata sandi rahasia webhook (TELEGRAM_WEBHOOK_SECRET)

Ini kata sandi yang hanya diketahui Telegram dan botmu, supaya orang iseng tidak bisa mengirim data palsu.

1. Ketik sendiri campuran **huruf besar, huruf kecil, dan angka** sepanjang **minimal 24 karakter**, tanpa spasi. Boleh memakai `_` dan `-`. Contoh bentuknya: `Kx9mQ2vT7pLw3NzR8bYd5HsJ`. **Jangan pakai contoh ini**; buat sendiri.
2. Simpan di Catatan dengan judul `TELEGRAM_WEBHOOK_SECRET`.

---

## Bab 3. Langkah 2: Mendapatkan Kunci AI Gratis (Google Gemini API Key)

1. Buka browser (Google Chrome atau Safari). Klik kolom alamat di bagian paling atas, ketik `aistudio.google.com/apikey`, lalu tekan **Enter**.
2. Kalau diminta masuk, pilih akun Gmail kamu dan masukkan kata sandinya. Kalau muncul halaman *Terms of Service* (syarat layanan), centang kotaknya lalu klik **Continue**.
3. Klik tombol **Create API key** (Buat kunci API).
4. Kalau diminta memilih proyek, klik **Create API key in new project** (atau pilih proyek yang sudah ada).
5. Muncul jendela berisi kunci yang diawali `AIza...`. Klik ikon **salin** (dua kotak bertumpuk) di sebelah kunci itu.
6. Tempel ke Catatan dengan judul `GEMINI_API_KEY`.

> Paket gratis memiliki batas jumlah permintaan per menit dan per hari. Untuk pemakaian keluarga biasa sudah lebih dari cukup. Kalau suatu hari bot membalas "Gemini 429", artinya kuota gratis sedang habis, tunggu beberapa menit.

---

## Bab 4. Langkah 3: Menyiapkan Database Google Sheets (5 Tab + Rumus Dashboard)

### A. Membuat file dan mengatur bahasa/zona waktu

1. Buka tab baru di browser, ketik `sheets.new` di kolom alamat, tekan **Enter**. Sebuah spreadsheet kosong akan terbuka.
2. Klik tulisan **"Untitled spreadsheet"** (Spreadsheet tanpa judul) di pojok kiri atas, hapus isinya, ketik `Expends Bot Database`, tekan **Enter**.
3. Klik menu **File** (paling kiri atas) → klik **Settings** (Setelan) paling bawah.
4. Di tab **General**:
   - **Locale** (Lokal): pilih **United States**. *(Ini penting agar rumus memakai koma `,` dan bukan titik koma.)*
   - **Time zone** (Zona waktu): pilih zona waktumu, misalnya **(GMT+08:00) Makassar** untuk WITA, atau **(GMT+07:00) Jakarta** untuk WIB.
5. Klik tombol **Save settings** (Simpan setelan).

### B. Membuat 5 tab dengan nama PERSIS seperti ini

Nama tab harus sama **persis**, termasuk huruf besar-kecil dan garis bawah `_`. Salah satu huruf saja bot tidak akan jalan.

1. Lihat bagian paling **bawah** layar. Di sana ada tab bernama **Sheet1**. **Klik-kanan** Sheet1 → **Rename** (Ganti nama) → ketik `Transaksi` → tekan **Enter**.
2. Klik tanda **+** di kiri bawah (Add sheet) untuk membuat tab baru. **Klik-kanan** tab baru itu → **Rename** → ketik `Config_Users` → **Enter**.
3. Klik **+** lagi → Rename → `Kategori` → **Enter**.
4. Klik **+** lagi → Rename → `_State` (diawali garis bawah) → **Enter**.
5. Klik **+** lagi → Rename → `Dashboard` → **Enter**.

Sekarang di bawah ada 5 tab: `Transaksi`, `Config_Users`, `Kategori`, `_State`, `Dashboard`.

### C. Mengisi judul kolom (baris 1) satu per satu

Ketik tulisan persis seperti di bawah, tekan **Tab** di keyboard untuk pindah ke sel kanan. **Hanya baris 1.** Jangan isi baris lain, kecuali di tab `Kategori`.

**Tab `Transaksi`** (13 kolom, dari A1 sampai M1):

| A1 | B1 | C1 | D1 | E1 | F1 | G1 | H1 | I1 | J1 | K1 | L1 | M1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ID_Transaksi | Update_ID | Timestamp_Input | Tanggal_Transaksi | User_ID | Nama_User | Kategori | Title | Deskripsi_Poin | Nominal | Metode_Bayar | Hitung_Budget | Status |

**Tab `Config_Users`** (7 kolom, A1 sampai G1):

| A1 | B1 | C1 | D1 | E1 | F1 | G1 |
|---|---|---|---|---|---|---|
| Telegram_ID | Nama | Role | Mode_Budget | Target_Bulanan | Last_Alert_Milestone | Alert_Bulan |

Biarkan baris 2 ke bawah **kosong**. Bot akan mengisi barismu sendiri saat kamu pertama kali mengirim `/start`.

**Tab `Kategori`** (A1 dan B1, lalu isi baris 2–8):

| | A | B |
|---|---|---|
| 1 | Nama_Kategori | Limit_Opsional |
| 2 | Makanan & Minuman | |
| 3 | Transportasi | |
| 4 | Belanja Bulanan | |
| 5 | Tagihan | |
| 6 | Hiburan | |
| 7 | Kesehatan | |
| 8 | Lainnya | |

Kolom `Limit_Opsional` boleh kosong. Kalau kamu isi angka (misalnya `500000` di sebelah Hiburan), bot akan memberi peringatan sekali saat total kategori itu bulan ini melewati angka tersebut. Kamu bebas menambah, mengubah, atau menghapus kategori kapan saja. Bot membaca tab ini setiap kali ada pesan. Pertahankan satu kategori bernama `Lainnya`.

**Tab `_State`** (A1 sampai E1):

| A1 | B1 | C1 | D1 | E1 |
|---|---|---|---|---|
| Telegram_ID | Current_State | Payload_JSON | Updated_At | Last_Update_ID |

### D. Memasang rumus di tab `Dashboard`

Klik tab **Dashboard**. Klik **satu sel**, **tempel/ketik rumusnya persis**, lalu tekan **Enter**. Kerjakan berurutan:

| Sel | Isi (ketik persis) |
|---|---|
| A1 | `Bulan (YYYY-MM)` |
| B1 | `=TEXT(TODAY(),"yyyy-mm")` |
| A3 | `Total pengeluaran bulan ini` |
| B3 | `=SUMIFS(Transaksi!J:J,Transaksi!D:D,$B$1&"*",Transaksi!M:M,"ACTIVE")` |
| A4 | `Total yang dihitung budget` |
| B4 | `=SUMIFS(Transaksi!J:J,Transaksi!D:D,$B$1&"*",Transaksi!M:M,"ACTIVE",Transaksi!L:L,TRUE)` |
| A5 | `Jumlah transaksi` |
| B5 | `=COUNTIFS(Transaksi!D:D,$B$1&"*",Transaksi!M:M,"ACTIVE")` |
| A6 | `Pengeluaran hari ini` |
| B6 | `=SUMIFS(Transaksi!J:J,Transaksi!D:D,TEXT(TODAY(),"yyyy-mm-dd"),Transaksi!M:M,"ACTIVE")` |
| A8 | `Per kategori` |
| A9 | `=FILTER(Kategori!A2:A,Kategori!A2:A<>"")` |
| B9 | `=ARRAYFORMULA(IF(A9:A="","",SUMIFS(Transaksi!J:J,Transaksi!G:G,A9:A,Transaksi!D:D,$B$1&"*",Transaksi!M:M,"ACTIVE")))` |
| D8 | `Per hari` |
| D9 | `=QUERY(Transaksi!A2:M,"select D, sum(J) where M = 'ACTIVE' and D starts with '"&$B$1&"' group by D order by D label sum(J) ''",0)` |
| G8 | `Per anggota` |
| G9 | `=QUERY(Transaksi!A2:M,"select F, sum(J) where M = 'ACTIVE' and D starts with '"&$B$1&"' group by F order by sum(J) desc label sum(J) ''",0)` |

Penting:
- Semua rumus **hanya menghitung baris berstatus `ACTIVE`**. Transaksi yang kamu hapus lewat bot cuma berubah menjadi `DELETED` (tidak hilang dari sheet), jadi tidak ikut terhitung.
- Sebelum ada transaksi, angka tampil `0` atau kosong. **Itu normal.** Kalau sel menampilkan `#N/A` pada `D9`/`G9`, itu juga normal selama tab Transaksi masih kosong.
- Kalau muncul pesan **"Formula parse error"**, berarti Locale belum **United States** (ulangi langkah A nomor 4).
- Mau melihat bulan lain? Di sel **B1** ketik satu tanda petik lalu bulannya, yaitu `'2026-10` (**dengan tanda petik di depan**), tekan Enter. Tanpa tanda petik, Google mengubahnya jadi tanggal dan rumus rusak. Untuk kembali ke bulan berjalan, tempel lagi `=TEXT(TODAY(),"yyyy-mm")`.

### E. Menyalin GOOGLE_SHEET_ID dari alamat browser

1. Lihat **kolom alamat** browser di atas. Bentuknya seperti:
   `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG/edit#gid=0`
2. Ambil **bagian panjang yang berada di antara `/d/` dan `/edit`**. Pada contoh itu: `1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG`.
3. Blok bagian itu saja, salin, dan tempel ke Catatan dengan judul `GOOGLE_SHEET_ID`.

---

## Bab 5. Langkah 4: Membuat Robot Akses Google Sheets (Google Cloud Service Account)

"Service account" adalah **akun robot** milik botmu. Dia punya email sendiri, dan kamu memberinya izin mengedit spreadsheet-mu seperti memberi izin ke teman.

> Memakai **akun Gmail pribadi** paling aman. Akun sekolah/kampus/kantor kadang memblokir pembuatan kunci (lihat Bab 10).

### A. Membuat proyek di Google Cloud

1. Buka tab baru, ketik `console.cloud.google.com` di kolom alamat, tekan **Enter**.
2. Jika diminta login, masukkan Gmail dan kata sandi, lalu klik **Berikutnya/Next**. Jika muncul syarat layanan, centang lalu klik **Agree and continue**.
3. Lihat pojok kiri atas, di sebelah tulisan **Google Cloud**. Klik kotak dropdown yang bertuliskan nama proyek (atau **Select a project**).
4. Di jendela pop-up, klik tombol **NEW PROJECT** di pojok kanan atas jendela.
5. Di kolom **Project name** ketik `expends-bot`. Biarkan sisanya.
6. Klik tombol biru **CREATE**. Tunggu beberapa detik sampai ada notifikasi (ikon lonceng) bahwa proyek selesai dibuat.
7. Klik dropdown proyek lagi di kiri atas, lalu klik **expends-bot** di daftar supaya proyek itu yang aktif. (Nama `expends-bot` harus tampil di kotak kiri atas.)

> Langkah-langkah ini **tidak** meminta kartu kredit.

### B. Mengaktifkan Google Sheets API

1. Klik ikon **☰** (tiga garis, menu navigasi) di kiri atas.
2. Klik **APIs & Services** → klik **Library**.
3. Di kolom pencarian tengah layar ketik `Google Sheets API` lalu tekan **Enter**.
4. Klik hasil bernama **Google Sheets API** (ikon hijau).
5. Klik tombol biru **ENABLE**. Tunggu sampai halaman berubah menampilkan "API enabled".

### C. Membuat service account (akun robot)

1. Klik ikon **☰** lagi → **IAM & Admin** → **Service Accounts**.
2. Klik tombol **+ CREATE SERVICE ACCOUNT** di bagian atas.
3. Di kolom **Service account name** ketik `expends-bot-robot`.
4. Klik **CREATE AND CONTINUE**.
5. Di bagian "Grant this service account access to project" **jangan isi apa-apa**. Klik **CONTINUE**.
6. Di bagian berikutnya juga **jangan isi apa-apa**. Klik **DONE**.

### D. Mengunduh file kunci JSON

1. Di daftar Service Accounts, klik **alamat email** akun yang baru dibuat. Bentuknya `expends-bot-robot@expends-bot-xxxxx.iam.gserviceaccount.com`.
2. Klik tab **KEYS** di bagian atas halaman.
3. Klik tombol **ADD KEY** → pilih **Create new key**.
4. Pilih **JSON** (titik bulatnya harus terisi) → klik **CREATE**.
5. Sebuah file berakhiran `.json` otomatis terunduh (biasanya di folder **Downloads**). **File ini = kunci rumah robotmu. Jangan kirim ke siapa pun dan jangan unggah ke GitHub.**

### E. Membuka file JSON dan menyalin dua nilai

1. Buka folder **Downloads**. Cari file `.json` yang baru (namanya mirip `expends-bot-xxxxx-1a2b3c.json`).
2. **Windows:** klik-kanan file → **Open with** → **Notepad**. **Mac:** klik-kanan file → **Open With** → **TextEdit**. (Di HP, lakukan langkah ini lewat komputer.)
3. Kamu akan melihat teks seperti ini (sebagian):
   ```
   "client_email": "expends-bot-robot@expends-bot-xxxxx.iam.gserviceaccount.com",
   "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...banyak teks...\n-----END PRIVATE KEY-----\n",
   ```
4. **client_email:** blok tulisan di dalam tanda kutip setelah `"client_email":`, **tanpa tanda kutipnya**, lalu salin ke Catatan dengan judul `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
5. **private_key:** blok **seluruh tulisan di dalam tanda kutip** setelah `"private_key":`. Mulai dari `-----BEGIN PRIVATE KEY-----` sampai `-----END PRIVATE KEY-----\n`. Salin ke Catatan dengan judul `GOOGLE_PRIVATE_KEY`.
   - Biarkan tulisan `\n` apa adanya (huruf garis-miring dan n). **Jangan** menekan Enter dan jangan menghapusnya.
   - Pastikan semuanya satu baris panjang.

### F. Memberi robot izin Editor di Google Sheets

1. Kembali ke tab browser berisi spreadsheet **Expends Bot Database**.
2. Klik tombol hijau/biru **Share** (Bagikan) di pojok kanan atas.
3. Di kolom **Add people, groups…** tempel **email robot** (`GOOGLE_SERVICE_ACCOUNT_EMAIL` dari Catatan).
4. Di kotak peran di sebelah kanan pastikan tertulis **Editor** (bukan Viewer).
5. **Hapus centang** pada **Notify people** (Beri tahu orang), karena robot tidak punya kotak surat.
6. Klik **Share** (atau **Send**). Kalau muncul peringatan tentang alamat di luar organisasi, klik **Share anyway**.

> Kalau langkah F terlewat, bot akan mengeluh "PERMISSION_DENIED" atau "403".

---

## Bab 6. Langkah 5: Mengunggah Kode ke GitHub (tanpa install apa pun)

GitHub adalah "Google Drive untuk kode". Vercel akan mengambil kodemu dari sana.

1. Cari file **`expends-bot.zip`** yang kamu unduh dari Claude. **Klik-kanan** → **Extract All…** (Windows) atau **klik-ganda** (Mac). Terbentuk folder **`expends-bot`**.
2. Buka folder `expends-bot`. Isinya: folder `api`, `src`, `test`, dan file `package.json`, `vercel.json`, `README.md`, `.env.example`, `.gitignore`. (Di Mac, file berawalan titik tersembunyi. Tekan **Cmd + Shift + titik** untuk menampilkannya.)
3. Buka tab baru, ketik `github.com`, tekan **Enter**. Klik **Sign up** dan buat akun (email, kata sandi, username), lalu verifikasi emailmu. Kalau sudah punya akun, klik **Sign in**.
4. Klik tanda **+** di pojok kanan atas → **New repository**.
5. **Repository name:** ketik `expends-bot`.
6. Pilih **Public**. (Aman: kunci rahasiamu tidak ada di dalam kode, semuanya disimpan di Vercel.)
7. **Jangan** centang apa pun di bagian "Initialize this repository".
8. Klik tombol hijau **Create repository**.
9. Di halaman berikutnya, cari tulisan **"uploading an existing file"** (tautan biru kecil di tengah halaman). Klik.
10. Buka **folder `expends-bot`** di komputermu, **pilih semua isinya** (Ctrl+A atau Cmd+A), lalu **tarik (drag)** ke kotak "Drag files here" di GitHub. Tunggu sampai semua file dan folder (`api`, `src`, `test`) muncul di daftar. Pakai **Google Chrome** atau Edge, karena Safari kadang tidak mau menerima folder.
11. Gulir ke bawah, klik tombol hijau **Commit changes**.
12. Pastikan halaman repository sekarang menampilkan folder `api`, `src`, `test` dan file `package.json`, `vercel.json`. Kalau folder `api` tidak tampak, ulangi langkah 9–11 dengan menarik foldernya.

> ⚠️ **JANGAN PERNAH** mengunggah file `.json` kunci dari Bab 5 ke GitHub.

---

## Bab 7. Langkah 6: Menjalankan Bot di Vercel (Gratis)

1. Buka tab baru, ketik `vercel.com`, tekan **Enter**.
2. Klik **Sign Up**. Pilih paket **Hobby** (gratis) dan isi nama kalau diminta. Lalu klik **Continue with GitHub**.
3. GitHub meminta izin. Klik **Authorize Vercel**.
4. Di dashboard, klik **Add New…** → **Project**.
5. Di daftar *Import Git Repository*, cari **expends-bot**. Kalau belum muncul, klik **Adjust GitHub App Permissions**, pilih repository `expends-bot`, **Save**, lalu kembali. Klik tombol **Import** di sebelahnya.
6. Di bagian **Framework Preset** biarkan **Other**. **Jangan ubah** Build Command atau Output Directory.
7. Klik panah di sebelah tulisan **Environment Variables** supaya terbuka.
8. Isi **7 variabel** berikut **satu per satu**. Untuk tiap variabel: klik kotak **Key** (nama), ketik nama persis, klik kotak **Value**, tempel nilai dari Catatanmu, lalu klik **Add**.

| Key (nama persis) | Value (isi dari Catatan) |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token dari BotFather |
| `GEMINI_API_KEY` | kunci `AIza...` |
| `GOOGLE_SHEET_ID` | ID panjang dari alamat spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | email robot (`...iam.gserviceaccount.com`) |
| `GOOGLE_PRIVATE_KEY` | isi `private_key` (lihat peringatan di bawah) |
| `ADMIN_TELEGRAM_ID` | angka ID Telegram kamu |
| `TELEGRAM_WEBHOOK_SECRET` | kata sandi rahasia buatanmu |

**Opsional** (kalau mau mengubah zona waktu): `BOT_TZ` = `Asia/Makassar` (WITA, bawaan), `Asia/Jakarta` (WIB), atau `Asia/Jayapura` (WIT). Tanpa variabel ini bot memakai WITA.

9. ⚠️ **Peringatan khusus `GOOGLE_PRIVATE_KEY`:**
   - Tempel **seluruh** teks dari `-----BEGIN PRIVATE KEY-----` sampai `-----END PRIVATE KEY-----\n`, **dalam satu baris**, dengan tulisan `\n` **apa adanya**.
   - Boleh dengan atau tanpa tanda kutip di awal-akhir. Bot menanganinya.
   - **Jangan** menekan Enter di dalam kotak itu dan jangan menghapus bagian apa pun.
   - Pastikan awalnya tepat `-----BEGIN PRIVATE KEY-----` (5 tanda minus) dan tidak ada spasi di depannya.
10. Setelah ketujuh variabel tampil di daftar, klik tombol **Deploy**.
11. Tunggu sekitar 30–90 detik sampai muncul layar **"Congratulations!"** dengan konfeti. Klik **Continue to Dashboard**.
12. Di dashboard, lihat bagian **Domains**. Ada alamat seperti `expends-bot-abcd.vercel.app`. **Salin alamat itu tanpa `https://`** ke Catatan dengan judul `DOMAIN_VERCEL`.

> **Kalau kamu mengubah Environment Variable di kemudian hari:** buka Project → tab **Deployments** → klik titik tiga (⋯) pada deployment paling atas → **Redeploy**. Perubahan variabel baru berlaku setelah redeploy.

---

## Bab 8. Langkah 7: Menghubungkan Telegram ke Vercel (Setting Webhook)

"Webhook" = memberi tahu Telegram **alamat rumah botmu**, supaya setiap ada pesan masuk Telegram mengantarnya ke sana.

1. Buka Catatanmu. Siapkan tiga nilai: **TOKEN**, **DOMAIN_VERCEL**, **TELEGRAM_WEBHOOK_SECRET**.
2. Di Catatan (belum di browser), susun alamat ini, dengan mengganti tiga bagian yang diapit `< >` (hapus juga tanda `< >`-nya):

   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN_VERCEL>/api/webhook&secret_token=<SECRET>&max_connections=1
   ```

   Contoh bentuk akhirnya (angka-angkanya cuma contoh):

   ```
   https://api.telegram.org/bot123456789:AAHdqTcvCH1vGW/setWebhook?url=https://expends-bot-abcd.vercel.app/api/webhook&secret_token=Kx9mQ2vT7pLw3NzR8bYd5HsJ&max_connections=1
   ```

   Perhatikan: setelah `bot` langsung diikuti token **tanpa spasi**.
3. Salin seluruh alamat itu. Buka **tab baru** di browser, klik kolom alamat, tempel, tekan **Enter**.
4. Kalau berhasil, layar menampilkan tulisan seperti ini:

   ```
   {"ok":true,"result":true,"description":"Webhook was set"}
   ```

   Tanda sukses = **`{"ok":true`** di awal. Selesai! 🎉
5. (Opsional, untuk memastikan) Buka alamat ini di tab baru, ganti `<TOKEN>`:
   `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
   Pastikan `url`-nya benar dan **tidak ada** tulisan `last_error_message`. (`pending_update_count` sebaiknya 0.)

---

## Bab 9. Panduan Penggunaan Semua Fitur & Cara Tes Bot

### Tes pertama (sebagai Admin)

1. Buka Telegram, cari bot-mu (`@Expendsbot` atau username yang kamu buat), ketuk **Start**.
2. Bot menyapa, menampilkan bantuan, lalu bertanya target budget. Ketuk salah satu tombol (**Rp 3.000.000 / 5.000.000 / 10.000.000**) **atau** ketik angka bebas seperti `4,5jt`.
3. Buka spreadsheet. Tab `Config_Users` sekarang berisi barismu dengan Role **Admin**, dan tab `_State` berisi barismu juga. Itu bukti bot sudah tersambung ke Google Sheets. ✅

### Mencatat lewat teks

Ketik satu per satu, tunggu bot membalas:

| Kamu ketik | Hasil |
|---|---|
| `kopi 20rb` | Title **Kopi**, Rp 20.000, kategori Makanan & Minuman |
| `bayar parkir 5rb` | Title **Parkir**, deskripsi dikosongkan (tidak ada rincian) |
| `kemarin bensin 50rb` | Tanggal otomatis jadi **kemarin** |
| `beli kopi 20rb dan bensin 50rb` | **2 transaksi** sekaligus, tiap transaksi punya tombolnya sendiri |
| `makan di KFC 78rb pakai QRIS` | Metode bayar **QRIS** |
| `service motor 300rb di luar budget` | Ditandai **di luar budget** (tidak ikut menghitung persen budget) |

Di setiap balasan "✅ Tercatat" ada dua tombol:
- **🗑️ Hapus**: transaksi ditandai `DELETED` (tidak hilang dari sheet, hanya tidak dihitung).
- **🚫 Di Luar Budget**: mengubah `Hitung_Budget` jadi `FALSE` dan menghitung ulang budget.

Di bawah balasan selalu ada ringkasan seperti `📊 Terpakai: 12% (Rp 540.000 / Rp 4.500.000)`. Pada 75%, 90%, dan 100%, bot memberi peringatan khusus **satu kali** per bulan. Kalau persen budget naik jauh lebih cepat daripada jalannya bulan, muncul peringatan **🔥 burn rate**.

### Voice note

Tekan dan tahan ikon mikrofon di Telegram, ucapkan *"tadi pagi beli kopi dua puluh ribu"*, lepas untuk mengirim. Bot memperlakukannya persis seperti teks. (Maks 60 detik.)

### Foto struk (patungan / catat sebagian)

1. Kirim foto struk sebagai **foto**. Pastikan terang, tegak, dan tulisannya jelas.
2. Bot membalas daftar bernomor `1. … 2. … 3. …` beserta subtotal, pajak, dan total.
3. Pilih salah satu:
   - Ketuk **✅ Simpan Semua**, atau
   - Ketik nomor yang kamu bayar, misalnya `1, 3` atau rentang `1-3`, atau
   - Ketik nama item, misalnya `ayam dan nasi`.
4. Bot menghitung ulang total itemmu **plus bagian pajak/diskon yang proporsional**, lalu menyimpan satu transaksi.
5. Teks yang bukan nomor/nama item (misalnya `kopi 20rb`) dianggap transaksi baru biasa. Pilihan struk berlaku **30 menit**.

### Reply-to-Edit (koreksi lewat balasan)

Tekan dan tahan pesan **"✅ Tercatat"** dari bot → pilih **Reply** (Balas) → ketik koreksi, misalnya:
- `salah, harusnya 78rb`
- `ganti tanggal ke kemarin`
- `kategori Hiburan`

Baris di Google Sheets **diperbarui** (tidak membuat baris baru). Kalau bot tidak bisa membaca ID dari pesan yang kamu balas, dia mengedit **transaksi aktif terakhirmu**.

### Daftar perintah (/)

| Perintah | Fungsi |
|---|---|
| `/start` | Sapaan, bantuan, dan setup target budget |
| `/setbudget 5jt` | Ubah target bulanan (bisa `4.500.000` atau `4,5jt`) |
| `/budget` | Sisa anggaran, persen terpakai, dan **batas aman per hari** |
| `/laporan` | Ringkasan bulan ini + grafik pie + analisis singkat dari AI |
| `/undo` | Menghapus transaksi **terakhir milikmu** |
| `/cari kopi` | Mencari riwayat berdasarkan Title/Deskripsi (10 terbaru) |
| `/ekspor` | Mengirim file CSV pengeluaran bulan ini |
| `/sheet` | Tombol langsung ke Google Sheets + total hari ini |
| `/invite 123456789 Rina` | (**Admin**) menambah anggota keluarga |
| `/keluarga` | Daftar anggota + kontribusi bulan ini |

### Menambah anggota keluarga

1. Minta anggota keluarga membuka `@userinfobot` dan memberimu **angka Id**-nya.
2. Kamu (Admin) ketik: `/invite 123456789 Rina` (ganti dengan ID dan nama aslinya).
3. Minta dia membuka botmu lalu menekan **Start**.
4. Sejak itu semua anggota berada di **satu kolam budget**. Target budget memakai **target milik Admin**, dan hanya Admin yang bisa mengubahnya. Peringatan 75%/90%/100% dikirim ke **semua anggota**.
5. Mau dia bisa melihat spreadsheet-nya? Bagikan sendiri lewat tombol **Share** di Google Sheets dengan email Google-nya (peran **Viewer** cukup).

### Kategori dan limit

Ubah tab `Kategori` kapan saja. Bot langsung memakai daftar terbaru dan mengisi `Limit_Opsional` sebagai peringatan per kategori.

### Menjalankan tes otomatis (opsional, untuk yang punya Node.js)

Di komputer yang sudah terpasang Node.js 22, buka terminal di folder proyek lalu jalankan `npm test`. Ada 26 tes yang memakai Google Sheets/Gemini/Telegram *palsu*. Tes ini tidak membutuhkan internet maupun kunci asli.

---

## Bab 10. Solusi Jika Bot Tidak Merespons (Troubleshooting Pemula)

### Cara melihat log error di Vercel (langkah paling penting)

1. Buka `vercel.com` → klik proyek **expends-bot**.
2. Klik tab **Logs** di bagian atas.
3. Kirim pesan ke botmu, lalu lihat baris yang baru muncul di Logs (kalau kosong, tekan tombol refresh). Cari tulisan merah atau kata **Error**. Pesan itu menjelaskan penyebabnya.

### Penyebab paling sering

| Gejala / pesan | Penyebab | Cara memperbaiki |
|---|---|---|
| Bot diam total, `getWebhookInfo` berisi `last_error_message: "401 Unauthorized"` | `secret_token` di alamat setWebhook **berbeda** dengan `TELEGRAM_WEBHOOK_SECRET` di Vercel, **atau** Vercel *Deployment Protection* menyala | Samakan persis, lalu jalankan ulang Bab 8. Cek juga **Settings → Deployment Protection**, matikan **Vercel Authentication** untuk Production |
| `last_error_message: "404"` | Alamat webhook salah | Pastikan berakhiran `/api/webhook` dan domain benar |
| Bot membalas "kamu belum terdaftar" padahal itu kamu | `ADMIN_TELEGRAM_ID` salah (mis. memakai ID bot, bukan ID-mu) atau ada spasi | Ambil ulang ID dari `@userinfobot`, perbarui variabel, lalu **Redeploy** |
| Log: `PERMISSION_DENIED` / `403` / "The caller does not have permission" | Spreadsheet belum di-**Share** ke email robot, atau Google Sheets API belum **Enable** | Ulangi Bab 5 langkah F dan B |
| Log: `Unable to parse range` / `400` | Nama tab salah ketik (harus `Transaksi`, `Config_Users`, `Kategori`, `_State`) | Cocokkan nama tab **persis** |
| Log: `error:1E08010C:DECODER routines::unsupported` atau `Login Google gagal` | `GOOGLE_PRIVATE_KEY` terpotong, salah salin, atau email robot salah | Salin ulang `private_key` utuh dari file JSON (Bab 5 E) dan `client_email`, lalu **Redeploy** |
| Log: `Gemini 400`/`403` "API key not valid" | Kunci Gemini salah/kedaluwarsa | Buat ulang di `aistudio.google.com/apikey`, perbarui di Vercel, **Redeploy** |
| Bot membalas "Gemini 429" | Kuota gratis Gemini habis sementara | Tunggu beberapa menit |
| Bot membalas "Kuota Google Sheets habis sementara (429)" | Terlalu banyak permintaan Sheets dalam satu menit | Tunggu 1 menit |
| Voice note dibalas "tidak menangkap transaksi" | Suara kurang jelas, atau format voice Telegram (Opus) tidak dikenali model | Ucapkan lebih jelas/lambat. Kalau selalu gagal, kirim lewat teks |
| Pesan balasan terlambat 3–10 detik | Normal: Vercel, Gemini, dan Sheets bekerja bergantian | Tidak perlu diperbaiki |
| Setelah mengubah Environment Variable tidak ada perubahan | Perubahan baru aktif setelah deploy ulang | **Deployments → ⋯ → Redeploy** |
| Dashboard `B3` selalu 0 padahal ada transaksi | `B1` bukan teks `yyyy-mm`, atau kolom **Status** bukan `ACTIVE` | Tempel ulang rumus `B1`, dan cek kolom M di tab Transaksi |
| Saat membuat kunci JSON muncul "Service account key creation is disabled" | Akun sekolah/kantor melarangnya | Pakai **Gmail pribadi** untuk Bab 5 |
| Tanggal transaksi jam 00.00–01.00 "mundur" sehari | Zona waktu bot ≠ zona waktumu | Atur `BOT_TZ` (Bab 7) lalu **Redeploy**, dan samakan Time zone di File → Settings pada spreadsheet |

### Hal teknis yang perlu kamu tahu

- **Anti-dobel:** bot menulis `Last_Update_ID` ke tab `_State` sebelum memanggil AI. Kalau Telegram mengulang kiriman yang sama, bot mengabaikannya. Konsekuensinya, jika proses gagal di tengah jalan, bot memberi tahu dan kamu perlu **mengirim ulang** pesannya (update yang sama tidak diproses dua kali).
- **Urutan pesan:** webhook memakai `max_connections=1` dan bot membalas Telegram **setelah** pekerjaan selesai, sehingga pesan diproses berurutan.
- **Hapus = tandai:** semua perhitungan hanya memakai baris `Status = ACTIVE`. Kamu boleh menghapus baris `DELETED` manual dari sheet kapan saja.
- **Satu pending per orang:** tab `_State` menyimpan satu konfirmasi/pilihan struk per pengguna. Memulai konfirmasi baru membuat tombol yang lama menjadi "kedaluwarsa". Pending otomatis kedaluwarsa dalam 30 menit.
- **Timestamp_Input** disimpan dalam waktu UTC (format ISO), sedangkan `Tanggal_Transaksi` memakai zona waktumu.
- **Yang belum teruji di dunia nyata:** rumus tab Dashboard, pembacaan ID dari pesan yang di-reply, dan pengenalan voice note Opus oleh Gemini. Bagian ini belum bisa dites di tempat pembuatan. Lakukan tes di Bab 9 pada hari pertama, dan laporkan kalau ada yang tidak jalan.
