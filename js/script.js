/* =========================================================
   NEXORA MARKET — MASTER JAVASCRIPT ENGINE (FULL & CLEAN DOM API)
   Fitur Terintegrasi: 
   - Notifikasi Toast 
   - Fetch API Produk & API QR Vercel
   - Sinkronisasi Keranjang & Stok
   - Rendering Katalog (Search, Filter, Sort, Pagination)
   - UX Modal Detail Produk & Modal Bayar Checkout
   - Validasi Profil & Otorisasi Pengguna
   ========================================================= */

// Inisialisasi Tema Otomatis Saat Skrip Dimuat
(function inisialisasiTemaAwal() {
  const tema = localStorage.getItem('nexora_theme') || 'light';
  document.documentElement.setAttribute('data-theme', tema);
})();

// Deteksi Lokasi Relatif Path Dinamis (Root vs /html/)
const diDalamFolderHtml = window.location.pathname.includes('/html/');
const prefixHtml = diDalamFolderHtml ? '' : 'html/';
const rootPrefix = diDalamFolderHtml ? '../' : '';
const NEXORA_PATHS = window.NEXORA_PATHS || {
  home: rootPrefix + 'index.html',
  login: prefixHtml + 'login_daftar.html',
  shop: prefixHtml + 'bagianDalam.html',
  cart: prefixHtml + 'keranjang.html',
  payment: prefixHtml + 'pembayaran.html',
  profile: prefixHtml + 'profile.html'
};
let PRODUK = [];
let DATA_QR = null; // Menyimpan data URL/Image QR dari API Vercel
let KUPON_LIST = []; // Menyimpan daftar kupon yang tersedia dari API Vercel
let statusCeklisKeranjang = {}; // Menyimpan status centang tiap item keranjang, supaya tidak reset saat qty diubah
let halamanAktifRiwayat = 1; // Halaman aktif paginasi riwayat pesanan
const RIWAYAT_PER_HALAMAN = 5;

// Merchant tujuan dana QRIS (simulasi tampilan; penyaluran dana sungguhan
// baru bisa terjadi bila situs ini disambungkan ke backend + API resmi
// penyedia QRIS seperti DANA Bisnis/Midtrans/Xendit).
const NEXORA_MERCHANT_QRIS = {
  nama: 'NEXORA MARKET',
  nmid: 'ID10243879012',
  terhubungKe: 'DANA'
};
let produkAktif = null;
let halamanAktifProduk = 1;
let sortAktif = 'terkait';
const PRODUK_PER_HALAMAN = 18;

/* ---------- 1. NOTIFIKASI TOAST (DOM API) ---------- */
function tampilkanNotifikasi(pesan, tipe = 'info') {
  let toast = document.getElementById('notifikasiGlobal');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'notifikasiGlobal';
    document.body.appendChild(toast);
  }
  toast.className = 'notifikasi-global notifikasi-' + tipe;
  toast.textContent = pesan;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      toast.classList.add('tampil');
    });
  });
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.classList.remove('tampil');
  }, 3000);
}

