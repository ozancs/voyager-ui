import fs from 'node:fs/promises';
const groups = [
  [
    'Cihaza özel düzen',
    'Ek ayar yok. Her tarayıcının düzeni ayrı kaydediliyor; pencere boyutu kayıtlı yerleşimi değiştirmiyor. Aşağıdaki masaüstü ve tablet düzenleri demo örnekleridir.',
    [
      ['01-desktop', 'Masaüstü örneği'],
      ['01-tablet', 'Tablet örneği'],
    ],
  ],
  [
    'Boyut ayarları ve canlı önizleme',
    'Arayüz boyutu %5 adımlı. Üst durum kutularının boyutu ayrıca değişiyor. İkisi de mevcut aşağı inen panelde, dashboard görünürken ayarlanıyor.',
    [['02-size-preview', 'Aşağı inen boyut paneli']],
  ],
  [
    'MMU / Happy Hare',
    'Makara miktarı, buffer, FlowGuard ve bakım menüsü. Baskı başlarsa tüm kanalları kontrol et onayı kilitleniyor. Gerçek MMU üzerinde denenmedi; görüntüler ve komut kontrolleri demodan.',
    [
      ['03-mmu', 'MMU kartı'],
      ['03-menu', 'İşlem menüsü'],
      ['03-maintenance', 'Bakım penceresi'],
    ],
  ],
  [
    'Nem ve basınç',
    'Destekleyen sensörün kutusunda otomatik görünüyor. Ek ayar anahtarı yok; mevcut göster/gizle kontrolü kutunun tamamını yönetiyor.',
    [['04-environment', 'Chamber Top: nem ve basınç']],
  ],
  [
    'Kompakt sıcaklık kartı',
    'Klasik görünüm korunuyor. Kompakt görünüm alternatif olarak seçiliyor. Hedefe tıklayarak sıcaklık ayarlanıyor; ölçülen değere tıklayarak minimum ve maksimum görülüyor. Karışık sensör gruplarının başlıkları düzeltildi.',
    [
      ['05-classic', 'Klasik'],
      ['05-compact', 'Kompakt'],
      ['05-target', 'Hedef sıcaklık'],
      ['05-minmax', 'En düşük / en yüksek'],
    ],
  ],
  [
    'Düğmenin yanında açılan menüler',
    'Dashboard ölçeği küçülse de menü düğmenin yanında açılıyor. Bu örnekte kartlar küçültülmüş, açılan panel normal okunabilir boyutunda.',
    [['06-popover', 'Ölçekli dashboard üzerinde Presets']],
  ],
  [
    'Toolhead başlığı ve dashboard aralıkları',
    'Boşluklar azaltıldı. Kontroller yer olduğu sürece tek satırda; çok dar kartta taşmak yerine alt satıra geçiyor. Circle/Buttons seçimi hem kartta hem Özelleştir içinde korunuyor.',
    [
      ['07-before', 'Önce'],
      ['07-buttons', 'Sonra · Buttons'],
      ['07-circle', 'Sonra · Circle'],
      ['07-customize', 'Özelleştir içindeki seçim'],
    ],
  ],
];
const sections = groups
  .map(
    ([title, desc, photos], i) =>
      `<section id="item${i + 1}"><h2><b>${i + 1}</b>${title}</h2><p>${desc}</p><div class="photos">${photos.map(([file, label]) => `<figure><figcaption>${label}</figcaption><a href="${file}.png" target="_blank"><img src="${file}.png" alt="${label}" loading="lazy"></a></figure>`).join('')}</div></section>`,
  )
  .join('');
const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Voyager · 7 değişiklik</title><style>*{box-sizing:border-box}body{margin:0;background:#101315;color:#eef1f3;font:16px/1.6 system-ui}main{max-width:1320px;margin:auto;padding:36px 24px}h1{font-size:36px;line-height:1.2}h2{display:flex;align-items:center;gap:16px;font-size:25px}h2 b{display:grid;place-items:center;background:#00b99c;color:#09251e;width:42px;height:42px;border-radius:12px}header p,section>p{max-width:850px;color:#bbc7cf}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}a{color:#4edac5}nav a{background:#262e34;padding:8px 16px;border-radius:8px;text-decoration:none}section{padding:24px 0 38px;border-top:1px solid #30383e}.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;background:#1c2227;padding:12px;border-radius:14px;align-self:start}figure:only-child{grid-column:1/-1}figcaption{font-weight:600;padding:0 0 12px}img{display:block;width:100%;height:auto;border-radius:8px}.badge{color:#48d9be;font-weight:700}@media(max-width:760px){.photos{grid-template-columns:1fr}main{padding:20px 14px}}</style><main><header><span class="badge">YEREL DEMO · ONAY BEKLİYOR · PUSH YOK</span><h1>Voyager — yedi değişiklik</h1><p>18 Kasım 2026. Görseller çalışan yerel arayüzden alındı. Her görsele tıklayarak tam boy açabilirsin. Onaylarını aynı numaralarla iletebilirsin.</p><nav>${groups.map(([t], i) => `<a href="#item${i + 1}">${i + 1}. ${t}</a>`).join('')}</nav><a href="http://127.0.0.1:5198/" target="_blank">Çalışan yerel demoyu aç →</a></header>${sections}</main></html>`;
await fs.writeFile('../_reviews/voyager-seven-prs/index.html', html);
