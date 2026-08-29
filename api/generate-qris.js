// api/generate-qris.js
// Endpoint ini ditaruh di project Vercel "nexora-api-one" milikmu,
// sehingga bisa diakses di: https://nexora-api-one.vercel.app/api/generate-qris
//
// Cara pasang di project Vercel-mu:
//   1. Taruh file ini di folder /api/generate-qris.js pada root project
//   2. Pastikan produk.json (yang sudah dibungkus jadi { produk, qris })
//      tetap bisa diakses di https://nexora-api-one.vercel.app/produk.json
//   3. Jalankan: npm install qrcode
//   4. Deploy ulang (git push / vercel --prod)
//
// Catatan penting:
// Endpoint ini masih SIMULASI — dia hanya menggambar QR dari teks yang kita
// susun sendiri di server, dengan data merchant diambil dari produk.json.
// Uang belum benar-benar berpindah ke akun DANA-mu. Supaya dana beneran cair,
// bagian "susun konten QR" di bawah ini nanti diganti dengan panggilan ke API
// resmi PJSP (DANA Bisnis/Xendit/Midtrans), yang akan mengembalikan payload
// QRIS asli + urusan settlement dana.

const QRCode = require('qrcode');

// Palet warna QR — dipilih dari warna brand yang gelap/kontras cukup tinggi
// terhadap latar putih, supaya tetap bisa dipindai scanner meski warnanya beda-beda.
const PALET_WARNA_QR = ['#2b1b3d', '#cc3814', '#c9134a', '#0f7a44', '#402955', '#5b3b73'];

// Gaya bentuk modul QR — inilah yang membuat GAMBAR-nya sendiri beda-beda
// tiap transaksi (bukan cuma warnanya), mirip QR premium ala DANA/GoPay.
const GAYA_QR = ['dots', 'rounded', 'square'];

// Hash string -> angka, dengan langkah finalisasi ala MurmurHash supaya
// distribusinya lebih merata (menghindari beberapa ref "nyangkut" di nilai yang sama)
function hashString(str, garam) {
  let hash = 0;
  const input = garam + str;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 2654435761);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function pilihWarnaQr(kodeRef) {
  return PALET_WARNA_QR[hashString(kodeRef, 'warna-') % PALET_WARNA_QR.length];
}

function pilihGayaQr(kodeRef) {
  return GAYA_QR[hashString(kodeRef, 'gaya-') % GAYA_QR.length];
}

