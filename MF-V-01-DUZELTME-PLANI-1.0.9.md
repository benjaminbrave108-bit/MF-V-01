# MF-V-01 — Düzeltme Planı (1.0.8 → 1.0.9)

Hedef dağıtım biçimi: **Sunucu üzerinde Node.js self-host** (Electron/masaüstü dağıtımı bu planın kapsamı dışındadır).
Bu belge, 2026-08-17 tarihli kod incelemesinde tespit edilen tüm sorunları kapsar. Fazlar sıralıdır:
bir faz tamamlanıp doğrulanmadan sonrakine geçilmemelidir.

Önem dereceleri: 🔴 Kritik (bunsuz canlıya çıkılmaz) · 🟠 Yüksek · 🟡 Orta · 🔵 Düşük/temizlik

---

## Faz 0 — Sunucuda Ayağa Kaldırma

### 0.1 🔴 Node.js sunucu adaptörü (`server.mjs`)

**Sorun:** `npm start` (`vinext start`) workerd tabanlıdır; `process.env.DATABASE_URL` okunamaz
(`db/index.ts:8`) ve `pg` worker paketine dahil edilmez (`vite.config.ts` → `ssr.external`).
Uygulama bu yolla sunucuda çalışmaz.

**Çözüm:** `desktop/main.cjs:75-128` içindeki HTTP adaptörü Electron'dan bağımsız bir
`server.mjs` dosyasına taşı:

- `dist/server/index.js`'i `pathToFileURL` ile import et, `worker.default.fetch(request, env, ctx)` çağır.
- `env.ASSETS.fetch` binding'ini `dist/client` klasöründen dosya sunacak şekilde uygula
  (mevcut `resolveClientAsset` path-traversal korumasını aynen koru).
- `waitUntil` ve `passThroughOnException` içeren ExecutionContext ver (boş obje beyaz sayfa üretir).
- `PORT` (varsayılan 8080) ve `HOST` (varsayılan 127.0.0.1; reverse proxy arkasında bırak) env'den okunsun.
- `SIGTERM`/`SIGINT` ile graceful shutdown: önce `server.close()`, sonra `pool.end()`.

**Kabul ölçütü:** `npm run build && node server.mjs` sonrası `curl` ile
login → bootstrap → kayıt ekleme zinciri uçtan uca çalışıyor.

### 0.2 🔴 Migration çalıştırma adımı

**Sorun:** Prod sunucuda tabloları oluşturacak tanımlı bir adım yok; `drizzle-kit` devDependency.

**Çözüm (iki seçenekten biri):**
- a) Deploy script'ine `npm run db:migrate` adımı ekle (drizzle-kit'i sunucuya kur), **veya**
- b) `server.mjs` açılışında `drizzle-orm/node-postgres/migrator`'ın `migrate()` fonksiyonunu
  `drizzle/` klasörüyle programatik çalıştır (tercih edilen; deploy tek komut kalır).

**Kabul ölçütü:** Boş bir Postgres veritabanına karşı ilk açılış hatasız; `_journal.json`'daki
4 migration uygulanmış.

### 0.3 🔴 Bağlantı havuzu dayanıklılığı (`db/index.ts`)

**Sorun:** node-postgres havuzunda `error` olayı dinlenmiyor → boştaki bir bağlantının kopması
(DB restart, ağ kesintisi) **tüm Node sürecini çökertir**. SSL ve havuz limitleri yapılandırılmamış.

**Çözüm:** `drizzle()`'a hazır `Pool` ver:

```ts
import { Pool } from "pg";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PGPOOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: true } : undefined,
});
pool.on("error", (err) => console.error("[pg] idle client error", err));
cached = drizzle(pool, { schema });
```

`.env.example`'a `PGSSL` ve `PGPOOL_MAX` ekle.

### 0.4 🟠 Sağlık ucu ve süreç yönetimi

- `GET /api/health` ekle: `SELECT 1` başarılıysa `{ ok: true }`, değilse 503. Auth **gerektirmez**,
  veri sızdırmaz.
- systemd unit veya pm2 yapılandırması yaz (`Restart=always`, `EnvironmentFile=`).
- Reverse proxy (nginx/caddy) arkasında TLS zorunlu; uygulama yalnız 127.0.0.1 dinler.

