/**
 * pagination-v15-port.js (FIXED)
 * Drop-in pagination untuk:
 *   - #page-master
 *   - #page-laporan
 *   - #page-barang-keluar
 *
 * Fitur:
 * - Default 5 baris (opsi 5/10/25/50)
 * - Prev / Next
 * - Maks 10 angka + ellipsis adaptif (…)
 * - Auto re-render jika <tbody> berubah (MutationObserver)
 * - Mengabaikan baris yang kamu sembunyikan manual ONLY jika ditandai:
 *     tr.__hiddenByFilter = true  ATAU  tr.setAttribute('data-hidden-by-filter','1')
 *
 * Catatan perbaikan bug:
 * - TIDAK lagi menganggap baris yang di-hide oleh paginator (style.display='none')
 *   sebagai baris terfilter. Jadi total halaman tidak “mengecil” setelah klik page.
 */
(function () {
  if (window.__gudangEnhV15) return;
  window.__gudangEnhV15 = true;

  // ---------- Utilities ----------
  const qsa = (root, sel) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  /** Buat daftar nomor halaman dengan ellipsis adaptif, maksimal 'maxNums' angka */
  function makePageItems(totalPages, current, maxNums = 10) {
    const max = Math.max(1, maxNums);
    if (totalPages <= max) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const windowSize = Math.max(1, max - 2);
    let start = current - Math.floor(windowSize / 2);
    let end   = current + Math.ceil(windowSize / 2) - 1;

    if (start < 2) { start = 2; end = start + windowSize - 1; }
    if (end > totalPages - 1) { end = totalPages - 1; start = end - windowSize + 1; }

    const items = [1];
    if (start > 2) items.push("…");
    for (let i = start; i <= end; i++) items.push(i);
    if (end < totalPages - 1) items.push("…");
    items.push(totalPages);
    return items;
  }

  // Simpan state per <tbody>
  const pagerState = new WeakMap();

  function installPaginationIn(container) {
    qsa(container, "table tbody").forEach((tbody) => {
      if (tbody.__pgInstalledV15) return;
      tbody.__pgInstalledV15 = true;

      const getState = () => {
        let st = pagerState.get(tbody);
        if (!st) { st = { page: 1, pageSize: 5 }; pagerState.set(tbody, st); }
        return st;
      };

      // === Penting: hanya anggap "terfilter" jika ada FLAG, bukan karena display none ===
      const isFiltered = (tr) =>
        tr.__hiddenByFilter === true || tr.hasAttribute("data-hidden-by-filter");

      function paginate() {
        const st = getState();

        const allRows = qsa(tbody, ":scope > tr");
        const rowsForPaging = allRows.filter((tr) => !isFiltered(tr)); // total berdasar ini
        const total = rowsForPaging.length;

        const totalPages = Math.max(1, Math.ceil(total / st.pageSize));
        if (st.page > totalPages) st.page = totalPages;

        const start = (st.page - 1) * st.pageSize;
        const end   = start + st.pageSize;

        // 1) Sembunyikan semua baris dulu
        allRows.forEach((tr) => { tr.style.display = "none"; });

        // 2) Tampilkan hanya baris pada halaman aktif (yang tidak terfilter)
        rowsForPaging.forEach((tr, idx) => {
          if (idx >= start && idx < end) tr.style.display = "";
        });

        // 3) Buat / temukan container pager di bawah tabel
        const table = tbody.closest("table");
        let holder =
          (table && table.parentElement && table.parentElement.querySelector(".custom-pager")) ||
          null;
        if (!holder) {
          holder = document.createElement("div");
          holder.className = "custom-pager";
          (table?.parentElement || tbody.parentElement).appendChild(holder);
        }
        holder.innerHTML = "";

        const wrap = document.createElement("div");
        wrap.className =
          "flex flex-col md:flex-row md:items-center md:justify-between p-2 mt-2 gap-2";

        // Left: label + rows-per-page
        const left = document.createElement("div");
        left.className = "flex items-center gap-2";

        const label = document.createElement("span");
        label.className = "text-sm text-slate-600";
        label.textContent = `Halaman ${st.page} dari ${totalPages}`;

        const sel = document.createElement("select");
        sel.className = "border rounded px-2 py-1 text-sm";
        [5, 10, 25, 50].forEach((n) => {
          const o = document.createElement("option");
          o.value = String(n);
          o.textContent = String(n);
          sel.appendChild(o);
        });
        sel.value = String(st.pageSize);
        sel.onchange = () => {
          st.pageSize = parseInt(sel.value, 10);
          st.page = 1;
          paginate();
        };

        left.append(label, sel);

        // Right: Prev | 1 … [window] … | Next
        const right = document.createElement("div");
        right.className = "flex items-center gap-1 flex-wrap";

        const btn = (txt, disabled, onClick) => {
          const b = document.createElement("button");
          b.textContent = txt;
          b.className = "border rounded px-3 py-1 text-sm";
          b.disabled = !!disabled;
          if (onClick) b.onclick = onClick;
          return b;
        };

        // Prev
        right.appendChild(
          btn("Prev", st.page <= 1, () => {
            st.page = clamp(st.page - 1, 1, totalPages);
            paginate();
          })
        );

        // angka maksimal 10 + ellipsis adaptif
        const items = makePageItems(totalPages, st.page, 10);
        items.forEach((it) => {
          if (it === "…") {
            const dots = document.createElement("span");
            dots.textContent = "…";
            dots.className = "px-1 text-slate-500";
            right.appendChild(dots);
          } else {
            const b = btn(String(it), false, () => {
              st.page = Number(it);
              paginate();
            });
            if (it === st.page) b.classList.add("bg-gray-100", "font-semibold");
            right.appendChild(b);
          }
        });

        // Next
        right.appendChild(
          btn("Next", st.page >= totalPages, () => {
            st.page = clamp(st.page + 1, 1, totalPages);
            paginate();
          })
        );

        wrap.append(left, right);
        holder.appendChild(wrap);
      }

      // Initial render + auto re-render saat child rows berubah
      paginate();
      new MutationObserver(() => paginate()).observe(tbody, { childList: true });
    });
  }

  // Pasang ke tiga section legacy; ulangi ketika DOM berganti.
  function run(container) {
    try { installPaginationIn(container); } catch (e) {}
  }

  ["#page-master", "#page-laporan", "#page-barang-keluar"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    run(el);
    const mo = new MutationObserver(() => run(el));
    mo.observe(el, { childList: true, subtree: true });
  });
})();
