/**
 * Helper untuk ekspor Excel, menggunakan global XLSX dari CDN.
 * Contoh: exportToExcel([{a:1}], "Data.xlsx")
 */
window.exportToExcel = function(dataArray, fileName) {
  try {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      alert("Tidak ada data untuk diexport.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(dataArray);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, fileName || "Export.xlsx");
  } catch (e) {
    console.error(e);
    alert("Gagal mengekspor Excel.");
  }
};
