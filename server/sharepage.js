// Questigo — herkese açık canlı takip sayfası (uygulaması olmayanlar için)
function sharePageHtml(token) {
  const t = JSON.stringify(String(token));
  return `<!doctype html><html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Questigo — Canlı Takip</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#0d0f12;color:#f2f4f7}
  .bar{padding:12px 16px;font-size:15px}.bar b{color:#ff6b2c}#ago{color:#9aa2ad;font-size:13px}
  #map{height:calc(100vh - 46px)}
</style></head><body>
<div class="bar"><b>Questigo</b> · canlı takip — <span id="who">bağlanıyor…</span> <span id="ago"></span></div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var token=${t};
var map=L.map('map').setView([39,35],6);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap © CARTO'}).addTo(map);
var marker=null,first=true;
function tick(){
  fetch('/api/public/share/'+token).then(function(r){
    if(!r.ok){document.getElementById('who').textContent='takip bulunamadı veya durduruldu';return null;}
    return r.json();
  }).then(function(d){
    if(!d)return;
    document.getElementById('who').textContent=d.displayName||'Sürücü';
    if(d.updatedAt)document.getElementById('ago').textContent='son güncelleme: '+d.updatedAt+' UTC';
    if(d.lat!=null&&d.lng!=null){
      var ll=[d.lat,d.lng];
      if(!marker)marker=L.circleMarker(ll,{radius:9,color:'#fff',weight:3,fillColor:'#ff6b2c',fillOpacity:1}).addTo(map);
      marker.setLatLng(ll);
      if(first){map.setView(ll,15);first=false;}
    }
  }).catch(function(){});
}
tick();setInterval(tick,5000);
</script></body></html>`;
}
module.exports = { sharePageHtml };