// Menggambar QR secara manual modul-per-modul (bukan pakai QRCode.toDataURL bawaan)
// supaya bentuk tiap kotaknya bisa divariasikan: dots (bulat), rounded (kotak
// membulat), atau square (kotak klasik) — mata QR di 3 pojok digambar khusus
// biar tetap rapi & mudah dipindai scanner apa pun gaya modul datanya.
function renderQrSvg(kontenQr, warna, gaya) {
  const data = QRCode.create(kontenQr, { errorCorrectionLevel: 'H' });
  const size = data.modules.size;
  const moduleSize = 10;
  const quietZone = 4; // margin putih di tepi, sesuai standar QR
  const dim = (size + quietZone * 2) * moduleSize;

  const isDark = (r, c) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    return data.modules.get(r, c) === 1;
  };
  const inEyeZone = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  let shapes = '';

  // Gambar modul data (di luar area mata QR) sesuai gaya yang terpilih
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isDark(r, c) || inEyeZone(r, c)) continue;
      const x = (c + quietZone) * moduleSize;
      const y = (r + quietZone) * moduleSize;
      if (gaya === 'dots') {
        shapes += `<circle cx="${x + moduleSize / 2}" cy="${y + moduleSize / 2}" r="${moduleSize * 0.42}" fill="${warna}"/>`;
      } else if (gaya === 'rounded') {
        const rx = moduleSize * 0.32;
        shapes += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" rx="${rx}" ry="${rx}" fill="${warna}"/>`;
      } else {
        shapes += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${warna}"/>`;
      }
    }
  }

  // Gambar 3 mata QR (finder pattern) di pojok kiri-atas, kanan-atas, kiri-bawah.
  // Selalu digambar rapi (bukan ikut style dots/rounded per-modul) agar tetap
  // terdeteksi scanner dengan andal, mengikuti pola standar QR: cincin luar
  // solid, celah putih, kotak solid di tengah.
  const eyePositions = [{ r: 0, c: 0 }, { r: 0, c: size - 7 }, { r: size - 7, c: 0 }];
  eyePositions.forEach(({ r, c }) => {
    const baseX = (c + quietZone) * moduleSize;
    const baseY = (r + quietZone) * moduleSize;
    const outerR = gaya === 'square' ? 0 : moduleSize * 1.8;
    const midR = gaya === 'square' ? 0 : moduleSize * 1.2;

    shapes += `<rect x="${baseX}" y="${baseY}" width="${7 * moduleSize}" height="${7 * moduleSize}" rx="${outerR}" ry="${outerR}" fill="${warna}"/>`;
    shapes += `<rect x="${baseX + moduleSize}" y="${baseY + moduleSize}" width="${5 * moduleSize}" height="${5 * moduleSize}" rx="${midR}" ry="${midR}" fill="#ffffff"/>`;
    if (gaya === 'dots') {
      shapes += `<circle cx="${baseX + 3.5 * moduleSize}" cy="${baseY + 3.5 * moduleSize}" r="${1.5 * moduleSize}" fill="${warna}"/>`;
    } else {
      const innerR = gaya === 'square' ? 0 : moduleSize * 0.8;
      shapes += `<rect x="${baseX + 2 * moduleSize}" y="${baseY + 2 * moduleSize}" width="${3 * moduleSize}" height="${3 * moduleSize}" rx="${innerR}" ry="${innerR}" fill="${warna}"/>`;
    }
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}"><rect width="${dim}" height="${dim}" fill="#ffffff"/>${shapes}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Dipakai HANYA kalau produk.json gagal diakses (jaga-jaga agar checkout tidak macet)
const MERCHANT_CADANGAN = {
  nama: 'NEXORA MARKET',
  nmid: 'ID10243879012',
  terhubungKe: 'DANA'
};

// Ambil konfigurasi merchant QRIS dari produk.json, supaya kalau kamu ganti
// akun DANA / NMID, cukup edit produk.json — tidak perlu ubah/deploy kode ini lagi.
async function ambilKonfigurasiMerchant() {
  try {
    const res = await fetch('https://nexora-api-one.vercel.app/produk.json');
    if (!res.ok) throw new Error(`Gagal fetch produk.json, status ${res.status}`);
    const data = await res.json();
    if (data && data.qris && data.qris.nama && data.qris.nmid) {
      return data.qris;
    }
    throw new Error('Field "qris" tidak ditemukan/lengkap di produk.json');
  } catch (err) {
    console.warn('Pakai merchant cadangan karena:', err.message);
    return MERCHANT_CADANGAN;
  }
}

module.exports = async function handler(req, res) {
  // Izinkan dipanggil dari domain frontend kamu (ganti '*' dengan domain asli saat production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan, gunakan POST' });
  }

  try {
    const { ref, total } = req.body || {};

    if (!ref || !total || Number.isNaN(Number(total))) {
      return res.status(400).json({ error: 'Field "ref" dan "total" (angka) wajib diisi' });
    }

    const MERCHANT = await ambilKonfigurasiMerchant();

    // Susun konten QR — unik karena mengandung ref transaksi & nominal
    const kontenQr = [
      'NEXORA-QRIS-DEMO',
      `MERCHANT:${MERCHANT.nama}`,
      `NMID:${MERCHANT.nmid}`,
      `TERHUBUNG:${MERCHANT.terhubungKe}`,
      `REF:${ref}`,
      `AMOUNT:${total}`
    ].join('|');

    // Gambar QR-nya sendiri yang divariasikan (bentuk modul + warna),
    // bukan cuma warnanya — dipilih deterministik dari kode referensi.
    const warnaQr = pilihWarnaQr(ref);
    const gayaQr = pilihGayaQr(ref);
    const qrImage = renderQrSvg(kontenQr, warnaQr, gayaQr);

    return res.status(200).json({
      ref,
      total: Number(total),
      merchant: MERCHANT,
      qrImage, // string data:image/svg+xml;base64,...
      warnaQr,
      gayaQr,
      berlakuDetik: 600 // 10 menit, dipakai frontend untuk countdown
    });
  } catch (err) {
    console.error('Gagal generate QRIS:', err);
    return res.status(500).json({ error: 'Gagal membuat kode QR' });
  }
};
