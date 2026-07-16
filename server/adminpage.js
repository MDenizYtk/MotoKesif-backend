/* Questigo — Yönetici paneli sayfası (/admin)
   Tek dosyalık koyu panel: genel sayılar, kullanıcı listesi, gruplar, son gönderiler.
   Erişim: ADMIN_KEY (X-Admin-Key başlığıyla; panel anahtarı localStorage'da tutar). */
function adminPageHtml() {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Questigo Yönetim</title>
<style>
  :root { --bg:#0d0f12; --card:#16191f; --line:rgba(255,255,255,.08); --txt:#f2f4f7;
          --dim:#9aa2ad; --accent:#a855f7; --soft:rgba(168,85,247,.16); --danger:#ff3b46; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--txt); font:15px/1.5 -apple-system,system-ui,sans-serif; padding:20px; }
  .wrap { max-width:1100px; margin:0 auto; }
  h1 { font-size:22px; margin-bottom:4px; } h1 b { color:var(--accent); }
  .sub { color:var(--dim); font-size:13px; margin-bottom:20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin-bottom:24px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .stat b { display:block; font-size:26px; } .stat span { color:var(--dim); font-size:12px; }
  .stat.hl { border-color:var(--accent); background:linear-gradient(180deg,var(--soft),var(--card)); }
  h2 { font-size:16px; margin:26px 0 10px; }
  .tablewrap { overflow-x:auto; background:var(--card); border:1px solid var(--line); border-radius:14px; }
  table { border-collapse:collapse; width:100%; min-width:640px; font-size:13.5px; }
  th, td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { color:var(--dim); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
  tr:last-child td { border-bottom:none; }
  td.txt { white-space:normal; min-width:220px; }
  .pill { background:var(--soft); color:var(--accent); border-radius:99px; padding:2px 9px; font-size:12px; font-weight:600; }
  .muted { color:var(--dim); }
  input[type=text], input[type=password] { background:var(--card); border:1px solid var(--line); color:var(--txt);
    border-radius:10px; padding:10px 12px; font:inherit; width:100%; }
  button { background:var(--accent); border:none; color:#fff; font:600 14px/1 inherit; border-radius:10px;
    padding:10px 16px; cursor:pointer; }
  button.ghost { background:transparent; border:1px solid var(--line); color:var(--dim); }
  button.mini { padding:6px 10px; font-size:12px; border-radius:8px; }
  button.danger { background:var(--danger); }
  .login { max-width:360px; margin:80px auto; background:var(--card); border:1px solid var(--line);
    border-radius:16px; padding:24px; display:flex; flex-direction:column; gap:12px; }
  .row { display:flex; gap:10px; align-items:center; margin:0 0 10px; }
  .row input { flex:1; }
  .err { color:var(--danger); font-size:13px; }
  #app { display:none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="login" id="login">
    <h1><b>Questigo</b> Yönetim</h1>
    <p class="muted" style="font-size:13px">Yönetici anahtarını gir (sunucudaki /opt/motokesif/admin.key).</p>
    <input type="password" id="key" placeholder="Yönetici anahtarı" autocomplete="off">
    <button id="enter">Giriş</button>
    <p class="err" id="lerr"></p>
  </div>

  <div id="app">
    <h1><b>Questigo</b> Yönetim Paneli</h1>
    <p class="sub" id="when"></p>
    <div class="cards" id="cards"></div>

    <h2>Kullanıcılar</h2>
    <div class="row"><input type="text" id="q" placeholder="Ada ya da e-postaya göre süz"><button class="ghost" id="refresh">Yenile</button><button class="ghost" id="logout">Çıkış</button></div>
    <div class="tablewrap"><table id="users"><thead><tr>
      <th>Ad</th><th>E-posta</th><th>Kayıt</th><th>Son etkinlik</th><th>Grup</th><th>Gönderi</th><th>Rota</th><th>Uyarı</th>
    </tr></thead><tbody></tbody></table></div>

    <h2>Gruplar</h2>
    <div class="tablewrap"><table id="groups"><thead><tr>
      <th>Ad</th><th>Kurucu</th><th>Üye</th><th>Mesaj</th><th>Davet kodu</th><th>Kuruluş</th>
    </tr></thead><tbody></tbody></table></div>

    <h2>Son gönderiler</h2>
    <div class="tablewrap"><table id="posts"><thead><tr>
      <th>Kim</th><th>İçerik</th><th>Ek</th><th>Beğeni</th><th>Tarih</th><th></th>
    </tr></thead><tbody></tbody></table></div>
  </div>
</div>
<script>
(function () {
  var KEY = localStorage.getItem('qg_admin_key') || '';
  var usersCache = [];
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function dt(s) { if (!s) return '—';
    var d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
    return d.toLocaleString('tr-TR', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-key': KEY }, opts.headers || {});
    return fetch('/api/admin' + path, opts).then(function (r) {
      if (r.status === 401) { bounce(); throw new Error('yetkisiz'); }
      if (!r.ok) throw new Error('sunucu ' + r.status);
      return r.json();
    });
  }
  function bounce() {
    localStorage.removeItem('qg_admin_key');
    el('app').style.display = 'none'; el('login').style.display = 'flex';
    el('lerr').textContent = 'Anahtar geçersiz.';
  }
  function login() {
    KEY = el('key').value.trim();
    if (!KEY) return;
    localStorage.setItem('qg_admin_key', KEY);
    boot();
  }
  el('enter').addEventListener('click', login);
  el('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  el('logout').addEventListener('click', function () { bounce(); });
  el('refresh').addEventListener('click', function () { boot(); });
  el('q').addEventListener('input', function () { renderUsers(); });

  function cards(o) {
    var items = [
      ['Kullanıcı', o.users, true], ['Yeni üye (7 gün)', o.newUsers7d, true],
      ['Grup', o.groups], ['Gönderi', o.posts], ['Beğeni', o.likes],
      ['Mesaj', o.messages], ['Paylaşılan rota', o.sharedRoutes],
      ['Tehlike uyarısı', o.hazards], ['Etkinlik', o.events], ['Canlı takip', o.liveShares],
    ];
    el('cards').innerHTML = items.map(function (it) {
      return '<div class="stat' + (it[2] ? ' hl' : '') + '"><b>' + it[1] + '</b><span>' + it[0] + '</span></div>';
    }).join('');
  }
  function renderUsers() {
    var q = el('q').value.trim().toLowerCase();
    var list = usersCache.filter(function (u) {
      return !q || (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    });
    el('users').querySelector('tbody').innerHTML = list.map(function (u) {
      return '<tr><td><b>' + esc(u.displayName) + '</b></td><td class="muted">' + esc(u.email) + '</td>' +
        '<td>' + dt(u.createdAt) + '</td><td>' + dt(u.lastActivity) + '</td>' +
        '<td>' + u.groupCount + '</td><td>' + u.postCount + '</td><td>' + u.routeCount + '</td><td>' + u.hazardCount + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="muted">Kullanıcı yok</td></tr>';
  }
  function renderGroups(list) {
    el('groups').querySelector('tbody').innerHTML = list.map(function (g) {
      return '<tr><td><b>' + esc(g.name) + '</b></td><td class="muted">' + esc(g.creatorName || '—') + '</td>' +
        '<td>' + g.memberCount + '</td><td>' + g.messageCount + '</td>' +
        '<td><span class="pill">' + esc(g.inviteCode) + '</span></td><td>' + dt(g.createdAt) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted">Grup yok</td></tr>';
  }
  function renderPosts(list) {
    el('posts').querySelector('tbody').innerHTML = list.map(function (p) {
      var ek = (p.hasPhoto ? 'foto ' : '') + (p.hasRoute ? 'rota' : '');
      return '<tr><td><b>' + esc(p.displayName) + '</b></td>' +
        '<td class="txt">' + esc((p.text || '').slice(0, 140)) + (p.placeName ? ' <span class="muted">· ' + esc(p.placeName) + '</span>' : '') + '</td>' +
        '<td>' + (ek || '—') + '</td><td>' + p.likeCount + '</td><td>' + dt(p.createdAt) + '</td>' +
        '<td><button class="mini danger" data-del="' + p.id + '">Sil</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted">Gönderi yok</td></tr>';
    el('posts').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Bu gönderi kalıcı olarak silinsin mi?')) return;
        api('/posts/' + b.dataset.del, { method: 'DELETE' }).then(boot);
      });
    });
  }
  function boot() {
    Promise.all([api('/overview'), api('/users'), api('/groups'), api('/posts')])
      .then(function (r) {
        el('login').style.display = 'none'; el('app').style.display = 'block';
        el('when').textContent = 'Son yenileme: ' + new Date().toLocaleString('tr-TR');
        cards(r[0]); usersCache = r[1].users; renderUsers();
        renderGroups(r[2].groups); renderPosts(r[3].posts);
      })
      .catch(function () {});
  }
  if (KEY) boot();
})();
</script>
</body>
</html>`;
}

module.exports = { adminPageHtml };