/* ---------- 2. FORMATTER & HELPER DATA ---------- */
function formatRupiah(angka) {
  return 'Rp' + Number(angka).toLocaleString('id-ID');
}
function ambilStok(p) {
  if (!p) return 0;
  if (p.stok !== undefined && p.stok !== null) return Number(p.stok);
  if (p.spesifikasi && p.spesifikasi.stok !== undefined && p.spesifikasi.stok !== null) {
    return Number(p.spesifikasi.stok);
  }
  return 0;
}
function ambilTerjual(p) {
  if (!p) return 0;
  if (p.terjual !== undefined && p.terjual !== null) return Number(p.terjual);
  if (p.spesifikasi && p.spesifikasi.terjual !== undefined && p.spesifikasi.terjual !== null) {
    return Number(p.spesifikasi.terjual);
  }
  return 0;
}
function cariProdukById(id) {
  return (
    PRODUK.find(function (p) {
      return String(p.id) === String(id);
    }) || null
  );
}
function simpanDataProdukKeStorage(daftarProduk) {
  localStorage.setItem('nexora_data_produk', JSON.stringify(daftarProduk));
}
function ambilDataProdukDariStorage() {
  try {
    const data = JSON.parse(localStorage.getItem('nexora_data_produk'));
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch (e) {
    return null;
  }
}
function kurangiStokDanTambahTerjual(daftarItemCheckout) {
  if (!Array.isArray(daftarItemCheckout) || daftarItemCheckout.length === 0) return;
  daftarItemCheckout.forEach(function (item) {
    const p = cariProdukById(item.id);
    if (p) {
      const stokSekarang = ambilStok(p);
      const terjualSekarang = ambilTerjual(p);
      const qtyBeli = Number(item.qty) || 1;
      const sisaStok = Math.max(0, stokSekarang - qtyBeli);
      const totalTerjual = terjualSekarang + qtyBeli;
      p.stok = sisaStok;
      p.terjual = totalTerjual;
      if (!p.spesifikasi) p.spesifikasi = {};
      p.spesifikasi.stok = sisaStok;
      p.spesifikasi.terjual = totalTerjual;
    }
  });
  simpanDataProdukKeStorage(PRODUK);
}

/* ---------- 3. LOAD DATA PRODUK & DATA QR (API VERCEL) ---------- */
async function muatDataProduk() {
  try {
    const response = await fetch('https://nexora-api-one.vercel.app/produk.json');
    if (response.ok) {
      const dataAPI = await response.json();
      let sumberDataProduk = [];

      // Deteksi struktur API apakah membungkus produk dan qr
      if (dataAPI.produk && Array.isArray(dataAPI.produk)) {
        sumberDataProduk = dataAPI.produk;
      } else {
        sumberDataProduk = dataAPI; // Fallback jika struktur array murni
      }

      // Tarik konfigurasi merchant QRIS dari file api (field "qris")
      if (dataAPI.qris) {
        DATA_QR = dataAPI.qris;
      }

      // Tarik daftar kupon yang tersedia dari file api (field "kupon")
      if (dataAPI.kupon && Array.isArray(dataAPI.kupon)) {
        KUPON_LIST = dataAPI.kupon;
      }
      const dataLokal = ambilDataProdukDariStorage();
      if (dataLokal && Array.isArray(dataLokal) && dataLokal.length > 0) {
        PRODUK = sumberDataProduk.map(function (pAPI) {
          const pLokal = dataLokal.find(function (l) {
            return String(l.id) === String(pAPI.id);
          });
          if (pLokal) {
            const spesifikasiGabungan = Object.assign({}, pAPI.spesifikasi, {
              stok:
                pLokal.spesifikasi && pLokal.spesifikasi.stok !== undefined
                  ? pLokal.spesifikasi.stok
                  : pLokal.stok,
              terjual:
                pLokal.spesifikasi && pLokal.spesifikasi.terjual !== undefined
                  ? pLokal.spesifikasi.terjual
                  : pLokal.terjual
            });
            return Object.assign({}, pAPI, {
              kota: pAPI.kota || pLokal.kota || 'Kota Bandung',
              stok:
                pLokal.stok !== undefined
                  ? pLokal.stok
                  : pLokal.spesifikasi
                    ? pLokal.spesifikasi.stok
                    : pAPI.stok,
              terjual:
                pLokal.terjual !== undefined
                  ? pLokal.terjual
                  : pLokal.spesifikasi
                    ? pLokal.spesifikasi.terjual
                    : pAPI.terjual,
              spesifikasi: spesifikasiGabungan
            });
          }
          return Object.assign({}, pAPI, {
            kota: pAPI.kota || 'Kota Bandung'
          });
        });
      } else {
        PRODUK = sumberDataProduk.map(function (p) {
          return Object.assign({}, p, {
            kota: p.kota || 'Kota Bandung'
          });
        });
      }
      simpanDataProdukKeStorage(PRODUK);
    } else {
      throw new Error('Gagal mengambil data dari API Vercel');
    }
  } catch (error) {
    console.warn('API gagal dimuat, menggunakan data lokal cadangan...', error);
    const dataLokal = ambilDataProdukDariStorage();
    if (dataLokal) PRODUK = dataLokal;
  } finally {
    renderKatalog();
    renderKeranjang();
    renderRingkasanPembayaran();
    renderRiwayatPesanan();
    renderVoucherIndex();
    document.dispatchEvent(new Event('produkReady'));
  }
}

/* ---------- 4. RENDER KATALOG (CLEAN CARDS / TANPA TAGLINE DISKON) ---------- */
function ambilKategoriAktif() {
  const radioAktif = document.querySelector('input[name="filter-kategori"]:checked');
  if (!radioAktif) {
    const radioDefault = document.getElementById('cat-all');
    if (radioDefault) radioDefault.checked = true;
    return 'all';
  }
  if (radioAktif.id === 'cat-all') return 'all';
  return radioAktif.id.replace('cat-', '').trim().toLowerCase();
}
function renderKatalog() {
  const wadahKatalog = document.getElementById('katalogProduk');
  if (!wadahKatalog) return;
  if (!PRODUK || PRODUK.length === 0) {
    const dataLokal = ambilDataProdukDariStorage();
    if (dataLokal && dataLokal.length > 0) PRODUK = dataLokal;
    else return;
  }
  const kategoriAktif = ambilKategoriAktif();
  const inputPencarian = document.getElementById('inputPencarian');
  const query = inputPencarian ? inputPencarian.value.trim().toLowerCase() : '';
  let produkTersaring = PRODUK.filter(function (p) {
    const katProduk = (p.kategori || '').trim().toLowerCase();
    const katProdukTanpaSpasi = katProduk.replace(/\s+/g, '');
    let cocokKategori = false;
    if (kategoriAktif === 'all' || !kategoriAktif) {
      cocokKategori = true;
    } else if (katProduk === kategoriAktif || katProdukTanpaSpasi === kategoriAktif) {
      // Menangani kategori yang mengandung spasi di data (mis. "alat tulis" vs id "cat-alattulis")
      cocokKategori = true;
    } else if (
      (kategoriAktif === 'jacket' && katProduk === 'jaket') ||
      (kategoriAktif === 'jaket' && katProduk === 'jacket')
    ) {
      cocokKategori = true;
    }
    const namaProduk = (p.nama || '').toLowerCase();
    const cocokPencarian = query === '' || namaProduk.includes(query);
    return cocokKategori && cocokPencarian;
  });
  if (sortAktif === 'terlaris') {
    produkTersaring.sort(function (a, b) {
      return ambilTerjual(b) - ambilTerjual(a);
    });
  } else if (sortAktif === 'terbaru') {
    produkTersaring.reverse();
  } else {
    produkTersaring.sort(function (a, b) {
      return String(a.id) > String(b.id) ? 1 : -1;
    });
  }
  const totalHalaman = Math.max(1, Math.ceil(produkTersaring.length / PRODUK_PER_HALAMAN));
  if (halamanAktifProduk > totalHalaman) halamanAktifProduk = totalHalaman;
  if (halamanAktifProduk < 1) halamanAktifProduk = 1;
  const awal = (halamanAktifProduk - 1) * PRODUK_PER_HALAMAN;
  const produkHalamanIni = produkTersaring.slice(awal, awal + PRODUK_PER_HALAMAN);
  wadahKatalog.replaceChildren();
  if (produkTersaring.length === 0) {
    const pesanKosong = document.createElement('div');
    pesanKosong.className = 'pesan-katalog-kosong';
    pesanKosong.textContent = 'Produk tidak ditemukan. Coba kata kunci atau kategori lain.';
    wadahKatalog.appendChild(pesanKosong);
  } else {
    produkHalamanIni.forEach(function (p) {
      return wadahKatalog.appendChild(buatKartuProduk(p));
    });
  }
  initKlikProduk();
  renderPaginasi(totalHalaman, produkTersaring.length);
}
function buatKartuProduk(p) {
  const secDiv = document.createElement('div');
  secDiv.className = 'container-sec';
  secDiv.dataset.id = p.id;
  const figure = document.createElement('figure');
  figure.className = 'kartu-gambar';
  const gambarWrap = document.createElement('div');
  gambarWrap.className = 'gambar-produk';
  const img = document.createElement('img');
  img.src = p.gambar || 'https://dummyimage.com/600x600/e2e8f0/0f172a.png&text=Nexora';
  img.alt = p.nama || 'Produk';
  img.loading = 'lazy';
  gambarWrap.appendChild(img);
  const figcaption = document.createElement('figcaption');
  figcaption.className = 'info-produk';
  const namaSpan = document.createElement('span');
  namaSpan.className = 'nama-produk';
  namaSpan.textContent = p.nama;
  const infoBawah = document.createElement('div');
  infoBawah.className = 'info-bawah-produk';
  const strong = document.createElement('strong');
  strong.className = 'harga-produk';
  strong.textContent = formatRupiah(p.harga);
  const lokasiTerjual = document.createElement('div');
  lokasiTerjual.className = 'lokasi-terjual';
  const spanKota = document.createElement('span');
  spanKota.textContent = p.kota
    ? p.kota
    : p.spesifikasi && p.spesifikasi.kota
      ? p.spesifikasi.kota
      : 'Kota Bandung';
  const spanTerjual = document.createElement('span');
  spanTerjual.textContent = ambilTerjual(p) + ' Terjual';
  lokasiTerjual.appendChild(spanKota);
  lokasiTerjual.appendChild(spanTerjual);
  infoBawah.appendChild(strong);
  infoBawah.appendChild(lokasiTerjual);
  figcaption.appendChild(namaSpan);
  figcaption.appendChild(infoBawah);
  figure.appendChild(gambarWrap);
  figure.appendChild(figcaption);
  secDiv.appendChild(figure);
  return secDiv;
}
const MAKS_TOMBOL_HALAMAN = 5; // maksimal nomor halaman yang tampil sekaligus

function hitungJendelaHalaman(halamanAktif, totalHalaman, maksTampil) {
  let awal = Math.max(1, halamanAktif - Math.floor(maksTampil / 2));
  let akhir = awal + maksTampil - 1;
  if (akhir > totalHalaman) {
    akhir = totalHalaman;
    awal = Math.max(1, akhir - maksTampil + 1);
  }
  return { awal, akhir };
}

function renderPaginasi(totalHalaman, totalProduk) {
  const wadahPaginasi = document.getElementById('paginasiProduk');
  if (!wadahPaginasi) return;
  wadahPaginasi.replaceChildren();
  if (totalProduk === 0 || totalHalaman <= 1) return;

  const buatTombol = function (label, tujuan, aktif = false, nonaktif = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-halaman ' + (aktif ? 'aktif' : '');
    btn.textContent = label;
    btn.disabled = nonaktif;
    btn.onclick = function () {
      halamanAktifProduk = tujuan;
      renderKatalog();
      window.scrollTo({
        top: 380,
        behavior: 'smooth'
      });
    };
    return btn;
  };

  const buatElipsis = function () {
    const span = document.createElement('span');
    span.className = 'elipsis-halaman';
    span.textContent = '…';
    return span;
  };

  wadahPaginasi.appendChild(
    buatTombol('‹', halamanAktifProduk - 1, false, halamanAktifProduk === 1)
  );

  const { awal, akhir } = hitungJendelaHalaman(halamanAktifProduk, totalHalaman, MAKS_TOMBOL_HALAMAN);

  if (awal > 1) {
    wadahPaginasi.appendChild(buatTombol('1', 1, halamanAktifProduk === 1));
    if (awal > 2) wadahPaginasi.appendChild(buatElipsis());
  }

  for (let i = awal; i <= akhir; i++) {
    wadahPaginasi.appendChild(buatTombol(String(i), i, i === halamanAktifProduk));
  }

  if (akhir < totalHalaman) {
    if (akhir < totalHalaman - 1) wadahPaginasi.appendChild(buatElipsis());
    wadahPaginasi.appendChild(
      buatTombol(String(totalHalaman), totalHalaman, halamanAktifProduk === totalHalaman)
    );
  }

  wadahPaginasi.appendChild(
    buatTombol('›', halamanAktifProduk + 1, false, halamanAktifProduk === totalHalaman)
  );
}

/* ---------- 5. MODAL DETAIL PRODUK (DOM API) ---------- */
function pasangModalKeDOM() {
  let overlay = document.getElementById('modalProduk');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'modalProduk';
  overlay.className = 'overlay-produk';
  overlay.hidden = true;
  const card = document.createElement('div');
  card.className = 'kartu-modal-produk';
  const btnTutup = document.createElement('button');
  btnTutup.type = 'button';
  btnTutup.className = 'tutup-modal-produk';
  btnTutup.textContent = '×';
  btnTutup.onclick = tutupModal;
  const divImg = document.createElement('div');
  divImg.className = 'modal-produk-gambar';
  const img = document.createElement('img');
  img.id = 'modalProdukGambar';
  divImg.appendChild(img);
  const divInfo = document.createElement('div');
  divInfo.className = 'modal-produk-info';
  const h3 = document.createElement('h3');
  h3.id = 'modalProdukNama';
  const barisTerjual = document.createElement('div');
  barisTerjual.className = 'modal-baris-terjual';
  const spanTerjualModal = document.createElement('span');
  spanTerjualModal.id = 'modalProdukTerjual';
  spanTerjualModal.className = 'badge-terjual-modal';
  const spanKategori = document.createElement('span');
  spanKategori.id = 'modalProdukKategori';
  spanKategori.className = 'badge-kategori-modal';
  barisTerjual.appendChild(spanTerjualModal);
  barisTerjual.appendChild(spanKategori);
  const pHarga = document.createElement('div');
  pHarga.className = 'modal-produk-harga';
  pHarga.id = 'modalProdukHarga';
  const pDesk = document.createElement('p');
  pDesk.id = 'modalProdukDeskripsi';
  pDesk.className = 'modal-produk-deskripsi';
  const judulSpek = document.createElement('div');
  judulSpek.className = 'judul-spek-modal';
  judulSpek.textContent = 'Spesifikasi Produk:';
  const dlSpek = document.createElement('dl');
  dlSpek.id = 'modalProdukSpek';
  dlSpek.className = 'modal-produk-spek';
  const divJumlahStok = document.createElement('div');
  divJumlahStok.className = 'modal-jumlah-wrapper';
  const stepper = document.createElement('div');
  stepper.className = 'stepper-modal';
  const btnMin = document.createElement('button');
  btnMin.type = 'button';
  btnMin.textContent = '−';
  btnMin.onclick = function () {
    return ubahJumlahModal(-1);
  };
  const inputQty = document.createElement('input');
  inputQty.type = 'text';
  inputQty.id = 'modalJumlahBeli';
  inputQty.className = 'input-jumlah-modal';
  inputQty.value = '1';
  inputQty.autocomplete = 'off';
  inputQty.addEventListener('input', function () {
    inputQty.value = inputQty.value.replace(/[^0-9]/g, '');
    let val = parseInt(inputQty.value, 10);
    const stokTersedia = ambilStok(produkAktif);
    if (!isNaN(val) && val > stokTersedia) {
      inputQty.value = stokTersedia;
      tampilkanNotifikasi('Maksimal pembelian ' + stokTersedia + ' pcs sesuai sisa stok', 'error');
    }
  });
  inputQty.addEventListener('blur', function () {
    let val = parseInt(inputQty.value, 10);
    if (isNaN(val) || val < 1) inputQty.value = '1';
  });
  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.textContent = '+';
  btnPlus.onclick = function () {
    return ubahJumlahModal(1);
  };
  stepper.appendChild(btnMin);
  stepper.appendChild(inputQty);
  stepper.appendChild(btnPlus);
  const spanStok = document.createElement('span');
  spanStok.id = 'modalProdukStok';
  spanStok.className = 'teks-stok-modal';
  divJumlahStok.appendChild(stepper);
  divJumlahStok.appendChild(spanStok);
  const divAksi = document.createElement('div');
  divAksi.className = 'modal-produk-aksi';
  const btnCart = document.createElement('button');
  btnCart.type = 'button';
  btnCart.className = 'btn-tambah-keranjang';
  btnCart.textContent = '🛒 Masukkan Keranjang';
  btnCart.onclick = function () {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn) {
      tampilkanNotifikasi('Silakan masuk (login) terlebih dahulu!', 'error');
      setTimeout(function () {
        window.location.href = NEXORA_PATHS.login;
      }, 1000);
      return;
    }
    if (produkAktif) {
      const inputEl = document.getElementById('modalJumlahBeli');
      const qtyBeli = parseInt(inputEl.value, 10) || 1;
      const sukses = tambahKeKeranjang(produkAktif.id, qtyBeli);
      if (sukses) {
        tutupModal();
        tampilkanNotifikasi(
          produkAktif.nama + ' (' + qtyBeli + ' pcs) masuk ke keranjang!',
          'keranjang'
        );
      }
    }
  };
  const btnBuy = document.createElement('button');
  btnBuy.type = 'button';
  btnBuy.className = 'btn-beli-sekarang';
  btnBuy.textContent = 'Beli Sekarang';
  btnBuy.onclick = function () {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn) {
      tampilkanNotifikasi('Silakan masuk (login) terlebih dahulu!', 'error');
      setTimeout(function () {
        window.location.href = NEXORA_PATHS.login;
      }, 1000);
      return;
    }
    if (produkAktif) {
      const inputEl = document.getElementById('modalJumlahBeli');
      const qtyBeli = parseInt(inputEl.value, 10) || 1;
      const sukses = tambahKeKeranjang(produkAktif.id, qtyBeli);
      if (sukses) {
        sessionStorage.setItem('itemCheckout', JSON.stringify([produkAktif.id]));
        window.location.href = NEXORA_PATHS.payment;
      }
    }
  };
  divAksi.appendChild(btnCart);
  divAksi.appendChild(btnBuy);
  divInfo.appendChild(h3);
  divInfo.appendChild(barisTerjual);
  divInfo.appendChild(pHarga);
  divInfo.appendChild(pDesk);
  divInfo.appendChild(judulSpek);
  divInfo.appendChild(dlSpek);
  divInfo.appendChild(divJumlahStok);
  divInfo.appendChild(divAksi);

  // Bungkus gambar + info dalam satu wadah yang bisa di-scroll,
  // supaya tombol tutup (X) tetap terlihat di pojok walau isinya panjang di layar kecil.
  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'modal-produk-scroll';
  scrollWrap.appendChild(divImg);
  scrollWrap.appendChild(divInfo);

  card.appendChild(btnTutup);
  card.appendChild(scrollWrap);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.onclick = function (e) {
    if (e.target === overlay) tutupModal();
  };
}
function bukaModal(p) {
  if (!p) return;
  pasangModalKeDOM();
  produkAktif = p;
  const imgEl = document.getElementById('modalProdukGambar');
  if (imgEl) {
    imgEl.src = p.gambar || 'https://dummyimage.com/600x600/e2e8f0/0f172a.png&text=Produk+Nexora';
    imgEl.alt = p.nama || 'Produk';
  }
  const namaEl = document.getElementById('modalProdukNama');
  if (namaEl) namaEl.textContent = p.nama || 'Produk Tanpa Nama';
  const hargaEl = document.getElementById('modalProdukHarga');
  if (hargaEl) hargaEl.textContent = formatRupiah(p.harga || 0);
  const deskEl = document.getElementById('modalProdukDeskripsi');
  if (deskEl)
    deskEl.textContent = p.deskripsi || 'Produk original berkualitas dari kurasi Nexora Market.';
  const badgeTerjual = document.getElementById('modalProdukTerjual');
  if (badgeTerjual) badgeTerjual.textContent = '🔥 ' + ambilTerjual(p) + ' Terjual';
  const badgeKategori = document.getElementById('modalProdukKategori');
  if (badgeKategori)
    badgeKategori.textContent = 'Kategori: ' + (p.kategori || 'Umum').toUpperCase();
  const stokVal = ambilStok(p);
  const stokEl = document.getElementById('modalProdukStok');
  if (stokEl) stokEl.textContent = 'Tersisa ' + stokVal + ' buah';
  const inputQty = document.getElementById('modalJumlahBeli');
  if (inputQty) inputQty.value = '1';
  const spekEl = document.getElementById('modalProdukSpek');
  if (spekEl) {
    spekEl.replaceChildren();
    const dataSpek = {};
    if (p.spesifikasi && typeof p.spesifikasi === 'object') Object.assign(dataSpek, p.spesifikasi);
    if (p.bahan && !dataSpek.bahan) dataSpek.bahan = p.bahan;
    if (p.ukuran && !dataSpek.ukuran) dataSpek.ukuran = p.ukuran;
    if (p.berat && !dataSpek.berat) dataSpek.berat = p.berat;
    if (p.kota && !dataSpek.kota) dataSpek.kota = p.kota;
    const blacklistedKeys = [
      'id',
      'nama',
      'harga',
      'gambar',
      'deskripsi',
      'kategori',
      'stok',
      'terjual'
    ];
    const labelMap = {
      bahan: 'Bahan Material',
      ukuran: 'Dimensi / Ukuran',
      berat: 'Berat Produk',
      kota: 'Kota Pengiriman',
      warna: 'Varian Warna',
      isi: 'Isi Paket',
      garansi: 'Masa Garansi'
    };
    let adaSpek = false;
    Object.keys(dataSpek).forEach(function (key) {
      if (blacklistedKeys.includes(key.toLowerCase())) return;
      const nilai = dataSpek[key];
      if (nilai !== undefined && nilai !== null && String(nilai).trim() !== '') {
        adaSpek = true;
        const dt = document.createElement('dt');
        dt.textContent = labelMap[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1);
        const dd = document.createElement('dd');
        dd.textContent = String(nilai);
        spekEl.appendChild(dt);
        spekEl.appendChild(dd);
      }
    });
    if (!adaSpek) {
      const dt = document.createElement('dt');
      dt.textContent = 'Kondisi';
      const dd = document.createElement('dd');
      dd.textContent = '100% Baru & Original';
      spekEl.appendChild(dt);
      spekEl.appendChild(dd);
    }
  }
  const overlay = document.getElementById('modalProduk');
  if (overlay) overlay.hidden = false;
}
function tutupModal() {
  const overlay = document.getElementById('modalProduk');
  if (overlay) overlay.hidden = true;
}
function ubahJumlahModal(delta) {
  const el = document.getElementById('modalJumlahBeli');
  if (!el) return;
  let val = (parseInt(el.value, 10) || 1) + delta;
  const stokTersedia = ambilStok(produkAktif);
  if (val < 1) val = 1;
  if (val > stokTersedia) {
    val = stokTersedia;
    tampilkanNotifikasi('Batas pembelian adalah sisa stok (' + stokTersedia + ' pcs)', 'error');
  }
  el.value = val;
}
function initKlikProduk() {
  document.querySelectorAll('.container-sec[data-id]').forEach(function (kartu) {
    kartu.onclick = function () {
      const p = cariProdukById(kartu.dataset.id);
      if (p) bukaModal(p);
    };
  });
}

