# MotoKesif Backend

MotoKesif uygulamasının backend API'si — kullanıcı kayıt/giriş, grup, grup sohbeti ve rota paylaşımı.

## Çalıştırma

```bash
npm install
npm start        # veya geliştirme için: npm run dev
```

Sunucu varsayılan olarak `4000` portunda çalışır (`PORT` ortam değişkeni ile değiştirilebilir).

## Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `PORT` | Sunucu portu (Railway otomatik verir) |
| `JWT_SECRET` | **Üretimde zorunlu.** Oturum token'larını imzalayan gizli anahtar. Railway panelinden güçlü, rastgele bir değer tanımlayın. |
| `DATABASE_PATH` | SQLite dosyasının yolu. |

## Railway Notları

Bu proje Railway'e bağlı — `main` dalına push edilince otomatik deploy alır.

- **Önemli:** SQLite dosyası varsayılan olarak konteyner içinde tutulur; Railway'de kalıcı **Volume** bağlanmazsa her deploy'da veriler silinir. Railway'de bir Volume oluşturup `DATABASE_PATH` değişkenini volume içindeki bir yola (örn. `/data/data.sqlite`) ayarlayın.
- `JWT_SECRET` değişkenini Railway panelinde mutlaka tanımlayın; yoksa sunucu üretimde uyarı loglar ve güvensiz varsayılan anahtar kullanılır.

## API Uç Noktaları

### Auth (`/api/auth`)
- `POST /register` — `{ email, password, displayName }` → `{ token, user }`
- `POST /login` — `{ email, password }` → `{ token, user }`
- `GET /me` — (Bearer token) → `{ user }`
- `PATCH /me` — `{ displayName }` → `{ user }`

### Gruplar (`/api/groups`, tümü Bearer token ister)
- `GET /` — üyesi olunan gruplar
- `POST /` — `{ name }` ile grup oluştur (davet kodu üretilir)
- `POST /join` — `{ inviteCode }` ile gruba katıl
- `GET /:groupId` — grup detayı + üyeler
- `GET /:groupId/messages` — son 200 mesaj
- `POST /:groupId/messages` — `{ text }` mesaj gönder (Socket.IO ile `message:new` yayınlanır)
- `GET /:groupId/routes` — paylaşılan rotalar
- `POST /:groupId/routes` — `{ name, points: [{latitude, longitude}], distanceKm }` rota paylaş

### Socket.IO
Bağlantıda `auth: { token }` gönderilir. Olaylar: `group:join`, `group:leave`, sunucudan `message:new`.
