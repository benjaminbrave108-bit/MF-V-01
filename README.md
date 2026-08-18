# MF-V-01 — Maliye/Finans Muhasebe

Çok kullanıcılı, sunucu tabanlı bir muhasebe uygulaması: kasa, gelir,
gider, mali notlar, hazırlanan raporlar, arşiv ve kullanıcı/erişim
yönetimi. Next.js uyumlu [vinext](https://github.com/cloudflare/vinext)
framework'ü (Vite üzerinde) ile [Drizzle ORM](https://orm.drizzle.team)
üzerinden **PostgreSQL**'e bağlanır; kendi sunucunuzda çalışacak şekilde
tasarlanmıştır (Cloudflare Workers/D1 kullanmaz).

> **Masaüstü (Electron) sürümü hakkında:** `desktop/` altındaki Electron
> uygulaması bilinçli olarak ayrı, dondurulmuş bir offline araç olarak
> bırakılmıştır ve bu README'nin kapsamı dışındadır. Ayrıntılar için
> `MF-V-01-ANA-PROMPT-1.0.8.md`'ye bakın.

## Mimari özeti

- **İstemci + sunucu**: `app/page.tsx` (tek sayfalık React arayüzü) ve
  `app/api/**/route.ts` (REST API uçları), vinext'in App Router benzeri
  yapısıyla tek bir Next.js projesinde bir arada.
- **Veritabanı**: PostgreSQL, şema `db/schema.ts`'de Drizzle ile tanımlı,
  migration'lar `drizzle/`'da.
- **Kimlik doğrulama**: `scrypt` ile şifre hash'leme, httpOnly oturum
  çerezi (`app/api/_lib/auth.ts`), kullanıcı bazlı sayfa/işlem izinleri.
- **Güvenlik**: sunucu taraflı yetki denetimi, ardışık başarısız giriş
  denemelerinde IP engelleme + hesap kilitleme (admin onayı gerektirir),
  Zod ile girdi doğrulama, CSRF origin kontrolü (`app/api/_lib/http.ts`).
- **Prod sunucu**: `server.mjs` — asıl sunmayı (statik dosyalar, SSR, API
  yönlendirme) vinext'in kendi `startProdServer`'ına devreder; üstüne
  migration çalıştırma ve süresi dolmuş oturumları temizleme ekler.

## Gereksinimler

- Node.js `>=22.13.0`
- PostgreSQL 16+ (yerelde native servis olarak veya bir konteyner içinde
  çalışabilir; bu proje Docker'a bağımlı değildir)

## Kurulum

```bash
npm ci
cp .env.example .env.local
```

`.env.local` içindeki alanları doldurun (bkz. `.env.example`'daki
açıklamalar):

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | `postgres://kullanici:sifre@host:5432/veritabani` |
| `SESSION_COOKIE_SECURE` | Prod'da `true` (HTTPS zorunlu), yerel HTTP testte `false` |
| `SESSION_TTL_HOURS` | Oturum süresi (varsayılan 12) |
| `PGSSL` | Yönetilen/uzak Postgres TLS istiyorsa `require` |
| `PGPOOL_MAX` | Node süreci başına bağlantı havuzu üst sınırı |
| `PORT`, `HOST` | `server.mjs`'in dinleyeceği adres |
| `VINEXT_TRUST_PROXY`, `TRUSTED_PROXY_COUNT` | Reverse proxy arkasındaysanız `1`+ yapın (aşağıya bakın) |
| `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_USER_PASSWORD` | `npm run db:seed` için — sabit varsayılan yok, siz belirlersiniz |

## Veritabanı: migration ve seed

```bash
npm run db:generate   # şema değiştiğinde yeni migration üretir
npm run db:migrate    # migration'ları uygular
npm run db:seed       # SEED_*_PASSWORD ile admin/manager/user hesaplarını oluşturur
```

`server.mjs` da açılışta migration'ları otomatik uygular; `db:migrate`'i
elle çalıştırmak yalnız migration üretiminden hemen sonra doğrulamak
istediğinizde gerekir.

## Geliştirme

```bash
npm run dev
```

Vite/vinext geliştirme sunucusunu başlatır (varsayılan `http://localhost:5173`).
`.env.local` otomatik yüklenir.

## Prod dağıtım

```bash
npm run build
node --env-file=.env.local server.mjs
```

`server.mjs` yalnız `127.0.0.1` üzerinde dinlemek üzere tasarlanmıştır —
**TLS sonlandırma, güvenlik başlıkları (CSP, HSTS, X-Frame-Options),
istek gövdesi boyut sınırı ve genel erişim için önünde bir reverse proxy
(nginx/caddy) çalıştırmanız gerekir.** Örnek systemd/pm2 yapılandırmaları
için `deploy/` klasörüne bakın.

Reverse proxy arkasındaysanız `.env.local`'da `VINEXT_TRUST_PROXY=1` ve
`TRUSTED_PROXY_COUNT` değerini proxy sayınıza göre ayarlayın — aksi halde
giriş denemesi hız sınırlama ve IP engelleme özellikleri gerçek istemci
IP'sini göremez.

## Test

```bash
npm test
```

Sırasıyla: tip kontrolü (`tsc --noEmit`), prod derlemesi, ardından
`tests/*.test.mjs` (render/varlık testleri + `tests/api.test.mjs`'deki
API entegrasyon testleri). API testleri **gerçek `DATABASE_URL`
veritabanına karşı** çalışır — bu ortamda ayrı bir test veritabanı
oluşturmak için gereken `CREATEDB` yetkisi mevcut değildi, bu yüzden
testler oluşturdukları veriyi açıkça işaretleyip kendi sonlarında
temizler. Prod verisi olan bir veritabanına karşı `npm test`
çalıştırmadan önce bunu göz önünde bulundurun.

## Yedekleme ve geri yükleme

İki yol var:

1. **Uygulama içinden** (`Ayarlar → Veri (Database) Ayarları`, admin):
   kayıt/arşiv/not/rapor verisini JSON olarak dışa aktarır, aynı biçimden
   içe aktarır (mevcut mali veriyi değiştirir; kullanıcı hesapları
   etkilenmez), veya tüm mali veriyi siler (iki adımlı şifre onaylı).
2. **`pg_dump`** ile tam veritabanı yedeği (kullanıcılar dahil):
   ```bash
   pg_dump "$DATABASE_URL" > yedek.sql
   ```

## Proje yapısı (özet)

- `app/page.tsx` — tek dosyalık React arayüzü
- `app/api/**/route.ts` — REST API uçları
- `app/api/_lib/` — paylaşılan sunucu yardımcıları (auth, validate, http, rate-limit, security)
- `db/schema.ts`, `drizzle/` — Postgres şeması ve migration'lar
- `server.mjs` — prod giriş noktası
- `desktop/` — ayrı, dondurulmuş Electron uygulaması (bu README'nin kapsamı dışında)
- `tests/` — `node --test` ile çalışan testler

## Diğer belgeler

- `MF-V-01-ANA-PROMPT-1.0.8.md` — masaüstü sürümünün orijinal ürün
  spesifikasyonu ve web sürümüne dair durum notu
- `MF-V-01-DUZELTME-PLANI-1.0.9.md` — bu göç ve sonrasındaki düzeltmelerin
  planı (tamamlanan/kalan maddeler için doğrulama kapıları içerir)