/* ---------- 6. KERANJANG STORAGE & RENDER (DOM API) ---------- */
function getKeranjangKey() {
  const email = localStorage.getItem('emailLogin');
  return email ? 'keranjang_' + email : 'nexoraKeranjang_guest';
}
function ambilKeranjang() {
  try {
    const data = JSON.parse(localStorage.getItem(getKeranjangKey()));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}
function simpanKeranjang(daftar) {
  localStorage.setItem(getKeranjangKey(), JSON.stringify(daftar));
  perbaruiBadgeKeranjang();
}
function tambahKeKeranjang(idProduk, jumlah = 1) {
  const p = cariProdukById(idProduk);
  const stokTersedia = ambilStok(p);
  if (stokTersedia <= 0) {
    tampilkanNotifikasi('Maaf, stok produk ini sudah habis!', 'error');
    return false;
  }
  const daftar = ambilKeranjang();
  const item = daftar.find(function (i) {
    return String(i.id) === String(idProduk);
  });
  if (item) {
    if (item.qty + jumlah > stokTersedia) {
      tampilkanNotifikasi('Stok tidak mencukupi! Sisa stok: ' + stokTersedia, 'error');
      return false;
    }
    item.qty += jumlah;
  } else {
    if (jumlah > stokTersedia) {
      tampilkanNotifikasi('Stok tidak mencukupi! Sisa stok: ' + stokTersedia, 'error');
      return false;
    }
    daftar.push({
      id: idProduk,
      qty: jumlah
    });
  }
  simpanKeranjang(daftar);
  return true;
}
function ubahJumlahKeranjang(idProduk, jumlah) {
  const p = cariProdukById(idProduk);
  const stokTersedia = ambilStok(p);
  let daftar = ambilKeranjang();
  if (jumlah <= 0) {
    daftar = daftar.filter(function (i) {
      return String(i.id) !== String(idProduk);
    });
  } else {
    if (jumlah > stokTersedia) {
      tampilkanNotifikasi('Maksimal pembelian ' + stokTersedia + ' pcs', 'error');
      return;
    }
    const item = daftar.find(function (i) {
      return String(i.id) === String(idProduk);
    });
    if (item) item.qty = jumlah;
  }
  simpanKeranjang(daftar);
}
function hapusDariKeranjang(idProduk) {
  simpanKeranjang(
    ambilKeranjang().filter(function (i) {
      return String(i.id) !== String(idProduk);
    })
  );
}
function kosongkanKeranjang() {
  simpanKeranjang([]);
}
function ambilDetailKeranjang() {
  return ambilKeranjang()
    .map(function (item) {
      const p = cariProdukById(item.id);
      if (!p) return null;
      return Object.assign({}, p, {
        qty: item.qty,
        subtotal: p.harga * item.qty
      });
    })
    .filter(Boolean);
}
function perbaruiBadgeKeranjang() {
  const total = ambilKeranjang().reduce(function (t, i) {
    return t + i.qty;
  }, 0);
  document.querySelectorAll('.badge-keranjang').forEach(function (b) {
    b.textContent = total;
    b.hidden = total === 0;
  });
}
function renderKeranjang() {
  const daftarEl = document.getElementById('daftarKeranjang');
  const kosongEl = document.getElementById('keranjangKosong');
  const layoutEl = document.getElementById('keranjangLayout');
  if (!daftarEl) return;
  if (!PRODUK || PRODUK.length === 0) {
    const dataLokal = ambilDataProdukDariStorage();
    if (dataLokal && dataLokal.length > 0) PRODUK = dataLokal;
  }
  const detail = ambilDetailKeranjang();
  daftarEl.replaceChildren();
  if (detail.length === 0) {
    if (kosongEl) kosongEl.hidden = false;
    if (layoutEl) layoutEl.hidden = true;
    return;
  }
  if (kosongEl) kosongEl.hidden = true;
  if (layoutEl) layoutEl.hidden = false;
  detail.forEach(function (item) {
    const card = document.createElement('div');
    card.className = 'item-keranjang-card';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'ceklis-item';
    chk.dataset.id = item.id;
    // Item baru default tercentang; item yang sudah ada pakai status centang terakhir
    if (!(item.id in statusCeklisKeranjang)) {
      statusCeklisKeranjang[item.id] = true;
    }
    chk.checked = statusCeklisKeranjang[item.id];
    const detailDiv = document.createElement('div');
    detailDiv.className = 'item-cart-detail';
    const img = document.createElement('img');
    img.src = item.gambar || 'https://dummyimage.com/100x100/e2e8f0/0f172a.png&text=Item';
    const h4 = document.createElement('h4');
    h4.textContent = item.nama;
    detailDiv.appendChild(img);
    detailDiv.appendChild(h4);
    const pHarga = document.createElement('div');
    pHarga.textContent = formatRupiah(item.harga);
    const stepper = document.createElement('div');
    stepper.className = 'stepper-cart';
    const btnMin = document.createElement('button');
    btnMin.type = 'button';
    btnMin.textContent = '−';
    btnMin.onclick = function () {
      ubahJumlahKeranjang(item.id, item.qty - 1);
      renderKeranjang();
    };
    const inputQty = document.createElement('input');
    inputQty.type = 'text';
    inputQty.className = 'input-cart-qty';
    inputQty.value = item.qty;
    inputQty.autocomplete = 'off';
    inputQty.addEventListener('input', function () {
      inputQty.value = inputQty.value.replace(/[^0-9]/g, '');
      let val = parseInt(inputQty.value, 10);
      const p = cariProdukById(item.id);
      const stokTersedia = ambilStok(p);
      if (!isNaN(val)) {
        if (val > stokTersedia) {
          inputQty.value = stokTersedia;
          val = stokTersedia;
          tampilkanNotifikasi('Maksimal pembelian ' + stokTersedia + ' pcs', 'error');
        }
        if (val >= 1) {
          ubahJumlahKeranjang(item.id, val);
          hitungTotalTerpilih();
          pSubtotal.textContent = formatRupiah(item.harga * val);
        }
      }
    });
    inputQty.addEventListener('blur', function () {
      let val = parseInt(inputQty.value, 10);
      if (isNaN(val) || val < 1) {
        ubahJumlahKeranjang(item.id, 1);
        renderKeranjang();
      }
    });
    const btnPlus = document.createElement('button');
    btnPlus.type = 'button';
    btnPlus.textContent = '+';
    btnPlus.onclick = function () {
      ubahJumlahKeranjang(item.id, item.qty + 1);
      renderKeranjang();
    };
    stepper.appendChild(btnMin);
    stepper.appendChild(inputQty);
    stepper.appendChild(btnPlus);
    const pSubtotal = document.createElement('div');
    pSubtotal.className = 'subtotal-cart';
    pSubtotal.textContent = formatRupiah(item.subtotal);
    const btnHapus = document.createElement('button');
    btnHapus.className = 'btn-item-hapus';
    btnHapus.type = 'button';
    btnHapus.textContent = 'Hapus';
    btnHapus.onclick = function () {
      hapusDariKeranjang(item.id);
      delete statusCeklisKeranjang[item.id];
      renderKeranjang();
      tampilkanNotifikasi('Barang dihapus dari keranjang', 'error');
    };
    card.appendChild(chk);
    card.appendChild(detailDiv);
    card.appendChild(pHarga);
    card.appendChild(stepper);
    card.appendChild(pSubtotal);
    card.appendChild(btnHapus);
    daftarEl.appendChild(card);
  });
  hitungTotalTerpilih();
  pasangEventKeranjang();
}
function pasangEventKeranjang() {
  document.querySelectorAll('#daftarKeranjang .ceklis-item').forEach(function (chk) {
    chk.onchange = function () {
      statusCeklisKeranjang[chk.dataset.id] = chk.checked;
      hitungTotalTerpilih();
      perbaruiStatusCheckSemua();
    };
  });
  const checkSemua = document.getElementById('checkSemua');
  if (checkSemua) {
    checkSemua.onchange = function () {
      document.querySelectorAll('#daftarKeranjang .ceklis-item').forEach(function (c) {
        c.checked = checkSemua.checked;
        statusCeklisKeranjang[c.dataset.id] = checkSemua.checked;
      });
      hitungTotalTerpilih();
    };
  }
  const btnKosongkan = document.getElementById('btnKosongkan');
  if (btnKosongkan) {
    btnKosongkan.onclick = function () {
      if (confirm('Kosongkan semua barang di keranjang?')) {
        kosongkanKeranjang();
        statusCeklisKeranjang = {};
        renderKeranjang();
        tampilkanNotifikasi('Keranjang telah dikosongkan', 'sukses');
      }
    };
  }
  const btnCheckout = document.getElementById('btnCheckout');
  if (btnCheckout) {
    btnCheckout.onclick = function () {
      const terpilih = [];
      document.querySelectorAll('#daftarKeranjang .ceklis-item:checked').forEach(function (c) {
        return terpilih.push(c.dataset.id);
      });
      if (terpilih.length === 0) return tampilkanNotifikasi('Pilih minimal satu produk!', 'error');
      sessionStorage.setItem('itemCheckout', JSON.stringify(terpilih));
      window.location.href = NEXORA_PATHS.payment;
    };
  }
  perbaruiStatusCheckSemua();
}

// Menyalakan/mematikan master checkbox "Ceklis Semua" berdasarkan status tiap item saat ini
function perbaruiStatusCheckSemua() {
  const checkSemua = document.getElementById('checkSemua');
  if (!checkSemua) return;
  const semuaItem = document.querySelectorAll('#daftarKeranjang .ceklis-item');
  if (semuaItem.length === 0) {
    checkSemua.checked = false;
    return;
  }
  checkSemua.checked = Array.from(semuaItem).every(function (c) {
    return c.checked;
  });
}
function hitungTotalTerpilih() {
  let totalHarga = 0;
  let totalItem = 0;
  const detail = ambilDetailKeranjang();
  document.querySelectorAll('#daftarKeranjang .ceklis-item:checked').forEach(function (c) {
    const item = detail.find(function (i) {
      return String(i.id) === String(c.dataset.id);
    });
    if (item) {
      totalHarga += item.subtotal;
      totalItem += item.qty;
    }
  });
  const elItem = document.getElementById('ringkasanTotalItem');
  const elHarga = document.getElementById('ringkasanTotalHarga');
  if (elItem) elItem.textContent = totalItem;
  if (elHarga) elHarga.textContent = formatRupiah(totalHarga);
}

/* ---------- 7. RIWAYAT PESANAN & PROFIL (DOM API) ---------- */
function getRiwayatKey() {
  const email = localStorage.getItem('emailLogin');
  return email ? 'riwayat_pesanan_' + email : 'riwayat_pesanan_guest';
}
function simpanRiwayatPesanan(pesananBaru) {
  const key = getRiwayatKey();
  let riwayat = JSON.parse(localStorage.getItem(key)) || [];
  riwayat.unshift(pesananBaru);
  localStorage.setItem(key, JSON.stringify(riwayat));
}
function ambilRiwayatPesanan() {
  try {
    return JSON.parse(localStorage.getItem(getRiwayatKey())) || [];
  } catch (e) {
    return [];
  }
}
function renderRiwayatPesanan() {
  const wadah = document.getElementById('wadahDaftarRiwayat');
  if (!wadah) return;
  const semuaDaftar = ambilRiwayatPesanan();
  wadah.replaceChildren();
  if (semuaDaftar.length === 0) {
    const p = document.createElement('div');
    p.className = 'riwayat-kosong';
    p.textContent = 'Belum ada riwayat pesanan. Mulai belanja produk favoritmu sekarang!';
    wadah.appendChild(p);
    renderPaginasiRiwayat(0, 0);
    return;
  }
  const totalHalaman = Math.ceil(semuaDaftar.length / RIWAYAT_PER_HALAMAN);
  if (halamanAktifRiwayat > totalHalaman) halamanAktifRiwayat = totalHalaman;
  if (halamanAktifRiwayat < 1) halamanAktifRiwayat = 1;
  const awal = (halamanAktifRiwayat - 1) * RIWAYAT_PER_HALAMAN;
  const daftar = semuaDaftar.slice(awal, awal + RIWAYAT_PER_HALAMAN);
  daftar.forEach(function (order) {
    const card = document.createElement('div');
    card.className = 'kartu-riwayat-item';

    // Bagian Atas Kartu
    const top = document.createElement('div');
    top.className = 'kartu-riwayat-top';
    const noPesananLabel = document.createElement('span');
    const strongNo = document.createElement('strong');
    strongNo.textContent = 'No. Pesanan: ';
    const textNo = document.createTextNode(order.noPesanan + ' • ');
    const spanTgl = document.createElement('span');
    spanTgl.className = 'text-muted';
    spanTgl.textContent = order.tanggal;
    noPesananLabel.appendChild(strongNo);
    noPesananLabel.appendChild(textNo);
    noPesananLabel.appendChild(spanTgl);
    const badge = document.createElement('span');
    badge.className = 'status-badge-selesai';
    badge.textContent = 'Selesai Dibayar';
    top.appendChild(noPesananLabel);
    top.appendChild(badge);
    card.appendChild(top);

    // List Produk Pesanan
    order.items.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'riwayat-produk-baris';
      const img = document.createElement('img');
      img.src = item.gambar || 'https://dummyimage.com/100x100/e2e8f0/0f172a.png&text=Nexora';
      const info = document.createElement('div');
      info.className = 'riwayat-produk-info';
      const h4 = document.createElement('h4');
      h4.textContent = item.nama;
      const span = document.createElement('span');
      span.textContent = item.qty + ' pcs x ' + formatRupiah(item.harga);
      info.appendChild(h4);
      info.appendChild(span);
      row.appendChild(img);
      row.appendChild(info);
      card.appendChild(row);
    });

    // Bagian Bawah Kartu
    const bottom = document.createElement('div');
    bottom.className = 'kartu-riwayat-bottom';
    const metode = document.createElement('span');
    metode.textContent = 'Metode: ' + order.metodeBayar;
    if (order.kodeKupon && order.diskon) {
      metode.textContent +=
        ' • Kupon: ' + order.kodeKupon + ' (-' + formatRupiah(order.diskon) + ')';
    }
    const totalWrap = document.createElement('div');
    const textTotal = document.createTextNode('Total Belanja: ');
    const strongTotal = document.createElement('strong');
    strongTotal.textContent = formatRupiah(order.totalBayar);
    totalWrap.appendChild(textTotal);
    totalWrap.appendChild(strongTotal);
    bottom.appendChild(metode);
    bottom.appendChild(totalWrap);
    card.appendChild(bottom);
    wadah.appendChild(card);
  });
  renderPaginasiRiwayat(totalHalaman, semuaDaftar.length);
}