### 0.5 🟡 Seed'in güvenli hale getirilmesi (`scripts/seed-users.mjs`)

**Sorun:** `admin/admin123`, `manager/manager123`, `user/user123` şifreleri repoda düz metin.

**Çözüm:** Sabit hesap listesini kaldır; şifreleri `SEED_ADMIN_PASSWORD` vb. env değişkenlerinden
oku, env yoksa **hata verip çık** (rastgele şifre üretip stdout'a basmak da kabul). Mevcut upsert
mantığı korunur. README'den ve bu plandan sonra hiçbir belgeye gerçek şifre yazılmaz.

---

## Faz 1 — Güvenlik Tabanı

### 1.1 🔴 Sunucu tarafı yetki denetimi

**Sorun:** `permissions` yalnız React menüsünü gizliyor. `requireSession` geçen herkes tüm veri
uçlarına tam erişimli: izinsiz kullanıcı `/api/bootstrap` ile tüm mali veriyi okur,
`/api/records`'a yazar, `/api/records/{id}`'yi siler.

**Çözüm:** `app/api/_lib/auth.ts`'e ekle:

```ts
export async function requirePermission(request: Request, page: Page) {
  const result = await requireSession(request);
  if ("response" in result) return result;
  if (result.user.isAdmin || result.user.permissions.includes(page)) return result;
  return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
}
```

Uygulama matrisi:

| Uç | Gerekli izin |
|---|---|
| `records` GET/POST, `records/[id]`, `records/import` | kaydın `kind` değerine göre `cash` / `income` / `expense` (GET'te `kind` paramı zorunlu yap veya izinli kind'lara filtrele) |
| `notes`, `notes/[id]` | `notes` |
| `prepared-reports`, `prepared-reports/[id]` | `reportBuilder` |
| `archive` | `archive` |
| `bootstrap` | oturum yeter; **ancak** her koleksiyon kullanıcının izinlerine göre filtrelenir (izinsiz bölümler boş/`undefined` döner) |
| `settings` PUT, `users`* | mevcut `requireAdmin` (değişmez) |

**Kabul ölçütü:** yalnız `cash` izinli test kullanıcısıyla `/api/bootstrap` çağrısında
`notes/preparedReports/archive` boş; `/api/notes` POST → 403.

### 1.2 🔴 Kaba kuvvet koruması

**Sorun:** `POST /api/auth/login` ve `POST /api/auth/verify-password` sınırsız deneme kabul ediyor.

**Çözüm:** Basit bellek-içi sayaç yeterli (tek Node süreci):
- Anahtar: `ip + username` (login) / `userId` (verify-password).
- 15 dakikada 5 başarısız deneme → o anahtar için 15 dk 429 `Retry-After`.
- Başarılı girişte sayaç sıfırlanır. Reverse proxy arkasında IP'yi `X-Forwarded-For`'un
  **ilk güvenilir** değerinden al (proxy sayısını env ile sabitle).

### 1.3 🔴 Kullanıcının kendi şifresini değiştirmesi

**Sorun:** Şifre değişimi yalnız admin'in `/api/users/[id]` yolundan mümkün; kullanıcı kendi
şifresini değiştiremiyor.

**Çözüm:** `PUT /api/profile/password` (yeni dosya): gövde `{ currentPassword, newPassword }`;
mevcut şifre `verifyPassword` ile doğrulanır, yeni şifre politikadan geçer (bkz. 1.4), hash'lenir,
**kullanıcının diğer tüm oturumları silinir** (aktif token hariç). UI'da Profil modalına
"Şifre Değiştir" alanı eklenir.

### 1.4 🟠 Şifre politikası

Tek yerde (`db/passwords.ts` yanına `validatePasswordPolicy`) uygula, hem `users` POST/PUT hem
1.3 ucu kullanır: en az 10 karakter, en az bir harf + bir rakam; kullanıcı adıyla aynı olamaz.
Hata mesajları üç dilde UI'da gösterilir.

### 1.5 🟠 API yanıtlarında önbellek kapatma

**Sorun:** Kimlik doğrulamalı JSON yanıtlarında `Cache-Control` yok; CDN/proxy arkasında bir
kullanıcının verisi başkasına servis edilebilir.

**Çözüm:** Tüm `/api/*` yanıtlarına `Cache-Control: private, no-store` ekle. Route sayısı fazla
olduğundan ortak bir `json(data, init?)` yardımcı fonksiyonu yazıp (`app/api/_lib/http.ts`)
`Response.json` çağrılarını onunla değiştir — 1.6'daki başlıklar da aynı yere eklenebilir.

### 1.6 🟠 Güvenlik başlıkları

HTML yanıtına (adaptör katmanında veya middleware ile) ekle:
- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`
  (data: → logo/avatar; inline style → typography CSS değişkenleri. Daha sıkısı UI değişikliği ister.)
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
  `X-Frame-Options: DENY`, (TLS arkasında) `Strict-Transport-Security: max-age=31536000`.
- Ucuz CSRF güçlendirmesi: durum değiştiren isteklerde `Origin` başlığı varsa beklenen origin ile
  karşılaştır, uyuşmuyorsa 403.

### 1.7 🟠 Boyut ve satır limitleri

- İstek gövdesi limiti: adaptörde toplam gövdeyi **1 MB** ile sınırla (aşımda 413).
- `settings.logo` ve `profile.avatar`: yalnız `data:image/(png|jpeg|webp|svg+xml);base64,` kabul et,
  çözülmüş boyut ≤ 512 KB.
- `records/import`: en fazla **2000 satır**/istek (aşımda 413 + üç dilli UI mesajı).

### 1.8 🟠 `xlsx` bağımlılığının kaldırılması

**Sorun:** `xlsx@0.18.5` — CVE-2023-30533 (prototype pollution), CVE-2024-22363 (ReDoS);
npm'deki sürüm yamasız ve kullanıcı dosyası parse ediyor.

**Çözüm:** Excel **içe aktarma ve dışa aktarmayı** ExcelJS'e taşı (rapor indirme zaten ExcelJS):
- Dışa: `XLSX.utils.json_to_sheet` → `worksheet.addRows` + `writeBuffer` + Blob indirme.
- İçe: `XLSX.read` → `workbook.xlsx.load(arrayBuffer)`; ilk sayfanın 1. satırı başlık kabul edilir,
  mevcut `get("Tarih","Date","Tarîx")` çoklu-başlık eşleme mantığı korunur.
- `package.json`'dan `xlsx` silinir; `.xls` (eski biçim) desteği bırakılıyorsa UI metni güncellenir
  (ExcelJS yalnız `.xlsx` okur).

---

## Faz 2 — Veri Doğruluğu ve Bütünlüğü

### 2.1 🔴 Kürtçe arayüzün kayıtlı veriyi değiştirmesi (veri bozulması)

**Sorun:** `app/page.tsx` RecordModal (≈2028-2041): dil `ku` iken form `localizeData()` ile
çevrilmiş değerlerle açılıyor ve Kaydet bu çevirileri **veritabanına yazıyor**. Kasa adı çevrilirse
`cashAccount` isim eşleşmesi kopar, bakiyeler değişir; TR/KU kullanıcıları arasında veri gidip gelir.

**Çözüm:**
- Formu **her zaman ham `base` değerleriyle** başlat (`language === "ku"` dalını sil).
- `localizeData`'yı ya tamamen kaldır (öneri: demo sözlüğü kalıntısıdır) ya da yalnız
  görüntüleme noktalarında bırak; kullanıcı girdisi hiçbir zaman çeviriden geçmez.

**Kabul ölçütü:** KU arayüzde bir kaydı açıp değiştirmeden kaydetmek DB satırını bayt bayt
aynı bırakır.

### 2.2 🔴 Excel içe aktarımında kasa bağlantısı

**Sorun:** İçe aktarılan satırlarda `cashAccount`/`listName` üretilmiyor (bu aynı zamanda
yakalanmamış bir TS tip hatası) ve `POST /api/records/import` fallback kasa atamıyor →
içe aktarılan gelir/gider kasa bakiyesinden sessizce dışlanıyor.

**Çözüm:**
- İstemci map'ine `cashAccount: String(get("Kasa","Cash Account","Qase") || "")` ve
  `listName: ""` ekle (tip hatası da kapanır).
- Import route'unda her satıra `cashAccount || fallbackKasaNameFor(kind)` uygula ve
  kullanılan her fallback ad için `ensureFallbackKasa` çağır (POST /records ile aynı davranış).

### 2.3 🔴 Dashboard muhasebe formülleri

**Sorun:** `income = Σ(income) + Σ(cash)` — kasa açılış bakiyesi "Toplam Gelir" sayılıyor;
`cashAccount`'suz gider "Toplam Gider"e girip kasa bakiyesini düşürmüyor → kartlar çelişiyor.

**Çözüm (karar gerekli, önerilen):**
- `Toplam Gelir = Σ(income)`, `Toplam Gider = Σ(expense)`, `Net = gelir − gider`.
- `Kasa Bakiyesi = Σ(cash) + Σ(income) − Σ(expense)` — 2.2 sonrası her kayıt bir kasaya bağlı
  olacağından `cashAccount≠""` filtresi kaldırılabilir.
- Kasa açılışının geliri artırması bilinçli bir işletme kuralıysa bu madde yerine mevcut formül
  ANA-PROMPT'a yazılarak belgelenir.

### 2.4 🔴 Para birimi tutarlılığı

**Sorun:** Formda TRY/EUR/USD seçilebiliyor ama `total()` birim ayrımsız topluyor; `money()` ve
ExcelJS rapor formatı (`'$ #,##0.00'`) her zaman USD gösteriyor.

**Çözüm (karar gerekli, önerilen basit yol):** Uygulamayı **tek para birimine** kilitle:
- `APP_CURRENCY` (varsayılan USD) ayarı `settings` tablosuna eklenir; `money()` ve Excel
  formatı bunu kullanır.
- Kayıt formundaki para birimi seçici kaldırılır; API `currency`'yi settings değerine sabitler.
- Çoklu para birimi gerçekten gerekiyorsa: `total()` birim bazında gruplar, UI birim başına ayrı
  toplam gösterir; karışık toplamlar hiçbir yerde tek sayıya indirgenmez.

### 2.5 🟠 Girdi doğrulama katmanı (Zod)

`zod` bağımlılığı ekle; `app/api/_lib/validate.ts` altında şemalar:

- `kind`: `z.enum(["cash","income","expense"])`
- `date`: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` + geçerli takvim günü kontrolü
- `amount`: `z.number().finite().min(0).max(999_999_999_999.99)`
- `currency`: 2.4 kararına göre sabit/enum
- `tags`: `z.array(z.string().max(64)).max(20)`; metin alanları `.max(...)` sınırlı
- `permissions`: `z.array(z.enum([...restrictablePages]))` (`users` POST/PUT)
- `status`: `z.enum(["important","urgent","pending","completed"])`, `relation` enum (notes)
- import: `z.array(recordSchema).min(1).max(2000)`

Tüm route gövdeleri `safeParse` ile doğrulanır; hata → 400 + alan listesi. Geçersiz `kind`'lı
kayıt artık **hiçbir yoldan** yazılamaz.

**Ek:** `PUT /api/records/[id]` eksik alanları `""`'a değil **eski değere** düşürmeli
(`payload.detail ?? old.detail` deseni tüm alanlara uygulanır).

### 2.6 🟠 Transaction'lar

`db.transaction()` ile atomik hale getir:
- `PUT /api/records/[id]`: güncelle + kasa adı cascade + arşiv kaydı (tek transaction).
- `DELETE /api/records/[id]`: sil + arşiv kaydı.
- `POST /api/records` ve import: kayıt + `ensureFallbackKasa`.

**Kabul ölçütü:** arşiv insert'i kasıtlı hata verecek şekilde test edildiğinde kayıt güncellemesi
de geri alınıyor.

### 2.7 🟠 Rapor kimliği sunucuda üretilsin

**Sorun:** `prepared_reports.id` istemciden geliyor; boşsa `Date.now()` — çakışma → ham 500.

**Çözüm:** `POST /api/prepared-reports` id'yi `crypto.randomUUID()` ile üretir, istemciden gelen
id yok sayılır. İstemci zaten yanıttaki `preparedReport`'u state'e koyuyor; ek değişiklik gerekmez.

### 2.8 🟠 Oturum temizliği ve sınırı

- `server.mjs` içinde saatlik zamanlayıcı: `DELETE FROM sessions WHERE expires_at < now()`.
- Girişte kullanıcının 10'dan eski oturumu varsa en eskileri sil (oturum enflasyonu önlenir).

### 2.9 🟡 Şema iyileştirmeleri (migration `0004`)

- `CREATE INDEX archive_at_idx ON archive (at DESC);`
- `ALTER TABLE records ADD CONSTRAINT records_kind_check CHECK (kind IN ('cash','income','expense'));`
  (2.5 sonrası mevcut veri temizlenmiş olmalı; migration öncesi
  `SELECT DISTINCT kind FROM records` ile doğrula.)
- `finance_notes.status` için benzer CHECK.

### 2.10 🟡 Hata yakalama ve loglama

Tüm route gövdelerini saran ortak `withErrorHandling` yardımcıyla: DB/beklenmeyen hata →
`console.error` (istek yolu + hata) ve istemciye ayrıntısız 500 JSON. Böylece "ham 500 + log yok"
deseni kapanır. `alert()` mesajları korunur; ileride toast'a geçiş Faz 3 konusu.

### 2.11 🟡 Küçük doğruluk düzeltmeleri

- `parseStoredDate`: geçersiz tarihte bugüne sessizce düşme — import'ta geçersiz tarihli satır
  **reddedilip** satır numarasıyla raporlanır.
- Mükerrer kayıt kontrolü import yoluna da eklenir (aynı gün+tutar+kasa+başlık → uyarı ve onay).
- Rapor indirme dosya adı: `title.replace(/[\\/:*?"<>|]/g, "-")`.
- Eşzamanlı düzenleme: `PUT /api/records/[id]` gövdesine istemcinin bildiği `updatedAt` eklenir;
  uyuşmazsa 409 → UI "kayıt başka kullanıcı tarafından değiştirildi" uyarısı (optimistic locking).

---

## Faz 3 — Eksik Özellikler (ANA-PROMPT uyumu)

### 3.1 🟠 İlk açılış dil seçim ekranı

`LanguageSetup` bileşeni yazılmış ama hiç çağrılmıyor. Akış: `localStorage("mf-language")` yoksa
login öncesi `LanguageSetup` gösterilir; seçim localStorage'a yazılır ve login ekranına uygulanır.

### 3.2 🟠 Dil tercihinin kalıcılığı (kullanıcı bazlı)

Üst çubuktaki seçici yalnız state değiştiriyor; yeniden açılışta `tr`'ye dönülüyor. Ayrıca
`settings.language` globaldir. Çözüm: `users` tablosuna `language` kolonu (migration `0004`'e
eklenebilir) + `PUT /api/profile`'a `language` alanı; oturum açınca kullanıcının dili uygulanır.
`settings.language` yalnız login-öncesi varsayılan olarak kalır.

### 3.3 🟠 Veri (Database) Ayarları bölümü

ANA-PROMPT'ta tanımlı, kodda hiç yok. Ayarlar sayfasına (admin) üçüncü panel:
- **Dışa aktar:** `GET /api/database/export` (admin) → tüm tabloların JSON paketi
  (`{ version, exportedAt, records, archive, notes, preparedReports, settings, users(şifresiz) }`).
- **İçe aktar:** `POST /api/database/import` (admin) → aynı biçimi Zod ile doğrula,
  transaction içinde mevcut mali verileri değiştir. Kullanıcı/şifre verisi **içe aktarılmaz**.
- **Sil:** `POST /api/database/clear` (admin) → **iki ayrı onay** (ikincisi şifre doğrulamalı,
  mevcut `DeleteConfirmModal` deseni) → transaction içinde `records/archive/finance_notes/
  prepared_reports` temizlenir; `users` ve `settings` korunur.

### 3.4 🟡 ANA-PROMPT güncellemesi

Plan uygulandıkça: dağıtım biçimi (sunucu), `standalone-installer.nsi` referansı, "rastgele port"
ifadesi ve masaüstü maddeleri güncellenir/kaldırılır. Kürtçe metin eklerken mevcut kural
(belirsizse proje sahibine sor) geçerli.

---

## Faz 4 — Kod Kalitesi, Test, Dokümantasyon

### 4.1 🟠 Tip kontrolünün zorunlu hale getirilmesi

`package.json`: `"typecheck": "tsc --noEmit"`; `npm test`'in başına eklenir. Mevcut bilinen hata
(import map'inde eksik `cashAccount`/`listName`) 2.2 ile kapanır; typecheck'in bulacağı diğer
hatalar da bu maddede giderilir.

### 4.2 🟠 API entegrasyon testleri

`tests/api.test.mjs` (node --test): worker `fetch` arayüzüne doğrudan `Request` atarak —
- login (doğru/yanlış şifre, rate limit), oturum süresi,
- izin matrisi (1.1'deki tablo birebir: izinli 200 / izinsiz 403),
- kayıt CRUD + arşiv üretimi + fallback kasa,
- import (`cashAccount` ataması, satır limiti, geçersiz tarih reddi),
- 2.3 formüllerinin birim testleri (`total`, bakiye hesabı — saf fonksiyona çıkarılınca).
Test DB'si: `DATABASE_URL_TEST` ile ayrı şema/veritabanı; her koşuda migrate + truncate.

### 4.3 🟡 `app/page.tsx` ayrıştırması

4007 satırlık dosya en az şu modüllere bölünür: `app/components/` altında Login, Dashboard,
Records(+RecordModal), Notes, Archive, ReportBuilder(+Modal+Excel), Users(+Modal), Settings;
`app/lib/i18n.ts` (`tx` + metinler), `app/lib/finance.ts` (`total`, `money`, tarih yardımcıları),
`app/lib/types.ts` (API `_lib/types.ts` ile tekilleştirilir). Davranış değişikliği yok; 4.1+4.2
yeşilken yapılır.

### 4.4 🔵 Ölü kod ve dosya temizliği

- Kökteki `main.cjs` silinir (`desktop/main.cjs`'in birebir kopyası; `package.json.main` zaten
  desktop'u gösteriyor).
- `build/mf-v-01-installer.nsi` (1.0.7'de kalmış, electron-builder kullanmıyor) silinir veya
  arşivlenir.
- `localizeData` demo sözlüğü ve `seed` boş dizisi kaldırılır (2.1 ile birlikte).
- Sunucu dağıtımı netleşince `electron`, `electron-builder`, `desktop:dist` bağımlılık/script'leri
  ayrı bir `desktop` branch'ine taşınır veya kaldırılır.

### 4.5 🔵 README yeniden yazımı

vinext-starter metni yerine gerçek mimari: kurulum (`npm ci`), `.env.local` alanları, migrate +
seed, `server.mjs` ile çalıştırma, reverse proxy/TLS notu, yedekleme (3.3 export + `pg_dump`),
test komutları. D1/`examples/d1` gibi geçersiz referanslar silinir.

---

## Uygulama Sırası ve Doğrulama Kapıları

| Kapı | İçerik | Çıkış ölçütü |
|---|---|---|
| K0 | 0.1–0.5 | Temiz Linux sunucu + boş Postgres'te tek komutla ayağa kalkıyor; health 200; login zinciri çalışıyor |
| K1 | 1.1–1.8 | İzin matrisi testleri yeşil; 6. yanlış şifre 429; `npm ls xlsx` boş |
| K2 | 2.1–2.11 | KU kayıt testi baytbayt eşit; import edilen gider kasa bakiyesini düşürüyor; transaction geri alma testi yeşil |
| K3 | 3.1–3.4 | Dil ekranı + kalıcılık; export→clear→import döngüsü veri kaybı olmadan tamamlanıyor |
| K4 | 4.1–4.5 | `npm run typecheck` ve tüm testler CI'da zorunlu ve yeşil |

## Karar Gerektiren Maddeler (proje sahibi onayı)

1. **2.3** — Kasa kayıtları "Toplam Gelir"e dahil mi? (Öneri: hayır.)
2. **2.4** — Tek para birimi mi, birim-bazlı toplamlar mı? (Öneri: tek birim, `settings`'ten.)
3. **1.8** — Eski `.xls` biçimi desteklenmeye devam edecek mi? (ExcelJS yalnız `.xlsx` okur.)
4. **4.4** — Masaüstü (Electron) dağıtımı tamamen rafa mı kalkıyor, ayrı branch'te mi yaşayacak?

## Kapsam Dışı (bilinçli ertelenen)

- Cloudflare/Sites üzerinde çalıştırma (pg → HTTP sürücü geçişi ister; ayrı proje).
- Çoklu para birimi kur dönüşümü, muhasebe dönem kapanışı.
- `alert()` → toast bildirim sistemi; erişilebilirlik denetimi (ayrı iyileştirme turu).
- PGlite/SQLite gömülü veritabanı (yalnız masaüstü senaryosu için anlamlı).
