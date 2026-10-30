// Генератор демонстраційних зображень товарів (SVG → PNG → WebP через sharp).
// Це ілюстрації-заглушки: у реальному магазині їх замінюють фото в панелі керування.

export type Garment = 'tee' | 'longsleeve' | 'jacket' | 'coat' | 'hoodie' | 'trousers' | 'sneaker' | 'boot' | 'tote' | 'beanie' | 'scarf';

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (f < 0 ? clamp(c * (1 + f)) : clamp(c + (255 - c) * f)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function body(g: Garment, c: string): string {
  const dark = shade(c, -0.22);
  const darker = shade(c, -0.38);
  const light = shade(c, 0.18);
  const stroke = `stroke="${darker}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  const sheen = (id: string) => `<use href="#${id}" fill="url(#sheen)"/>`;
  switch (g) {
    case 'tee':
      return `<path id="b" d="M300 190 L218 232 L150 335 L214 372 L262 322 L262 790 L538 790 L538 322 L586 372 L650 335 L582 232 L500 190 Q400 262 300 190 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M300 190 Q400 262 500 190" fill="none" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
        <path d="M262 780 L538 780" stroke="${dark}" stroke-width="3" opacity=".6"/>`;
    case 'longsleeve':
      return `<path id="b" d="M300 190 L214 228 L128 700 L196 716 L262 380 L262 800 L538 800 L538 380 L604 716 L672 700 L586 228 L500 190 Q400 262 300 190 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M300 190 Q400 262 500 190" fill="none" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
        <path d="M128 700 L196 716 M672 700 L604 716" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>
        ${[330, 390, 450, 510, 570, 630, 690, 750].map((y) => `<path d="M270 ${y} L530 ${y}" stroke="${dark}" stroke-width="2" opacity=".35"/>`).join('')}`;
    case 'jacket':
      return `<path id="b" d="M292 172 L196 214 L132 702 L206 718 L262 410 L262 820 L538 820 L538 410 L594 718 L668 702 L604 214 L508 172 Q400 214 292 172 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M292 172 Q400 232 508 172 L508 210 Q400 262 292 210 Z" fill="${dark}" ${stroke}/>
        <path d="M400 236 L400 820" stroke="${darker}" stroke-width="4"/>
        <path d="M262 780 L538 780" stroke="${dark}" stroke-width="14" stroke-linecap="round"/>
        <path d="M132 702 L206 718 M668 702 L594 718" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
        <rect x="290" y="560" width="76" height="12" rx="6" fill="${dark}"/><rect x="434" y="560" width="76" height="12" rx="6" fill="${dark}"/>`;
    case 'coat':
      return `<path id="b" d="M292 168 L196 214 L138 760 L214 778 L262 420 L262 900 L538 900 L538 420 L586 778 L662 760 L604 214 L508 168 L400 330 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M292 168 L400 330 L336 360 L270 240 Z" fill="${light}" ${stroke}/>
        <path d="M508 168 L400 330 L464 360 L530 240 Z" fill="${light}" ${stroke}/>
        <path d="M400 330 L400 900" stroke="${darker}" stroke-width="3"/>
        ${[480, 590, 700].map((y) => `<circle cx="372" cy="${y}" r="9" fill="${darker}"/><circle cx="428" cy="${y}" r="9" fill="${darker}"/>`).join('')}
        <path d="M290 640 L350 640 M450 640 L510 640" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>`;
    case 'hoodie':
      return `<path id="b" d="M296 188 L206 228 L132 706 L208 722 L262 400 L262 800 L538 800 L538 400 L592 722 L668 706 L594 228 L504 188 Q400 250 296 188 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M296 188 Q300 120 400 116 Q500 120 504 188 Q400 270 296 188 Z" fill="${dark}" ${stroke}/>
        <path d="M346 230 L340 340 M454 230 L460 340" stroke="${darker}" stroke-width="5" stroke-linecap="round"/>
        <path d="M312 600 L488 600 L520 700 L280 700 Z" fill="${dark}" opacity=".55" ${stroke}/>
        <path d="M262 790 L538 790" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>
        <path d="M132 706 L208 722 M668 706 L592 722" stroke="${dark}" stroke-width="16" stroke-linecap="round"/>`;
    case 'trousers':
      return `<path id="b" d="M286 170 L514 170 L566 850 L430 850 L400 400 L370 850 L234 850 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <rect x="286" y="170" width="228" height="34" fill="${dark}" ${stroke}/>
        <path d="M400 204 L400 400" stroke="${darker}" stroke-width="3"/>
        <path d="M300 214 Q330 270 340 300 M500 214 Q470 270 460 300" fill="none" stroke="${darker}" stroke-width="3"/>
        ${[300, 340, 380, 420, 460, 500].map((x) => `<rect x="${x - 6}" y="170" width="12" height="34" fill="${darker}" opacity=".5"/>`).join('')}
        <path d="M236 826 L368 826 M432 826 L564 826" stroke="${dark}" stroke-width="5" opacity=".6"/>`;
    case 'sneaker':
      return `<path id="b" d="M110 560 Q118 460 240 440 L330 466 Q440 392 530 478 Q660 506 696 600 L696 668 L110 668 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M110 640 L696 640 L696 716 Q400 740 110 716 Z" fill="#f5f2ec" stroke="${darker}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M240 440 Q200 520 210 600" fill="none" stroke="${dark}" stroke-width="5"/>
        <path d="M330 466 L400 540 M372 452 L440 520 M416 438 L480 504" stroke="${darker}" stroke-width="7" stroke-linecap="round"/>
        <path d="M520 560 Q600 560 680 600" fill="none" stroke="${dark}" stroke-width="5"/>
        <rect x="200" y="660" width="500" height="6" fill="${darker}" opacity=".25"/>`;
    case 'boot':
      return `<path id="b" d="M250 190 L430 190 L440 500 Q560 520 640 580 Q700 620 696 690 L250 690 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M250 690 L696 690 L696 750 L250 750 Z" fill="${darker}" ${stroke}/>
        <path d="M250 190 L430 190 L430 230 L250 230 Z" fill="${dark}" ${stroke}/>
        <path d="M250 330 L438 330" stroke="${darker}" stroke-width="4"/>
        <rect x="262" y="600" width="170" height="14" rx="7" fill="${dark}"/>`;
    case 'tote':
      return `<path d="M318 410 C318 230 482 230 482 410" fill="none" stroke="${dark}" stroke-width="18" stroke-linecap="round"/>
        <path id="b" d="M232 400 L568 400 L592 810 L208 810 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M232 400 L568 400" stroke="${dark}" stroke-width="10"/>
        <rect x="330" y="540" width="140" height="140" rx="4" fill="none" stroke="${darker}" stroke-width="3" opacity=".5"/>
        <path d="M352 610 H448 M352 640 H420" stroke="${darker}" stroke-width="4" opacity=".5" stroke-linecap="round"/>`;
    case 'beanie':
      return `<path id="b" d="M246 560 Q236 300 400 290 Q564 300 554 560 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <rect x="228" y="520" width="344" height="110" rx="26" fill="${dark}" ${stroke}/>
        ${[250, 290, 330, 370, 410, 450, 490, 530].map((x) => `<path d="M${x} 530 L${x} 622" stroke="${darker}" stroke-width="3" opacity=".5"/>`).join('')}
        <circle cx="400" cy="270" r="30" fill="${light}" ${stroke}/>`;
    case 'scarf':
      return `<path id="b" d="M250 220 Q400 150 550 220 L586 330 Q400 270 214 330 Z" fill="${c}" ${stroke}/>${sheen('b')}
        <path d="M300 300 L400 330 L420 780 L316 770 Z" fill="${c}" ${stroke}/>
        <path d="M316 770 L420 780 M326 780 l-2 38 M346 782 l-2 38 M366 784 l-2 38 M386 785 l-2 38 M406 787 l-2 38" stroke="${darker}" stroke-width="4" stroke-linecap="round"/>
        ${[360, 430, 500, 570, 640, 710].map((y) => `<path d="M${312 + (y - 330) * 0.02} ${y} L${408 + (y - 330) * 0.04} ${y + 8}" stroke="${dark}" stroke-width="12" opacity=".55"/>`).join('')}
        ${[260, 300, 340].map((y, i) => `<path d="M${240 + i * 60} ${y + (i === 0 ? 0 : 0)} L${240 + i * 60} ${y}" />`).join('')}`;
  }
}

export interface SceneOpts {
  garment: Garment;
  color: string;
  bg: [string, string];
  /** 'front' — загальний план, 'detail' — збільшений фрагмент */
  view?: 'front' | 'detail';
}

export function productSvg({ garment, color, bg, view = 'front' }: SceneOpts) {
  const transform = view === 'detail' ? 'translate(-210 -250) scale(1.5)' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  ${view === 'front' ? '<ellipse cx="400" cy="900" rx="250" ry="26" fill="#000" opacity=".16" filter="url(#soft)"/>' : ''}
  <g transform="${transform}">${body(garment, color)}</g>
</svg>`;
}

export function heroSvg(colors: string[], bg: [string, string]) {
  const items: { g: Garment; c: string; t: string }[] = [
    { g: 'coat', c: colors[0], t: 'translate(40 120) scale(.92)' },
    { g: 'hoodie', c: colors[1], t: 'translate(380 210) scale(.85)' },
    { g: 'sneaker', c: colors[2], t: 'translate(830 540) scale(.8)' },
    { g: 'tote', c: colors[3], t: 'translate(980 150) scale(.8)' },
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <defs>
    <radialGradient id="bg" cx="60%" cy="35%" r="80%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
  </defs>
  <rect width="1600" height="1200" fill="url(#bg)"/>
  <circle cx="1040" cy="520" r="420" fill="#fff" opacity=".28"/>
  ${items.map((i, n) => `<g transform="${i.t}">${body(i.g, i.c).replace(/id="b"/g, `id="b${n}"`).replace(/href="#b"/g, `href="#b${n}"`)}</g>`).join('\n')}
</svg>`;
}