// Membuat tombol-tombol navigasi halaman untuk riwayat pesanan (5 pesanan per halaman)
function renderPaginasiRiwayat(totalHalaman, totalRiwayat) {
  const wadahPaginasi = document.getElementById('paginasiRiwayat');
  if (!wadahPaginasi) return;
  wadahPaginasi.replaceChildren();
  if (totalRiwayat === 0 || totalHalaman <= 1) return;
  const buatTombol = function (label, tujuan, aktif = false, nonaktif = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-halaman ' + (aktif ? 'aktif' : '');
    btn.textContent = label;
    btn.disabled = nonaktif;
    btn.onclick = function () {
      halamanAktifRiwayat = tujuan;
      renderRiwayatPesanan();
      wadahPaginasi.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    };
    return btn;
  };
  const buatElipsis = function () {
    const span = document.createElement('span');
    span.className = 'elipsis-halaman';
    span.textContent = '…';
    return span;
  };

  wadahPaginasi.appendChild(
    buatTombol('‹', halamanAktifRiwayat - 1, false, halamanAktifRiwayat === 1)
  );

  const { awal, akhir } = hitungJendelaHalaman(halamanAktifRiwayat, totalHalaman, MAKS_TOMBOL_HALAMAN);

  if (awal > 1) {
    wadahPaginasi.appendChild(buatTombol('1', 1, halamanAktifRiwayat === 1));
    if (awal > 2) wadahPaginasi.appendChild(buatElipsis());
  }

  for (let i = awal; i <= akhir; i++) {
    wadahPaginasi.appendChild(buatTombol(String(i), i, i === halamanAktifRiwayat));
  }

  if (akhir < totalHalaman) {
    if (akhir < totalHalaman - 1) wadahPaginasi.appendChild(buatElipsis());
    wadahPaginasi.appendChild(
      buatTombol(String(totalHalaman), totalHalaman, halamanAktifRiwayat === totalHalaman)
    );
  }

  wadahPaginasi.appendChild(
    buatTombol('›', halamanAktifRiwayat + 1, false, halamanAktifRiwayat === totalHalaman)
  );
}
function initProfile() {
  const formProfile = document.getElementById('formProfile');
  if (!formProfile) return;
  const emailLogin = localStorage.getItem('emailLogin');
  let users = JSON.parse(localStorage.getItem('nexoraUsers')) || [];
  const userIndex = users.findIndex(function (u) {
    return u.email === emailLogin;
  });
  if (userIndex === -1) return;
  const user = users[userIndex];
  document.getElementById('profNama').value = user.nama || '';
  document.getElementById('profEmail').value = user.email || '';
  document.getElementById('profUmur').value = user.umur || '';
  document.getElementById('profTanggalLahir').value = user.tanggalLahir || '';
  document.getElementById('profGender').value = user.jenisKelamin || '';
  document.getElementById('profNoHp').value = user.noHp || '';
  document.getElementById('profProvinsi').value = user.provinsi || '';
  document.getElementById('profKota').value = user.kota || '';
  document.getElementById('profKecamatan').value = user.kecamatan || '';
  document.getElementById('profKodePos').value = user.kodePos || '';
  document.getElementById('profAlamat').value = user.alamat || '';

  // Kode Pos hanya menerima angka
  const profKodePosEl = document.getElementById('profKodePos');
  if (profKodePosEl) {
    profKodePosEl.addEventListener('input', function () {
      profKodePosEl.value = profKodePosEl.value.replace(/[^0-9]/g, '').slice(0, 5);
    });
  }
  const sbNama = document.getElementById('sidebarNamaUser');
  if (sbNama) sbNama.textContent = user.nama || 'Pengguna';
  const btnEdit = document.getElementById('btnEditProfile');
  const btnSimpan = document.getElementById('btnSimpanProfile');
  const inputs = formProfile.querySelectorAll('input:not(#profEmail), select, textarea');
  if (btnEdit && btnSimpan) {
    btnEdit.onclick = function () {
      inputs.forEach(function (el) {
        return (el.disabled = false);
      });
      btnEdit.hidden = true;
      btnSimpan.hidden = false;
    };
    formProfile.onsubmit = function (e) {
      e.preventDefault();
      users[userIndex].nama = document.getElementById('profNama').value.trim();
      users[userIndex].umur = document.getElementById('profUmur').value;
      users[userIndex].tanggalLahir = document.getElementById('profTanggalLahir').value;
      users[userIndex].jenisKelamin = document.getElementById('profGender').value;
      users[userIndex].noHp = document.getElementById('profNoHp').value.trim();
      users[userIndex].provinsi = document.getElementById('profProvinsi').value.trim();
      users[userIndex].kota = document.getElementById('profKota').value.trim();
      users[userIndex].kecamatan = document.getElementById('profKecamatan').value.trim();
      users[userIndex].kodePos = document.getElementById('profKodePos').value.trim();
      users[userIndex].alamat = document.getElementById('profAlamat').value.trim();
      localStorage.setItem('nexoraUsers', JSON.stringify(users));
      localStorage.setItem('namaLogin', users[userIndex].nama);
      tampilkanNotifikasi('Profil berhasil diperbarui!', 'sukses');
      inputs.forEach(function (el) {
        return (el.disabled = true);
      });
      btnEdit.hidden = false;
      btnSimpan.hidden = true;
      if (sbNama) sbNama.textContent = users[userIndex].nama;
      initAuthNav();
    };
  }
  const tabAkunBtn = document.getElementById('tabAkunBtn');
  const tabPesananBtn = document.getElementById('tabPesananBtn');
  const tabAkun = document.getElementById('tabPengaturanAkun');
  const tabPesanan = document.getElementById('tabRiwayatPesanan');
  if (tabAkunBtn && tabPesananBtn && tabAkun && tabPesanan) {
    tabAkunBtn.onclick = function () {
      tabAkunBtn.classList.add('active');
      tabPesananBtn.classList.remove('active');
      tabAkun.hidden = false;
      tabPesanan.hidden = true;
    };
    tabPesananBtn.onclick = function () {
      tabPesananBtn.classList.add('active');
      tabAkunBtn.classList.remove('active');
      tabAkun.hidden = true;
      tabPesanan.hidden = false;
      halamanAktifRiwayat = 1;
      renderRiwayatPesanan();
    };
  }
  const btnKeluar = document.getElementById('btnKeluarAkun');
  if (btnKeluar) {
    btnKeluar.onclick = function () {
      if (confirm('Apakah kamu yakin ingin keluar dari akun?')) {
        ['isLoggedIn', 'namaLogin', 'authToken', 'emailLogin'].forEach(function (k) {
          return localStorage.removeItem(k);
        });
        window.location.href = NEXORA_PATHS.home;
      }
    };
  }
}

