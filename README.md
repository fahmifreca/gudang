# Gudang React + Tailwind (dibungkus dari HTML asli)

## Cara jalan
1. `npm i`
2. `npm run dev` (lokal)
3. `npm run build` → upload isi folder `dist/` ke hosting (root).

Catatan:
- Script Firebase/Firestore diambil langsung dari file HTML asli dan dimuat via `public/legacy-app.js` sebagai `type="module"`.
- Markup HTML asli dimasukkan ke `src/legacy.html`. React hanya membungkus agar bisa dibuild dengan Vite + Tailwind (tanpa mengubah logika).
- Chart.js dan XLSX tetap dari CDN (lihat `index.html`).
