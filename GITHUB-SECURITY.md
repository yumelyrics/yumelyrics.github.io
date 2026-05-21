# Keamanan GitHub Pages — YumeSubs

Checklist singkat supaya hosting GitHub tidak bocor dan repo aman.

## File yang wajib di root situs (deploy)

| File | Fungsi |
|------|--------|
| `404.html` | URL acak / typo → redirect ke `index.html` (tanpa halaman error GitHub) |
| `.nojekyll` | Matikan Jekyll; hindari path aneh & build otomatis |
| `robots.txt` | Sembunyikan `admin.html`, `inbox.html`, skrip `.cjs` dari Google |

## Yang paling penting (repo GitHub)

1. **Jangan commit secret** — `FIREBASE_PRIVATE_KEY`, `github_pat_`, API key hanya di **GitHub Actions Secrets** / Firebase Console, bukan di HTML/JS.
2. **Publish folder bersih** — GitHub Pages hanya boleh berisi file publik (HTML, `lagu/`, `stories/`, `resources/`, asset). Jangan ikut deploy:
   - `generate-*.cjs`, `firestore.rules`, `admin.html` kalau bisa dipisah (admin tetap perlu URL, tapi lindungi dengan login + rules).
3. **Repo private** (opsional, berbayar) — source tidak terbuka; Pages tetap bisa publik.
4. **Branch protection** pada `main` — wajib PR/review sebelum merge.
5. **Dependabot / Code scanning** — aktifkan di Settings → Security.
6. **Rotate token** — kalau PAT GitHub pernah ketaruh di chat/screenshot, buat token baru di GitHub → revoke yang lama.

## Batasan GitHub Pages (normal)

- Header `X-Frame-Options`, CSP ketat → butuh **Cloudflare** (gratis) di depan domain.
- HTTP 404 untuk URL palsu tetap 404 di Network tab (user biasa tidak lihat).
- Siapa pun yang tahu URL `admin.html` tetap bisa buka file — **keamanan asli = Firebase Auth + Firestore Rules** (sudah kamu pakai).

## Opsional (lebih kuat)

- **Cloudflare** di `yumelyrics.my.id`: proxy ON, SSL Full, Bot Fight Mode, cache.
- **Custom 404** sudah cukup untuk menyembunyikan branding GitHub dari pengunjung.

## Setelah upload

Tes:

- `https://yumelyrics.my.id/abc123` → harus ke beranda
- `https://yumelyrics.my.id/robots.txt` → terbaca
- `https://yumelyrics.my.id/admin.html` → tetap bisa dibuka (login tetap wajib), tapi tidak perlu muncul di Google lama-kelamaan