/* ---------- 8. AUTHENTICATION CONTROLLER ---------- */
function hitungUsiaDariTanggal(tglLahirStr) {
  const tglLahir = new Date(tglLahirStr);
  const tglSekarang = new Date();
  let usia = tglSekarang.getFullYear() - tglLahir.getFullYear();
  const selisihBulan = tglSekarang.getMonth() - tglLahir.getMonth();
  if (selisihBulan < 0 || (selisihBulan === 0 && tglSekarang.getDate() < tglLahir.getDate()))
    usia--;
  return usia;
}
function initTogglePassword() {
  document.querySelectorAll('.btn-toggle-pwd').forEach(function (btn) {
    btn.onclick = function () {
      const targetId = this.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '🙈';
      } else {
        input.type = 'password';
        this.textContent = '👁️';
      }
    };
  });
}
function initAuthForms() {
  initTogglePassword();
  const inputTgl = document.getElementById('regTanggalLahir');
  const inputUmur = document.getElementById('regUmur');
  if (inputTgl && inputUmur) {
    inputTgl.addEventListener('change', function () {
      if (inputTgl.value) {
        const usiaHitung = hitungUsiaDariTanggal(inputTgl.value);
        if (usiaHitung >= 0) inputUmur.value = usiaHitung;
      }
    });
  }
  const formDaftar = document.querySelector('.form-daftar form');
  if (formDaftar) {
    formDaftar.addEventListener('submit', function (e) {
      e.preventDefault();
      const nama = document.getElementById('regNama').value.trim();
      const email = document.getElementById('regEmail').value.trim().toLowerCase();
      const password = document.getElementById('regPassword').value;
      const umur = parseInt(document.getElementById('regUmur').value, 10);
      const tanggalLahir = document.getElementById('regTanggalLahir').value;
      const jenisKelamin = document.getElementById('regGender').value;
      if (nama.length < 3) return tampilkanNotifikasi('Nama lengkap minimal 3 karakter!', 'error');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return tampilkanNotifikasi('Format email tidak valid!', 'error');
      if (password.length < 8)
        return tampilkanNotifikasi('Kata sandi minimal 8 karakter!', 'error');
      if (!tanggalLahir) return tampilkanNotifikasi('Tanggal lahir wajib diisi!', 'error');
      const tglInput = new Date(tanggalLahir);
      const tglHariIni = new Date();
      tglHariIni.setHours(0, 0, 0, 0);
      if (tglInput > tglHariIni)
        return tampilkanNotifikasi('Tanggal lahir tidak boleh di masa depan!', 'error');
      const usiaSebenarnya = hitungUsiaDariTanggal(tanggalLahir);
      if (umur !== usiaSebenarnya) {
        return tampilkanNotifikasi(
          'Usia (' + umur + ' thn) tidak cocok dengan tanggal lahir!',
          'error'
        );
      }
      let users = JSON.parse(localStorage.getItem('nexoraUsers')) || [];
      const emailSudahAda = users.some(function (u) {
        return u.email.toLowerCase() === email;
      });
      if (emailSudahAda)
        return tampilkanNotifikasi('Email ini sudah terdaftar! Gunakan email lain.', 'error');
      users.push({
        nama: nama,
        email: email,
        password: password,
        umur: umur,
        tanggalLahir: tanggalLahir,
        jenisKelamin: jenisKelamin
      });
      localStorage.setItem('nexoraUsers', JSON.stringify(users));
      tampilkanNotifikasi('Pendaftaran berhasil! Silakan masuk ke akunmu.', 'sukses');
      formDaftar.reset();
      const saklar = document.getElementById('saklar-form');
      if (saklar) saklar.checked = false;
    });
  }
  const formMasuk = document.querySelector('.form-masuk form');
  if (formMasuk) {
    formMasuk.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value;
      let users = JSON.parse(localStorage.getItem('nexoraUsers')) || [];
      const user = users.find(function (u) {
        return u.email.toLowerCase() === email;
      });
      if (!user) return tampilkanNotifikasi('Email belum terdaftar! Silakan daftar akun.', 'error');
      if (user.password !== password) return tampilkanNotifikasi('Kata sandi salah!', 'error');
      localStorage.setItem('authToken', 'token-dummy-123');
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('namaLogin', user.nama);
      localStorage.setItem('emailLogin', user.email);
      tampilkanNotifikasi('Login berhasil! Mengalihkan...', 'sukses');
      setTimeout(function () {
        window.location.href = NEXORA_PATHS.shop;
      }, 700);
    });
  }
}
function initAuthNav() {
  const greetAreas = document.querySelectorAll('.js-greeting-area');
  const profileLinks = document.querySelectorAll('.js-nav-profile');
  const authLinks = document.querySelectorAll('.js-nav-auth');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const nama = localStorage.getItem('namaLogin');
  const pathName = window.location.pathname;
  const isGuestIndex =
    (pathName.endsWith('index.html') || pathName.endsWith('/')) && !pathName.includes('/html/');
  if (isLoggedIn && isGuestIndex) {
    window.location.href = NEXORA_PATHS.shop;
    return;
  }
  document
    .querySelectorAll('.brand-logo-nexora, #linkBeranda, .link-beranda')
    .forEach(function (link) {
      link.setAttribute('href', isLoggedIn ? NEXORA_PATHS.shop : NEXORA_PATHS.home);
    });
  if (isLoggedIn) {
    greetAreas.forEach(function (greetArea) {
      greetArea.textContent = 'Hai, ' + (nama ? nama.split(' ')[0] : 'Pengguna');
      greetArea.hidden = false;
    });
    profileLinks.forEach(function (link) {
      link.hidden = false;
    });
    authLinks.forEach(function (authLink) {
      authLink.textContent = 'Keluar';
      authLink.href = '#';
      authLink.onclick = function (e) {
        e.preventDefault();
        ['isLoggedIn', 'namaLogin', 'authToken', 'emailLogin'].forEach(function (k) {
          return localStorage.removeItem(k);
        });
        window.location.href = NEXORA_PATHS.home;
      };
    });
  } else {
    greetAreas.forEach(function (g) {
      return (g.hidden = true);
    });
    profileLinks.forEach(function (l) {
      return (l.hidden = true);
    });
    authLinks.forEach(function (l) {
      return (l.hidden = false);
    });
  }
}

