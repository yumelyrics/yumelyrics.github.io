# Deploy Firestore Rules (hardened)

## Langkah

1. Buka [Firebase Console](https://console.firebase.google.com) → proyek **yumesubs7**
2. **Firestore Database** → tab **Rules**
3. Salin seluruh isi file `firestore.rules` dari folder Downloads
4. **Publish**
5. Tunggu ~1 menit

## Perubahan (audit)

| Area | Perubahan |
|------|-----------|
| `online_users` | Hanya session ID format `u_...` + field `ts`/`page` |
| `banned_users` | Baca: admin atau user sendiri |
| `notifications` | Create: admin atau login + `fromUid` cocok |
| `submissions/.../replies` | Hanya admin |
| `leaderboard` | Validasi skor/nama ketat (latihan tanpa login tetap jalan) |
| `story_comments` | Wajib login + `uid` (selaras dengan kode) |

## File situs yang perlu deploy

| File | Alasan |
|------|--------|
| `firestore.rules` | Publish di Console |
| `stories.html` | Komentar cerita wajib login |
| `generate-stories.cjs` | Lalu **Generate Story Pages** |
| `generate-songs.js` | Notif admin kirim `fromUid` → deploy via generate lagu |

## Tes setelah publish

1. Buka cerita → komentar tanpa login → tombol **Login Google**
2. Login → komentar terkirim
3. `online_users` di Console — tidak bisa tulis doc ID sembarang
4. User biasa tidak bisa edit lagu di Firestore (Console → rules playground)

## Catatan

- Komentar cerita **lama tanpa `uid`** tetap terbaca; komentar baru wajib login.
- **App Check** (opsional) — lapisan anti-bot tambahan di Firebase Console.