/* ---------- MENU HAMBURGER MOBILE ---------- */
function initMenuMobile() {
  const btnMenu = document.getElementById('btnMenuMobile');
  const dropdown = document.getElementById('menuMobileDropdown');
  if (!btnMenu || !dropdown) return;
  btnMenu.onclick = function () {
    dropdown.hidden = !dropdown.hidden;
    btnMenu.classList.toggle('terbuka', !dropdown.hidden);
    btnMenu.setAttribute('aria-expanded', String(!dropdown.hidden));
  };

  // Tutup menu otomatis kalau salah satu link di dalamnya diklik
  dropdown.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      dropdown.hidden = true;
      btnMenu.classList.remove('terbuka');
      btnMenu.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- 9. DARK/LIGHT THEME CONTROLLER ---------- */
function inisialisasiTema() {
  const temaTersimpan = localStorage.getItem('nexora_theme') || 'light';
  document.documentElement.setAttribute('data-theme', temaTersimpan);
  perbaruiIkonTema(temaTersimpan);
}
function gantiTema() {
  const temaSekarang = document.documentElement.getAttribute('data-theme') || 'light';
  const temaBaru = temaSekarang === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', temaBaru);
  localStorage.setItem('nexora_theme', temaBaru);
  perbaruiIkonTema(temaBaru);
  tampilkanNotifikasi(
    'Beralih ke mode ' + (temaBaru === 'dark' ? 'Gelap (Dark)' : 'Terang (Light)'),
    'info'
  );
}
function perbaruiIkonTema(tema) {
  document.querySelectorAll('.btn-toggle-theme').forEach(function (btn) {
    btn.textContent = tema === 'dark' ? '☀️' : '🌙';
    btn.title = tema === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap';
  });
}
function pasangTombolTema() {
  document.querySelectorAll('.btn-toggle-theme').forEach(function (btn) {
    btn.onclick = gantiTema;
  });
}

// Merender strip voucher yang bisa digeser di index.html, diambil dari data kupon API
function renderVoucherIndex() {
  const wadah = document.getElementById('wadahVoucherIndex');
  if (!wadah) return;
  wadah.replaceChildren();
  if (!KUPON_LIST || KUPON_LIST.length === 0) {
    wadah.closest('.voucher-section').hidden = true;
    return;
  }
  const ikonTipe = {
    persen: '%',
    nominal: 'Rp',
    ongkir: '🚚'
  };
  KUPON_LIST.forEach(function (kupon) {
    const kartu = document.createElement('div');
    kartu.className = 'kartu-voucher';
    const kiri = document.createElement('div');
    kiri.className = 'kartu-voucher-kiri';
    kiri.textContent = ikonTipe[kupon.tipe] || '🎟️';
    const kanan = document.createElement('div');
    kanan.className = 'kartu-voucher-kanan';
    const kode = document.createElement('div');
    kode.className = 'kartu-voucher-kode';
    kode.textContent = kupon.kode;
    const desk = document.createElement('div');
    desk.className = 'kartu-voucher-desk';
    desk.textContent = kupon.deskripsi || '';
    const btnSalin = document.createElement('button');
    btnSalin.type = 'button';
    btnSalin.className = 'kartu-voucher-salin';
    btnSalin.textContent = 'Salin Kode';
    btnSalin.onclick = function () {
      navigator.clipboard
        .writeText(kupon.kode)
        .then(function () {
          tampilkanNotifikasi('Kode ' + kupon.kode + ' disalin!', 'sukses');
        })
        .catch(function () {
          tampilkanNotifikasi('Gagal menyalin kode, silakan salin manual.', 'error');
        });
    };
    kanan.appendChild(kode);
    kanan.appendChild(desk);
    kanan.appendChild(btnSalin);
    kartu.appendChild(kiri);
    kartu.appendChild(kanan);
    wadah.appendChild(kartu);
  });
}

/* ---------- 10. HALAMAN CHECKOUT PEMBAYARAN ---------- */

// Membuat kode referensi transaksi yang unik untuk setiap kali checkout
function buatKodeReferensiTransaksi() {
  const waktu = Date.now().toString(36).toUpperCase();
  const acak = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'NX-' + waktu + acak;
}

// Mengambil kupon yang sedang aktif diterapkan (tersimpan di sessionStorage)
function ambilKuponAktif() {
  try {
    const raw = sessionStorage.getItem('kuponAktif');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Menghitung berapa rupiah potongan dari kupon yang aktif, terhadap subtotal & ongkir saat ini
function hitungPotonganKupon(kupon, subtotal, ongkir) {
  if (!kupon) return 0;
  if (kupon.minBelanja && subtotal < kupon.minBelanja) return 0;
  let potongan = 0;
  if (kupon.tipe === 'persen') {
    potongan = Math.round(subtotal * (Number(kupon.nilai) / 100));
    if (kupon.maksPotongan) potongan = Math.min(potongan, kupon.maksPotongan);
  } else if (kupon.tipe === 'nominal') {
    potongan = Number(kupon.nilai) || 0;
  } else if (kupon.tipe === 'ongkir') {
    potongan = kupon.nilai > 0 ? Math.min(Number(kupon.nilai), ongkir) : ongkir;
  }
  return Math.max(0, Math.min(potongan, subtotal + ongkir));
}

// Menghitung ulang total tagihan item yang sedang di-checkout (subtotal + ongkir - diskon kupon)
// Ini menjadi SATU sumber kebenaran, dipakai oleh ringkasan pembayaran, modal QRIS, dan saat pesanan selesai.
function hitungTotalCheckoutSaatIni() {
  const ONGKIR = 12000;
  let idTerpilih = [];
  try {
    idTerpilih = JSON.parse(sessionStorage.getItem('itemCheckout')) || [];
  } catch (e) {}
  const detail = ambilDetailKeranjang().filter(function (item) {
    return idTerpilih.includes(String(item.id));
  });
  const subtotal = detail.reduce(function (sum, i) {
    return sum + i.subtotal;
  }, 0);
  const kuponAktif = ambilKuponAktif();
  const diskon = hitungPotonganKupon(kuponAktif, subtotal, ONGKIR);
  const total = Math.max(subtotal + ONGKIR - diskon, 0);
  return {
    subtotal: subtotal,
    ongkir: ONGKIR,
    diskon: diskon,
    kuponAktif: kuponAktif,
    total: total
  };
}

// Menyusun konten QR unik per transaksi, mereferensikan merchant tujuan dana (DANA)
// Dipakai sebagai CADANGAN saat endpoint backend tidak bisa diakses.
function bangunKontenQrisDemo(kodeRef, total) {
  return [
    'NEXORA-QRIS-DEMO',
    'MERCHANT:' + NEXORA_MERCHANT_QRIS.nama,
    'NMID:' + NEXORA_MERCHANT_QRIS.nmid,
    'TERHUBUNG:' + NEXORA_MERCHANT_QRIS.terhubungKe,
    'REF:' + kodeRef,
    'AMOUNT:' + total
  ].join('|');
}

// Palet warna QR (senada dengan backend) — dipilih otomatis dari kode referensi
// supaya QR tidak selalu hitam-putih monoton, tapi tetap kontras & bisa dipindai.
const PALET_WARNA_QR = ['2b1b3d', 'cc3814', 'c9134a', '0f7a44', '402955', '5b3b73'];
function pilihWarnaQr(kodeRef) {
  let hash = 0;
  for (let i = 0; i < kodeRef.length; i++) {
    hash = (hash * 31 + kodeRef.charCodeAt(i)) >>> 0;
  }
  return PALET_WARNA_QR[hash % PALET_WARNA_QR.length];
}

// Meminta gambar QR yang sudah digenerate di backend (api/generate-qris pada
// project Vercel nexora-api-one). Ini yang membuat kode QR beneran unik &
// nantinya bisa diganti backend-nya dengan panggilan ke PJSP resmi.
async function buatGambarQrisDariServer(kodeRef, total) {
  const response = await fetch('https://nexora-api-one.vercel.app/api/generate-qris', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref: kodeRef,
      total: total
    })
  });
  if (!response.ok) {
    throw new Error('Server QRIS merespons status ' + response.status);
  }
  const data = await response.json();
  if (!data || !data.qrImage) {
    throw new Error('Respons server tidak mengandung qrImage');
  }
  return data;
}
let _timerQrisInterval = null;
function mulaiCountdownQris(detikAwal, elTimer) {
  clearInterval(_timerQrisInterval);
  let sisa = detikAwal;
  const tampilkan = function () {
    const menit = Math.floor(Math.max(sisa, 0) / 60)
      .toString()
      .padStart(2, '0');
    const detik = Math.max(sisa, 0) % 60;
    const detikStr = detik.toString().padStart(2, '0');
    if (elTimer) elTimer.textContent = menit + ':' + detikStr;
    if (sisa <= 0) {
      clearInterval(_timerQrisInterval);
      return;
    }
    sisa--;
  };
  tampilkan();
  _timerQrisInterval = setInterval(tampilkan, 1000);
}
function renderRingkasanPembayaran() {
  const halamanEl = document.getElementById('halamanPembayaran');
  const kosongEl = document.getElementById('keranjangKosongBayar');
  if (!halamanEl) return;
  const detailAll = ambilDetailKeranjang();
  let idTerpilih = [];
  try {
    idTerpilih = JSON.parse(sessionStorage.getItem('itemCheckout')) || [];
  } catch (e) {}
  const detail = detailAll.filter(function (item) {
    return idTerpilih.includes(String(item.id));
  });
  if (detail.length === 0) {
    halamanEl.hidden = true;
    if (kosongEl) kosongEl.hidden = false;
    return;
  }
  halamanEl.hidden = false;
  if (kosongEl) kosongEl.hidden = true;
  const daftarEl = document.getElementById('daftarPesanan');
  if (daftarEl) {
    daftarEl.replaceChildren();
    let subtotal = 0;
    detail.forEach(function (item) {
      subtotal += item.subtotal;
      const baris = document.createElement('div');
      baris.className = 'baris-pesanan';
      const img = document.createElement('img');
      img.src = item.gambar || 'https://dummyimage.com/100x100/e2e8f0/0f172a.png&text=Nexora';
      const info = document.createElement('div');
      info.className = 'baris-pesanan-info';
      const pNama = document.createElement('p');
      pNama.className = 'nama-pesanan';
      pNama.textContent = item.nama;
      const pQty = document.createElement('p');
      pQty.className = 'qty-pesanan';
      pQty.textContent = item.qty + ' x ' + formatRupiah(item.harga);
      info.appendChild(pNama);
      info.appendChild(pQty);
      const spanSub = document.createElement('span');
      spanSub.className = 'subtotal-pesanan';
      spanSub.textContent = formatRupiah(item.subtotal);
      baris.appendChild(img);
      baris.appendChild(info);
      baris.appendChild(spanSub);
      daftarEl.appendChild(baris);
    });
    const hasilHitung = hitungTotalCheckoutSaatIni();
    const ONGKIR = hasilHitung.ongkir;
    const diskon = hasilHitung.diskon;
    const total = hasilHitung.total;
    const elSub = document.getElementById('pesananSubtotal');
    const elOngkir = document.getElementById('pesananOngkir');
    const elTot = document.getElementById('pesananTotal');
    const barisDiskon = document.getElementById('barisDiskon');
    const elDiskon = document.getElementById('pesananDiskon');
    if (elSub) elSub.textContent = formatRupiah(subtotal);
    if (elOngkir) elOngkir.textContent = formatRupiah(ONGKIR);
    if (elTot) elTot.textContent = formatRupiah(total);
    if (diskon > 0) {
      if (barisDiskon) barisDiskon.hidden = false;
      if (elDiskon) elDiskon.textContent = '-' + formatRupiah(diskon);
    } else {
      if (barisDiskon) barisDiskon.hidden = true;
    }
  }
}

/* =========================================================
   11. INITIALIZATION EVENT LISTENER (DOM CONTENT LOADED)
   ========================================================= */
document.addEventListener('DOMContentLoaded', function () {
  if (
    document.body.dataset.butuhLogin === 'true' &&
    localStorage.getItem('isLoggedIn') !== 'true'
  ) {
    window.location.href = NEXORA_PATHS.login;
    return;
  }
  inisialisasiTema();
  pasangTombolTema();
  initAuthNav();
  initAuthForms();
  initProfile();
  perbaruiBadgeKeranjang();
  muatDataProduk();
  initMenuMobile();

  // Handler Proteksi Tombol Keranjang
  const linkIkonKeranjang = document.querySelector('.tombol-keranjang');
  if (linkIkonKeranjang) {
    linkIkonKeranjang.addEventListener('click', function (e) {
      const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
      if (!isLoggedIn) {
        e.preventDefault();
        tampilkanNotifikasi('Silakan masuk akun terlebih dahulu untuk melihat keranjang!', 'error');
        setTimeout(function () {
          window.location.href = NEXORA_PATHS.login;
        }, 1000);
      } else {
        e.preventDefault();
        window.location.href = NEXORA_PATHS.cart;
      }
    });
  }

  // Filter Kategori Listener
  document.querySelectorAll('input[name="filter-kategori"]').forEach(function (r) {
    r.addEventListener('change', function () {
      halamanAktifProduk = 1;
      renderKatalog();
    });
  });

  // Sorting Tabs Listener
  document.querySelectorAll('.filter-tab-bar .tab-btn').forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll('.filter-tab-bar .tab-btn').forEach(function (b) {
        return b.classList.remove('active');
      });
      this.classList.add('active');
      sortAktif = this.dataset.sort || this.textContent.trim().toLowerCase();
      halamanAktifProduk = 1;
      renderKatalog();
    };
  });

  // Search Input Listener
  const inputCari = document.getElementById('inputPencarian');
  if (inputCari) {
    inputCari.oninput = function () {
      halamanAktifProduk = 1;
      renderKatalog();
    };
  }

  // FORM CHECKOUT PEMBAYARAN DAN MODAL LANJUTAN
  const formBayar = document.getElementById('formPembayaran');
  if (formBayar) {
    document.addEventListener('produkReady', renderRingkasanPembayaran);

    // Auto-Fill Data Profil saat form dimuat
    const emailLogin = localStorage.getItem('emailLogin');
    let users = JSON.parse(localStorage.getItem('nexoraUsers')) || [];
    const user = users.find(function (u) {
      return u.email === emailLogin;
    });

    // Elemen alamat pengiriman
    const elNama = document.getElementById('inputNamaPenerima');
    const elHp = document.getElementById('inputNoHp');
    const elProvinsi = document.getElementById('inputProvinsi');
    const elKota = document.getElementById('inputKota');
    const elKecamatan = document.getElementById('inputKecamatan');
    const elKodePosAlamat = document.getElementById('inputKodePos');
    const elAlamat = document.getElementById('inputAlamat');
    const btnEditAlamat = document.getElementById('btnEditAlamat');
    const semuaFieldAlamat = [
      elNama,
      elHp,
      elProvinsi,
      elKota,
      elKecamatan,
      elKodePosAlamat,
      elAlamat
    ].filter(Boolean);

    // Auto-Fill Data Alamat dari Profil saat form dimuat.
    // Kalau profil sudah punya alamat tersimpan, kunci field-nya dan
    // wajibkan pencet "Edit" dulu supaya tidak mengubah alamat tanpa sengaja.
    let punyaAlamatTersimpan = false;
    if (user) {
      if (elNama) elNama.value = user.nama || '';
      if (elHp) elHp.value = user.noHp || '';
      if (elProvinsi) elProvinsi.value = user.provinsi || '';
      if (elKota) elKota.value = user.kota || '';
      if (elKecamatan) elKecamatan.value = user.kecamatan || '';
      if (elKodePosAlamat) elKodePosAlamat.value = user.kodePos || '';
      if (elAlamat) elAlamat.value = user.alamat || '';
      punyaAlamatTersimpan = !!(user.alamat && user.alamat.trim().length > 0);
      if (punyaAlamatTersimpan) {
        semuaFieldAlamat.forEach(function (el) {
          el.disabled = true;
        });
        if (btnEditAlamat) btnEditAlamat.hidden = false;
      }
    }
    if (btnEditAlamat) {
      btnEditAlamat.onclick = function () {
        semuaFieldAlamat.forEach(function (el) {
          el.disabled = false;
        });
        btnEditAlamat.hidden = true;
      };
    }

    // Variabel elemen Modal Bayar Lanjutan
    const modalLanjutan = document.getElementById('modalBayarLanjutan');
    const wadahQrisLanjutan = document.getElementById('wadahQrisLanjutan');
    const gambarQrisLanjutan = document.getElementById('gambarQrisLanjutan');
    const qrisNominalEl = document.getElementById('qrisNominal');
    const qrisKodeRefEl = document.getElementById('qrisKodeRef');
    const qrisTimerEl = document.getElementById('qrisTimer');
    const qrisMerchantNamaEl = document.getElementById('qrisMerchantNama');
    const qrisMerchantNmidEl = document.getElementById('qrisMerchantNmid');
    const qrisMerchantTerhubungEl = document.getElementById('qrisMerchantTerhubung');
    const wadahEwalletLanjutan = document.getElementById('wadahEwalletLanjutan');
    const inputHpEwallet = document.getElementById('inputHpEwallet');
    const judulModalBayar = document.getElementById('judulModalBayar');

    // Validasi Kode Pos: hanya menerima angka
    if (elKodePosAlamat) {
      elKodePosAlamat.addEventListener('input', function () {
        elKodePosAlamat.value = elKodePosAlamat.value.replace(/[^0-9]/g, '').slice(0, 5);
      });
    }

    // ---------- FITUR KUPON ----------
    const inputKodeKupon = document.getElementById('inputKodeKupon');
    const btnTerapkanKupon = document.getElementById('btnTerapkanKupon');
    const wrapperInputKupon = document.getElementById('wrapperInputKupon');
    const kuponAktifInfo = document.getElementById('kuponAktifInfo');
    const teksKuponAktif = document.getElementById('teksKuponAktif');
    const btnHapusKupon = document.getElementById('btnHapusKupon');
    function tampilkanKuponAktifUI() {
      const kupon = ambilKuponAktif();
      if (kupon) {
        if (wrapperInputKupon) wrapperInputKupon.hidden = true;
        if (kuponAktifInfo) kuponAktifInfo.hidden = false;
        let infoPemakaian = '';
        if (user) {
          const sudahDipakai = (user.pemakaianKupon || {})[kupon.kode] || 0;
          infoPemakaian = ' (dipakai ' + sudahDipakai + '/3x)';
        }
        if (teksKuponAktif)
          teksKuponAktif.textContent =
            '🎟️ ' +
            kupon.kode +
            ' diterapkan' +
            (kupon.deskripsi ? ' — ' + kupon.deskripsi : '') +
            infoPemakaian;
      } else {
        if (wrapperInputKupon) wrapperInputKupon.hidden = false;
        if (kuponAktifInfo) kuponAktifInfo.hidden = true;
        if (inputKodeKupon) inputKodeKupon.value = '';
      }
    }
    if (btnTerapkanKupon) {
      btnTerapkanKupon.onclick = function () {
        const kodeInput = (inputKodeKupon.value || '').trim().toUpperCase();
        if (!kodeInput) return tampilkanNotifikasi('Masukkan kode kupon terlebih dahulu.', 'error');
        const kuponDitemukan = (KUPON_LIST || []).find(function (k) {
          return (k.kode || '').toUpperCase() === kodeInput;
        });
        if (!kuponDitemukan)
          return tampilkanNotifikasi(
            'Kode kupon tidak ditemukan atau sudah tidak berlaku.',
            'error'
          );

        // Batasi maksimal 3x pemakaian per akun untuk kode kupon yang sama
        const BATAS_PEMAKAIAN_KUPON = 3;
        if (user) {
          const pemakaianKupon = user.pemakaianKupon || {};
          const sudahDipakai = pemakaianKupon[kuponDitemukan.kode] || 0;
          if (sudahDipakai >= BATAS_PEMAKAIAN_KUPON) {
            return tampilkanNotifikasi(
              'Kamu sudah memakai kupon ' +
                kuponDitemukan.kode +
                ' sebanyak ' +
                BATAS_PEMAKAIAN_KUPON +
                'x, sudah mencapai batas maksimal.',
              'error'
            );
          }
        }
        const subtotal = hitungTotalCheckoutSaatIni().subtotal;
        if (kuponDitemukan.minBelanja && subtotal < kuponDitemukan.minBelanja) {
          return tampilkanNotifikasi(
            'Kupon ini butuh minimal belanja ' + formatRupiah(kuponDitemukan.minBelanja) + '.',
            'error'
          );
        }
        sessionStorage.setItem('kuponAktif', JSON.stringify(kuponDitemukan));
        tampilkanNotifikasi('Kupon ' + kuponDitemukan.kode + ' berhasil diterapkan!', 'sukses');
        tampilkanKuponAktifUI();
        renderRingkasanPembayaran();
      };
    }
    if (btnHapusKupon) {
      btnHapusKupon.onclick = function () {
        sessionStorage.removeItem('kuponAktif');
        tampilkanKuponAktifUI();
        renderRingkasanPembayaran();
        tampilkanNotifikasi('Kupon dihapus.', 'sukses');
      };
    }
    tampilkanKuponAktifUI();
    let dataPembayaranSementara = {};

    // KETIKA TOMBOL "BAYAR SEKARANG" (DI FORM UTAMA) DITEKAN
    formBayar.onsubmit = function (e) {
      e.preventDefault();

      // Validasi Form Alamat Dasar
      const nama = elNama.value.trim();
      const alamat = elAlamat.value.trim();
      const provinsi = elProvinsi.value.trim();
      const kota = elKota.value.trim();
      const kecamatan = elKecamatan.value.trim();
      const kodePos = elKodePosAlamat.value.trim();
      const noHp = elHp.value.trim();
      if (nama.length < 3) return tampilkanNotifikasi('Nama lengkap minimal 3 karakter.', 'error');
      if (alamat.length < 10)
        return tampilkanNotifikasi('Alamat lengkap minimal 10 karakter.', 'error');
      if (!provinsi) return tampilkanNotifikasi('Provinsi wajib dipilih.', 'error');
      if (!kota || !kecamatan)
        return tampilkanNotifikasi('Kota/Kabupaten dan Kecamatan wajib diisi.', 'error');
      if (!/^[0-9]{5}$/.test(kodePos))
        return tampilkanNotifikasi('Kode pos harus terdiri dari 5 angka.', 'error');

      // Sinkronkan alamat yang baru diisi/diedit ke data profil pengguna,
      // supaya profile.html menampilkan alamat yang sama persis.
      if (user) {
        const usersTerbaru = JSON.parse(localStorage.getItem('nexoraUsers')) || [];
        const idxTerbaru = usersTerbaru.findIndex(function (u) {
          return u.email === emailLogin;
        });
        if (idxTerbaru !== -1) {
          usersTerbaru[idxTerbaru].nama = nama;
          usersTerbaru[idxTerbaru].noHp = noHp;
          usersTerbaru[idxTerbaru].provinsi = provinsi;
          usersTerbaru[idxTerbaru].kota = kota;
          usersTerbaru[idxTerbaru].kecamatan = kecamatan;
          usersTerbaru[idxTerbaru].kodePos = kodePos;
          usersTerbaru[idxTerbaru].alamat = alamat;
          localStorage.setItem('nexoraUsers', JSON.stringify(usersTerbaru));
        }
        // Kunci lagi field alamat setelah tersimpan
        semuaFieldAlamat.forEach(function (el) {
          el.disabled = true;
        });
        if (btnEditAlamat) btnEditAlamat.hidden = false;
      }

      // Ambil Metode Terpilih
      const metodeFinal = formBayar.querySelector('input[name="metodeBayar"]:checked').value;

      // Simpan data sementara ke variabel
      dataPembayaranSementara = {
        metodeFinal: metodeFinal
      };

      // Logika Pemanggilan Modal
      if (metodeFinal === 'QRIS') {
        judulModalBayar.textContent = 'Pembayaran via QRIS';
        wadahQrisLanjutan.hidden = false;
        wadahEwalletLanjutan.hidden = true;
        modalLanjutan.hidden = false;

        // Buat kode referensi unik untuk transaksi ini
        const kodeRef = buatKodeReferensiTransaksi();
        const total = hitungTotalCheckoutSaatIni().total;
        dataPembayaranSementara.kodeRef = kodeRef;
        dataPembayaranSementara.totalTagihan = total;
        if (qrisKodeRefEl) qrisKodeRefEl.textContent = kodeRef;
        if (qrisNominalEl) qrisNominalEl.textContent = formatRupiah(total);
        gambarQrisLanjutan.src = ''; // reset dulu, tampilkan status memuat
        gambarQrisLanjutan.alt = 'Membuat kode QR...';
        buatGambarQrisDariServer(kodeRef, total)
          .then(function (dataQr) {
            gambarQrisLanjutan.src = dataQr.qrImage;
            gambarQrisLanjutan.alt = 'Kode QRIS Pembayaran';
            mulaiCountdownQris(dataQr.berlakuDetik || 600, qrisTimerEl);
            // Tampilkan info merchant sesuai respons server (sinkron dengan produk.json)
            if (dataQr.merchant) {
              if (qrisMerchantNamaEl)
                qrisMerchantNamaEl.textContent = dataQr.merchant.nama || NEXORA_MERCHANT_QRIS.nama;
              if (qrisMerchantNmidEl)
                qrisMerchantNmidEl.textContent = dataQr.merchant.nmid || NEXORA_MERCHANT_QRIS.nmid;
              if (qrisMerchantTerhubungEl)
                qrisMerchantTerhubungEl.textContent =
                  dataQr.merchant.terhubungKe || NEXORA_MERCHANT_QRIS.terhubungKe;
            }
          })
          .catch(function (err) {
            console.warn('Gagal ambil QR dari server, pakai cadangan lokal:', err);
            // Fallback: tetap tampilkan QR meski API backend sedang bermasalah
            const merchantFallback =
              typeof DATA_QR !== 'undefined' && DATA_QR ? DATA_QR : NEXORA_MERCHANT_QRIS;
            const kontenQr = bangunKontenQrisDemo(kodeRef, total);
            const warnaQr = pilihWarnaQr(kodeRef);
            gambarQrisLanjutan.src =
              'https://api.qrserver.com/v1/create-qr-code/?size=280x280&color=' +
              warnaQr +
              '&bgcolor=ffffff&data=' +
              encodeURIComponent(kontenQr);
            gambarQrisLanjutan.alt = 'Kode QRIS Pembayaran';
            mulaiCountdownQris(600, qrisTimerEl);
            if (qrisMerchantNamaEl) qrisMerchantNamaEl.textContent = merchantFallback.nama;
            if (qrisMerchantNmidEl) qrisMerchantNmidEl.textContent = merchantFallback.nmid;
            if (qrisMerchantTerhubungEl)
              qrisMerchantTerhubungEl.textContent = merchantFallback.terhubungKe;
          });
      } else if (metodeFinal === 'DANA' || metodeFinal === 'GoPay') {
        judulModalBayar.textContent = 'Pembayaran via ' + metodeFinal;
        wadahQrisLanjutan.hidden = true;
        wadahEwalletLanjutan.hidden = false;
        inputHpEwallet.value = '';
        inputHpEwallet.placeholder = 'Masukkan Nomor HP ' + metodeFinal + ' Kamu';
        modalLanjutan.hidden = false;
      } else {
        // Jika COD, lewati modal dan langsung selesaikan pesanan
        prosesSelesaiPesanan();
      }
    };

    // AKSI TOMBOL BATAL DI DALAM MODAL
    document.getElementById('btnBatalBayar').onclick = function (e) {
      e.preventDefault();
      clearInterval(_timerQrisInterval);
      modalLanjutan.hidden = true;
    };

    // AKSI TOMBOL "SELESAI BAYAR" DI DALAM MODAL
    document.getElementById('btnKonfirmasiBayar').onclick = function (e) {
      e.preventDefault();

      // Jika metode adalah E-Wallet, wajibkan isi nomor HP
      if (
        dataPembayaranSementara.metodeFinal === 'DANA' ||
        dataPembayaranSementara.metodeFinal === 'GoPay'
      ) {
        const ewalletNum = inputHpEwallet.value.trim();
        if (!ewalletNum) {
          return tampilkanNotifikasi(
            'Nomor HP ' + dataPembayaranSementara.metodeFinal + ' wajib diisi!',
            'error'
          );
        }
        dataPembayaranSementara.nomorEwallet = ewalletNum;
      }

      // Tutup modal dan proses pesanan
      clearInterval(_timerQrisInterval);
      modalLanjutan.hidden = true;
      prosesSelesaiPesanan();
    };

    // FUNGSI UNTUK MENYELESAIKAN DAN MENYIMPAN RIWAYAT PESANAN
    function prosesSelesaiPesanan() {
      let idTerpilih = [];
      try {
        idTerpilih = JSON.parse(sessionStorage.getItem('itemCheckout')) || [];
      } catch (err) {}
      const barangDibeli = ambilDetailKeranjang().filter(function (item) {
        return idTerpilih.includes(String(item.id));
      });
      kurangiStokDanTambahTerjual(barangDibeli);
      const nomorOrder = 'NX-' + Math.floor(100000 + Math.random() * 900000);
      const hasilHitungAkhir = hitungTotalCheckoutSaatIni();
      const subtotal = hasilHitungAkhir.subtotal;
      const ongkir = hasilHitungAkhir.ongkir;
      const diskon = hasilHitungAkhir.diskon;
      const kuponAktif = hasilHitungAkhir.kuponAktif;
      const totalBayar = hasilHitungAkhir.total;
      let infoMetode = dataPembayaranSementara.metodeFinal;
      if (dataPembayaranSementara.nomorEwallet) {
        infoMetode += ' (' + dataPembayaranSementara.nomorEwallet + ')';
      }
      if (dataPembayaranSementara.kodeRef) {
        infoMetode += ' (Ref: ' + dataPembayaranSementara.kodeRef + ')';
      }
      const dataPesanan = {
        noPesanan: nomorOrder,
        tanggal: new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }),
        items: barangDibeli,
        subtotal: subtotal,
        ongkir: ongkir,
        diskon: diskon,
        kodeKupon: kuponAktif ? kuponAktif.kode : null,
        totalBayar: totalBayar,
        metodeBayar: infoMetode
      };
      simpanRiwayatPesanan(dataPesanan);

      // Catat pemakaian kupon ke akun pengguna (dibatasi maks. 3x per kode kupon)
      if (kuponAktif && user) {
        const usersUntukKupon = JSON.parse(localStorage.getItem('nexoraUsers')) || [];
        const idxUntukKupon = usersUntukKupon.findIndex(function (u) {
          return u.email === emailLogin;
        });
        if (idxUntukKupon !== -1) {
          if (!usersUntukKupon[idxUntukKupon].pemakaianKupon) {
            usersUntukKupon[idxUntukKupon].pemakaianKupon = {};
          }
          const kodeKuponDipakai = kuponAktif.kode;
          usersUntukKupon[idxUntukKupon].pemakaianKupon[kodeKuponDipakai] =
            (usersUntukKupon[idxUntukKupon].pemakaianKupon[kodeKuponDipakai] || 0) + 1;
          localStorage.setItem('nexoraUsers', JSON.stringify(usersUntukKupon));
        }
      }
      idTerpilih.forEach(function (id) {
        return hapusDariKeranjang(id);
      });
      sessionStorage.removeItem('itemCheckout');
      sessionStorage.removeItem('kuponAktif');
      const overlay = document.getElementById('overlaySukses');
      if (overlay) {
        document.getElementById('teksNomorPesanan').textContent = 'Nomor Pesanan: ' + nomorOrder;
        overlay.hidden = false;
        tampilkanNotifikasi('Pembayaran Berhasil! Pesanan tercatat di riwayat.', 'sukses');
      }
    }
  }
});
