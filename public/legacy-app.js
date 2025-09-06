import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, addDoc, setDoc, deleteDoc, updateDoc, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyDeN2iDeRl8tQ1SfjewdDCYTxIK4aN24EM", authDomain: "gudang-freca.firebaseapp.com", projectId: "gudang-freca", storageBucket: "gudang-freca.appspot.com", messagingSenderId: "836230153184", appId: "1:836230153184:web:c3ef63610f6aa2f5996185", measurementId: "G-RMGPPZZDG7" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === GLOBAL STATE ===
let rawMaterialsData = [], finishedGoodsData = [], productionHistory = [], goodsOutHistory = [], stockAddHistory = [], users = [], roles = [], recipes = [], appSettings = {}, supplementaryMaterialsData = [], brandsData = [], activityLogs = [], expenditureHistory = [];
let availableUnits = ['ml', 'Pcs', 'Lembar'];
let currentUserRole = null, unsubscribeListeners = [], pendingAction = null, pendingProductionData = null, productionInputs = {};
let productionPieChartInstance = null, goodsOutPieChartInstance = null, trendlineChartInstance = null;
let pageContentLoaded = false;
let recipeDraft = {}; // { [rmId]: "nilai-string" }

// Pagination State
const paginationState = {
    expenditure: { currentPage: 1, rowsPerPage: 10, data: [] },
    rawMaterials: { currentPage: 1, rowsPerPage: 10, data: [] },
    finishedGoods: { currentPage: 1, rowsPerPage: 10, data: [] },
    masterSupplementary: { currentPage: 1, rowsPerPage: 10, data: [] },
    goodsOutHistory: { currentPage: 1, rowsPerPage: 10, data: [] },
    reportStockAdd: { currentPage: 1, rowsPerPage: 10, data: [] },
    reportProduction: { currentPage: 1, rowsPerPage: 10, data: [] },
    reportGoodsOut: { currentPage: 1, rowsPerPage: 10, data: [] },
    activityLog: { currentPage: 1, rowsPerPage: 10, data: [] },
};

// === DOM ELEMENTS ===
const loginPage = document.getElementById('login-page');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');
const mainLoader = document.getElementById('main-loader');
const mainContent = document.getElementById('main-content');

// === UTILITY FUNCTIONS ===
const formatRupiah = (number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
const getTodayDate = () => new Date().toISOString().split('T')[0];
const showNotification = (message, isError = false) => { const notification = document.getElementById('notification'), messageEl = document.getElementById('notification-message'); messageEl.textContent = message; notification.className = `fixed top-5 right-5 text-white py-3 px-5 rounded-lg shadow-xl transform transition-transform duration-300 z-50 ${isError ? 'bg-red-500' : 'bg-green-500'}`; notification.classList.remove('translate-x-full'); setTimeout(() => { notification.classList.add('translate-x-full'); }, 3000); };
const filterByDateRange = (data, dateField, startDate, endDate) => {
  if (startDate && !endDate) endDate = startDate;
  if (endDate && !startDate) startDate = endDate;
  if (!startDate && !endDate) return data;
  return data.filter(item => {
    const itemDate = item[dateField];
    const startMatch = startDate ? itemDate >= startDate : true;
    const endMatch   = endDate   ? itemDate <= endDate   : true;
    return startMatch && endMatch;
  });
};

// === DYNAMIC CONTENT RENDERING ===
const renderPageContent = () => {
    // Helper to safely set innerHTML
    const setPageContent = (id, html) => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = html;
        } else {
            console.error(`Element with id '${id}' not found.`);
        }
    };

    setPageContent('page-dashboard', `<header class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8"><div><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Dashboard</h1><p class="text-slate-500 mt-1">Ringkasan dan analisis data inventaris Anda.</p></div><div class="flex items-center gap-4 mt-4 sm:mt-0"><input type="date" id="start-date-dash" class="date-filter-start bg-white border-slate-300 rounded-md shadow-sm text-sm p-2"><span class="text-slate-500">to</span><input type="date" id="end-date-dash" class="date-filter-end bg-white border-slate-300 rounded-md shadow-sm text-sm p-2"></div></header><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6" id="kpi-container"></div><div id="total-stock-card" class="mb-6"><div class="relative overflow-hidden rounded-xl text-white p-6 md:p-8" style="background-color:#002e4e;"><img id="total-stock-bg-logo" alt="" class="absolute right-8 top-1/2 -translate-y-1/2 w-0 md:w-32 opacity-80 pointer-events-none select-none" /><p class="text-sm font-medium opacity-80">Total Nilai Stok Gudang</p><p id="total-stock-value" class="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight text-yellow-300">Rp 0</p></div></div><div class="card mb-6"><h2 class="text-xl font-semibold mb-4 text-slate-800">Tren Aktivitas Gudang</h2><div class="relative h-80"><canvas id="trendlineChart"></canvas></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"><div class="card"><h2 class="text-xl font-semibold mb-4 text-slate-800">Komposisi Produksi</h2><div class="relative h-72"><canvas id="productionPieChart"></canvas></div></div><div class="card"><h2 class="text-xl font-semibold mb-4 text-slate-800">Komposisi Barang Keluar</h2><div class="relative h-72"><canvas id="goodsOutPieChart"></canvas></div></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="card"><h2 class="text-xl font-semibold mb-4 text-slate-800">Stok Bahan Baku Teratas</h2><div class="overflow-y-auto max-h-96"><table class="min-w-full"><thead class="bg-slate-50 sticky top-0"><tr><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai</th></tr></thead><tbody id="dashboard-table-raw" class="divide-y divide-slate-100"></tbody></table></div></div><div class="card"><h2 class="text-xl font-semibold mb-4 text-slate-800">Stok Barang Jadi Teratas</h2><div class="overflow-y-auto max-h-96"><table class="min-w-full"><thead class="bg-slate-50 sticky top-0"><tr><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai (HPP)</th></tr></thead><tbody id="dashboard-table-finished" class="divide-y divide-slate-100"></tbody></table></div></div></div>`);
    setPageContent('page-kalkulator', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Kalkulator Produksi</h1><p class="text-slate-500 mt-1">Hitung kebutuhan bahan baku untuk rencana produksi Anda.</p></header><div class="grid grid-cols-1 lg:grid-cols-3 gap-8"><div class="lg:col-span-1 card h-fit"><form id="form-calculator" class="space-y-4"><div><label for="calc-fg-name" class="block text-sm font-medium text-slate-700">Pilih Produk Jadi</label><select id="calc-fg-name" required class="mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm"></select></div><div><label for="calc-quantity" class="block text-sm font-medium text-slate-700">Jumlah Rencana Produksi</label><input type="number" id="calc-quantity" min="1" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"></div><button type="submit" class="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-md hover:bg-indigo-700 font-semibold">Hitung Kebutuhan</button></form></div><div class="lg:col-span-2 card"><h2 class="text-xl font-semibold mb-4 text-slate-800">Hasil Perhitungan</h2><div id="calculator-result-container"><p class="text-center text-slate-500">Silakan pilih produk dan isi jumlah untuk menghitung kebutuhan bahan baku.</p></div></div></div>`);
    setPageContent('page-produksi', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Produksi Barang Jadi</h1><p class="text-slate-500 mt-1">Pilih produk, tentukan jumlah, dan masukkan bahan baku yang digunakan.</p></header><div class="card mb-6"><h2 class="text-xl font-semibold mb-4 text-slate-800">Kalkulator Produksi</h2><form id="form-prod-calculator" class="grid grid-cols-1 md:grid-cols-4 gap-4"><div><label for="prod-calc-brand" class="block text-sm font-medium text-slate-700">1. Pilih Brand</label><select id="prod-calc-brand" class="brands-dropdown mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm"></select></div><div><label for="prod-calc-fg" class="block text-sm font-medium text-slate-700">2. Pilih Produk</label><select id="prod-calc-fg" class="mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm" disabled><option>Pilih Brand Dahulu</option></select></div><div><label for="prod-calc-qty" class="block text-sm font-medium text-slate-700">3. Jumlah Rencana Produksi</label><input type="number" id="prod-calc-qty" min="1" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"></div><div class="md:pt-6"><button type="submit" class="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-md hover:bg-indigo-700 font-semibold">Hitung Kebutuhan</button></div></form><div id="prod-calc-result" class="mt-4"></div></div><div class="card mb-6"><h2 class="text-xl font-semibold mb-4 text-slate-800">Produksi</h2><form id="form-produksi"><div class="grid grid-cols-1 md:grid-cols-3 gap-6"><div><label for="prod-brand" class="block text-sm font-medium text-slate-700">1. Pilih Brand</label><select id="prod-brand" required class="brands-dropdown mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm"></select></div><div><label for="prod-fg-name" class="block text-sm font-medium text-slate-700">2. Pilih Produk Jadi</label><select id="prod-fg-name" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" disabled><option>Pilih Brand Dahulu</option></select></div><div><label for="prod-quantity" class="block text-sm font-medium text-slate-700">3. Jumlah Produksi</label><input type="number" id="prod-quantity" min="1" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"></div><div class="md:col-span-3"><label for="prod-date" class="block text-sm font-medium text-slate-700">4. Tanggal Produksi</label><input type="date" id="prod-date" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"></div></div><div><h3 class="text-lg font-medium text-slate-900 border-b border-slate-200 pb-2 mb-4">5. Pilih Bahan Baku yang Digunakan</h3><input type="text" id="search-prod-raw-material" placeholder="Cari bahan baku..." class="w-full px-3 py-2 mb-4 border border-slate-300 rounded-md shadow-sm"><div id="raw-material-selection-container" class="space-y-3 max-h-60 overflow-y-auto pr-2"></div></div><button type="submit" class="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 transition-colors font-semibold">PRODUKSI</button></form></div>`);
    setPageContent('page-barang-keluar', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Catat Barang Keluar</h1><p class="text-slate-500 mt-1">Mengurangi stok barang jadi untuk penjualan atau pengiriman.</p></header><div class="grid grid-cols-1 lg:grid-cols-3 gap-8"><form id="form-barang-keluar" class="lg:col-span-1 card space-y-4 h-fit"><input type="hidden" id="g-out-edit-id"><input type="hidden" id="g-out-original-qty"><input type="hidden" id="g-out-original-product-id"><input type="hidden" id="g-out-original-brand-id"><div><label for="out-date" class="block text-sm font-medium text-slate-700">Tanggal Keluar</label><input type="date" id="out-date" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"></div><div><label for="out-brand" class="block text-sm font-medium text-slate-700">Pilih Brand</label><select id="out-brand" required class="brands-dropdown mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm"></select></div><div><label for="out-fg-name" class="block text-sm font-medium text-slate-700">Pilih Produk</label><select id="out-fg-name" required class="mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm" disabled><option>Pilih Brand Dahulu</option></select></div><div><label for="out-quantity" class="block text-sm font-medium text-slate-700">Jumlah Keluar</label><input type="number" id="out-quantity" min="1" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"></div><button type="submit" id="g-out-submit-btn" class="w-full bg-red-600 text-white py-2.5 px-4 rounded-md hover:bg-red-700 transition-colors font-semibold">CATAT PENGELUARAN</button></form><div class="lg:col-span-2 card"><h2 class="text-xl font-semibold mb-4 text-slate-800">Riwayat Barang Keluar</h2><div id="pagination-goods-out-history-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Produk</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-goods-out-history" class="bg-white divide-y divide-slate-100"></tbody></table></div><div id="pagination-goods-out-history" class="flex justify-between items-center mt-4 text-sm"></div></div></div>`);
    setPageContent('page-input', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Input Data & Resep</h1><p class="text-slate-500 mt-1">Atur resep produksi, kemudian tambahkan stok awal.</p></header><div class="grid grid-cols-1 lg:grid-cols-2 gap-8"><div class="card"><h2 class="text-xl font-semibold mb-4 border-b border-slate-200 pb-2 text-slate-800">1. Atur Resep Produksi</h2><form id="form-recipe" class="space-y-4"><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label for="recipe-brand" class="block text-sm font-medium">Pilih Brand</label><select id="recipe-brand" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md bg-white brands-dropdown"><option value="">Pilih Brand Dahulu</option></select></div><div><label for="recipe-fg-name" class="block text-sm font-medium">Pilih Produk Jadi</label><select id="recipe-fg-name" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md bg-white" disabled><option value="">Pilih Brand Dahulu</option></select></div></div><input type="text" id="search-recipe-raw-material" placeholder="Cari bahan baku..." class="w-full px-3 py-2 mt-4 border border-slate-300 rounded-md shadow-sm"><div id="recipe-materials-container" class="max-h-60 overflow-y-auto space-y-2 mt-2 border-t pt-4"></div><button type="submit" class="w-full bg-teal-600 text-white py-2.5 px-4 rounded-md hover:bg-teal-700 font-semibold">Simpan Resep</button></form></div><div class="card"><h2 class="text-xl font-semibold mb-4 border-b border-slate-200 pb-2 text-slate-800">2. Tambah Stok</h2><div id="add-stock-tabs" class="mb-4 border-b border-gray-200"><nav class="-mb-px flex space-x-8" aria-label="Tabs"><button data-tab="raw" class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-indigo-500 text-indigo-600">Bahan Baku</button><button data-tab="finished" class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">Barang Jadi</button><button data-tab="supplementary" class="tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">Bahan Pelengkap</button></nav></div><div id="tab-content-raw"><form id="form-add-stock-raw-material" class="space-y-4"></form></div><div id="tab-content-finished" class="hidden"><form id="form-add-stock-finished-good" class="space-y-4"></form></div><div id="tab-content-supplementary" class="hidden"><form id="form-add-stock-supplementary" class="space-y-4"></form></div></div></div><div class="mt-8 card"><h2 class="text-xl font-semibold text-slate-800 mb-4">Stok Bahan Pelengkap</h2><div class="overflow-x-auto"><table id="table-container-sm" class="min-w-full"></table></div></div><div class="mt-8 card"><h2 class="text-xl font-semibold text-slate-800 mb-4">Lihat Resep Produksi</h2><div class="space-y-3"><label for="recipe-lookup-brand" class="block text-sm font-medium">Pilih Brand</label><select id="recipe-lookup-brand" class="w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm"></select><label for="recipe-lookup-product" class="block text-sm font-medium">Pilih Produk</label><select id="recipe-lookup-product" class="w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm" disabled><option value="">Pilih Brand Dahulu</option></select><div id="recipe-lookup-details" class="mt-4 p-4 border rounded-md bg-slate-50 min-h-[100px]"></div></div>`);
    setPageContent('page-input-pengeluaran', `
        <header class="mb-8">
            <h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Input Pengeluaran</h1>
            <p class="text-slate-500 mt-1">Catat pembelian dan tambah stok bahan baku atau bahan pelengkap.</p>
        </header>
        <div class="space-y-8">
            <div class="card">
                <h2 class="text-xl font-semibold mb-4 text-slate-800">Form Belanja Produksi</h2>
                <form id="form-input-pengeluaran" class="space-y-4">
                    <div>
                        <label for="pengeluaran-date" class="block text-sm font-medium text-slate-700">Tanggal</label>
                        <input type="date" id="pengeluaran-date" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label for="pengeluaran-kategori" class="block text-sm font-medium text-slate-700">Kategori</label>
                        <select id="pengeluaran-kategori" required class="mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm">
                            <option value="">-- Pilih Kategori --</option>
                            <option value="rawMaterials">Bahan Baku</option>
                            <option value="supplementaryMaterials">Bahan Pelengkap</option>
                        </select>
                    </div>
                    <div id="searchable-dropdown-pengeluaran-container" class="hidden">
                        <label for="search-add-pengeluaran" class="block text-sm font-medium text-slate-700">Pilih Bahan</label>
                         <div class="relative searchable-dropdown-container mt-1">
                            <input type="text" id="search-add-pengeluaran" placeholder="Cari & pilih bahan..." class="w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm" autocomplete="off">
                            <input type="hidden" id="add-pengeluaran-id" name="add-pengeluaran-id">
                            <div id="dropdown-add-pengeluaran" class="absolute hidden w-full bg-white border mt-1 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto"></div>
                        </div>
                    </div>
                    <div>
                        <label for="pengeluaran-supplier" class="block text-sm font-medium text-slate-700">Supplier</label>
                        <input type="text" id="pengeluaran-supplier" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label for="pengeluaran-jumlah" class="block text-sm font-medium text-slate-700">Jumlah Stok</label>
                        <input type="number" id="pengeluaran-jumlah" min="0.01" step="any" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label for="pengeluaran-total" class="block text-sm font-medium text-slate-700">Harga Total</label>
                        <input type="number" id="pengeluaran-total" min="0" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm">
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2.5 px-4 rounded-md hover:bg-blue-700 font-semibold">Simpan Pengeluaran</button>
                </form>
            </div>
            <div class="card">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                    <h2 class="text-xl font-semibold text-slate-800 mb-2 sm:mb-0">Rekap Pengeluaran</h2>
                    <div class="flex items-center gap-2">
                        <input type="date" id="start-date-pengeluaran" class="date-filter-start bg-white border-slate-300 rounded-md shadow-sm text-sm p-2">
                        <span class="text-slate-500">to</span>
                        <input type="date" id="end-date-pengeluaran" class="date-filter-end bg-white border-slate-300 rounded-md shadow-sm text-sm p-2">
                    </div>
                </div>
                <div id="pagination-expenditure-controls" class="flex justify-end mb-2"></div>
                <div class="overflow-x-auto">
                    <table class="min-w-full">
                        <thead class="bg-slate-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Bahan</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Supplier</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Satuan</th>
                                <th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Total</th>
                            </tr>
                        </thead>
                        <tbody id="table-rekap-pengeluaran" class="bg-white divide-y divide-slate-100"></tbody>
                        <tfoot id="tfoot-rekap-pengeluaran"></tfoot>
                    </table>
                </div>
                <div id="pagination-expenditure" class="flex justify-between items-center mt-4 text-sm"></div>
            </div>
        </div>
    `);
    setPageContent('page-master', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Master Data</h1><p class="text-slate-500 mt-1">Lihat dan kelola semua data inventaris</p></header><div class="space-y-8"><div class="card"><div class="flex flex-col sm:flex-row justify-between items-center mb-4"><h2 class="text-xl font-semibold text-slate-800 mb-2 sm:mb-0">Data Bahan Baku</h2><div class="flex items-center gap-4"><input type="text" id="search-raw" placeholder="Cari bahan baku..." class="search-input w-full sm:w-64 px-4 py-2 border border-slate-300 rounded-lg"><button id="export-raw-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-semibold">Export Excel</button></div></div><div id="pagination-rawMaterials-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Item</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Rata-rata</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai Stok</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-raw-materials" class="bg-white divide-y divide-slate-100"></tbody></table></div><div id="pagination-rawMaterials" class="flex justify-between items-center mt-4 text-sm"></div></div><div class="card"><div class="flex flex-col sm:flex-row justify-between items-center mb-4"><h2 class="text-xl font-semibold text-slate-800 mb-2 sm:mb-0">Data Barang Jadi</h2><div class="flex items-center gap-4"><input type="text" id="search-finished" placeholder="Cari barang jadi atau brand..." class="search-input w-full sm:w-64 px-4 py-2 border border-slate-300 rounded-lg"><button id="export-finished-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-semibold">Export Excel</button></div></div><div id="pagination-finishedGoods-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Produk</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">HPP Rata-rata</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Jual</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai Stok (HPP)</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-finished-goods" class="bg-white divide-y divide-slate-100"></tbody></table></div><div id="pagination-finishedGoods" class="flex justify-between items-center mt-4 text-sm"></div></div><div class="card"><div class="flex flex-col sm:flex-row justify-between items-center mb-4"><h2 class="text-xl font-semibold text-slate-800 mb-2 sm:mb-0">Data Bahan Pelengkap</h2><div class="flex items-center gap-4"><input type="text" id="search-supplementary" placeholder="Cari bahan pelengkap..." class="search-input w-full sm:w-64 px-4 py-2 border border-slate-300 rounded-lg"></div></div><div id="pagination-masterSupplementary-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Item</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Rata-rata</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai Stok</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-master-supplementary" class="bg-white divide-y divide-slate-100"></tbody></table></div><div id="pagination-masterSupplementary" class="flex justify-between items-center mt-4 text-sm"></div></div></div>`);
    setPageContent('page-laporan', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Laporan</h1><p class="text-slate-500 mt-1">Analisis produksi, penjualan, dan profitabilitas.</p></header><div class="card mb-6 flex flex-col sm:flex-row items-center gap-4"><label class="font-medium text-slate-700">Filter Tanggal:</label><input type="date" id="start-date-laporan" class="date-filter-start bg-white border-slate-300 rounded-md shadow-sm"><span class="text-slate-500">hingga</span><input type="date" id="end-date-laporan" class="date-filter-end bg-white border-slate-300 rounded-md shadow-sm"></div><div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8" id="report-summary-container"></div><div class="space-y-8"><div class="card"><h2 class="text-xl font-semibold text-slate-800 mb-4">Laporan Input Data</h2><div id="pagination-reportStockAdd-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Barang</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Supplier</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Satuan</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nilai Total</th></tr></thead><tbody id="table-report-stock-add" class="bg-white divide-y divide-slate-100"></tbody><tfoot id="tfoot-report-stock-add"></tfoot></table></div><div id="pagination-reportStockAdd" class="flex justify-between items-center mt-4 text-sm"></div></div><div class="card"><h2 class="text-xl font-semibold text-slate-800 mb-4">Laporan Produksi</h2><div id="pagination-reportProduction-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Produk</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Biaya Produksi</th></tr></thead><tbody id="table-report-production" class="bg-white divide-y divide-slate-100"></tbody><tfoot id="tfoot-report-production"></tfoot></table></div><div id="pagination-reportProduction" class="flex justify-between items-center mt-4 text-sm"></div></div><div class="card"><h2 class="text-xl font-semibold text-slate-800 mb-4">Laporan Barang Keluar (Penjualan)</h2><div id="pagination-reportGoodsOut-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Produk</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total HPP</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Penjualan</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estimasi Laba</th></tr></thead><tbody id="table-report-goods-out" class="bg-white divide-y divide-slate-100"></tbody><tfoot id="tfoot-report-goods-out"></tfoot></table></div><div id="pagination-reportGoodsOut" class="flex justify-between items-center mt-4 text-sm"></div></div><div class="card"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4"><h2 class="text-xl font-semibold text-slate-800">Log Aktivitas Pengguna</h2><select id="log-user-filter" class="border border-slate-300 rounded-md px-3 py-2 bg-white w-full sm:w-64"><option value="">Semua Pengguna</option></select></div><div id="pagination-activityLog-controls" class="flex justify-end mb-2"></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Waktu</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pengguna</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aktivitas</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Detail</th></tr></thead><tbody id="table-activity-log-body" class="bg-white divide-y divide-slate-100"></tbody><tfoot id="tfoot-activity-log"></tfoot></table></div><div id="pagination-activityLog" class="flex justify-between items-center mt-4 text-sm"></div></div></div>`);
    setPageContent('page-admin', `<header class="mb-8"><h1 class="font-lexend text-4xl font-bold text-slate-900 tracking-tight">Admin</h1><p class="text-slate-500 mt-1">Kelola pengguna, peran, dan pengaturan aplikasi.</p></header><div class="grid grid-cols-1 lg:grid-cols-2 gap-8"><div class="card space-y-6"><div><h2 class="text-xl font-semibold mb-4 border-b border-slate-200 pb-2 text-slate-800">Manajemen Peran (Role)</h2><form id="form-add-role" class="space-y-4 mb-4"><input type="text" id="new-role-name" placeholder="Nama Peran Baru" required class="w-full border border-slate-300 rounded-md p-2"><div id="role-permissions" class="grid grid-cols-2 gap-2 text-sm"></div><button type="submit" class="w-full bg-purple-600 text-white py-2.5 rounded-md hover:bg-purple-700 font-semibold">Tambah Peran</button></form><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Peran</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-roles" class="bg-white divide-y divide-slate-100"></tbody></table></div></div><div class="card h-fit"><h2 class="text-xl font-semibold mb-4 border-b border-slate-200 pb-2 text-slate-800">Manajemen Brand</h2><form id="form-add-brand" class="space-y-2 mb-4"><input type="text" id="new-brand-name" placeholder="Nama Brand Baru" required class="w-full border border-slate-300 rounded-md p-2"><button type="submit" class="w-full bg-sky-600 text-white py-2.5 px-4 rounded-md hover:bg-sky-700 font-semibold">Tambah Brand</button></form><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Brand</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-brands" class="bg-white divide-y divide-slate-100"></tbody></table></div></div><div class="card h-fit"><h2 class="text-xl font-semibold mb-4 border-b border-slate-200 pb-2 text-slate-800">Pengaturan Aplikasi</h2><form id="form-app-settings" class="space-y-4"><div><label for="setting-title" class="block text-sm font-medium">Judul Aplikasi</label><input type="text" id="setting-title" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md"></div><div><label for="setting-logo-url" class="block text-sm font-medium">URL Logo</label><input type="text" id="setting-logo-url" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md"></div><button type="submit" class="w-full bg-green-600 text-white py-2.5 px-4 rounded-md hover:bg-green-700 font-semibold">Simpan Pengaturan</button></form></div></div><div class="card"><h2 class="text-xl font-semibold mb-4 border-b border-slate-200 pb-2 text-slate-800">Manajemen Pengguna</h2><form id="form-add-user" class="grid grid-cols-2 gap-4 mb-4 items-end"><div class="col-span-2"><label for="new-user-email" class="block text-sm font-medium text-slate-700">Email Pengguna</label><input type="email" id="new-user-email" required class="mt-1 w-full border border-slate-300 rounded-md p-2"></div><div class="col-span-2 sm:col-span-1"><label for="new-user-password" class="block text-sm font-medium text-slate-700">Password</label><input type="password" id="new-user-password" required class="mt-1 w-full border border-slate-300 rounded-md p-2"></div><div class="col-span-2 sm:col-span-1"><label for="new-user-role" class="block text-sm font-medium text-slate-700">Role</label><select id="new-user-role" class="mt-1 w-full border border-slate-300 rounded-md p-2 bg-white h-[42px]"></select></div><div class="col-span-2"><button type="submit" class="w-full bg-indigo-600 text-white py-2.5 rounded-md hover:bg-indigo-700 font-semibold">Tambah Pengguna</button></div></form><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody id="table-users" class="bg-white divide-y divide-slate-100"></tbody></table></div></div></div>`);
    
    populateForms();
    addEventListeners();
    initializeSearchableDropdowns();
};

const populateForms = () => {
    const baseInputClasses = "w-full px-3 py-2 mt-1 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500";
    const searchableDropdownHTML = (type, label) => `
        <div>
            <div class="flex justify-between items-center">
                <label class="block text-sm font-medium">${label}</label>
                <button type="button" id="add-new-${type}-btn" class="text-xs font-semibold text-indigo-600 hover:underline">Tambah Baru</button>
            </div>
            <div class="relative searchable-dropdown-container">
                <input type="text" id="search-add-${type}" placeholder="Cari & pilih..." class="${baseInputClasses}" autocomplete="off">
                <input type="hidden" id="add-${type}-id" name="add-${type}-id">
                <div id="dropdown-add-${type}" class="absolute hidden w-full bg-white border mt-1 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto"></div>
            </div>
        </div>`;

    document.getElementById('form-add-stock-raw-material').innerHTML = `${searchableDropdownHTML('rm', 'Pilih Bahan Baku')}<div class="grid grid-cols-2 gap-4"><div><label for="add-rm-stock" class="block text-sm font-medium">Jumlah Stok</label><input type="number" id="add-rm-stock" min="0" required class="${baseInputClasses}"></div><div><label for="add-rm-price" class="block text-sm font-medium">Harga Beli Satuan</label><input type="number" min="0" id="add-rm-price" required class="${baseInputClasses}"></div></div><div><label for="add-rm-supplier" class="block text-sm font-medium">Supplier</label><input type="text" id="add-rm-supplier" required class="${baseInputClasses}"></div><button type="submit" class="w-full bg-blue-600 text-white py-2.5 px-4 rounded-md hover:bg-blue-700 font-semibold">Tambah Stok</button>`;
    document.getElementById('form-add-stock-finished-good').innerHTML = `
        <div>
            <div class="flex justify-between items-center">
                <label class="block text-sm font-medium">Pilih Barang Jadi</label>
                <button type="button" id="add-new-fg-btn" class="text-xs font-semibold text-indigo-600 hover:underline">Tambah Baru</button>
            </div>
            <div class="grid grid-cols-2 gap-4 mt-1">
                <select id="add-fg-brand" required class="${baseInputClasses} brands-dropdown"><option value="">Pilih Brand</option></select>
                <select id="add-fg-name" required class="${baseInputClasses}" disabled><option value="">Pilih Brand Dulu</option></select>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div><label for="add-fg-stock" class="block text-sm font-medium">Jumlah Stok</label><input type="number" min="0" id="add-fg-stock" required class="${baseInputClasses}"></div>
            <div><label for="add-fg-price" class="block text-sm font-medium">Harga Jual</label><input type="number" min="0" id="add-fg-price" required class="${baseInputClasses}"></div>
        </div>
        <button type="submit" class="w-full bg-green-600 text-white py-2.5 px-4 rounded-md hover:bg-green-700 font-semibold">Tambah Stok</button>`;
    document.getElementById('form-add-stock-supplementary').innerHTML = `${searchableDropdownHTML('sm', 'Pilih Bahan Pelengkap')}<div class="grid grid-cols-2 gap-4"><div><label for="add-sm-stock" class="block text-sm font-medium">Jumlah Stok</label><input type="number" id="add-sm-stock" min="0" required class="${baseInputClasses}"></div><div><label for="add-sm-price" class="block text-sm font-medium">Harga Beli Satuan</label><input type="number" min="0" id="add-sm-price" required class="${baseInputClasses}"></div></div><div><label for="add-sm-supplier" class="block text-sm font-medium">Supplier</label><input type="text" id="add-sm-supplier" required class="${baseInputClasses}"></div><button type="submit" class="w-full bg-cyan-600 text-white py-2.5 px-4 rounded-md hover:bg-cyan-700 font-semibold">Tambah Stok</button>`;
};

const initializeSearchableDropdowns = () => {
    document.body.addEventListener('input', e => {
        if (e.target.matches('[id^="search-add-"]')) {
            const type = e.target.id.split('-')[2]; // rm, fg, sm, pengeluaran
            let data;
            if (type === 'pengeluaran') {
                const category = document.getElementById('pengeluaran-kategori').value;
                data = category === 'rawMaterials' ? rawMaterialsData : supplementaryMaterialsData;
            } else {
                data = { rm: rawMaterialsData, fg: finishedGoodsData, sm: supplementaryMaterialsData }[type];
            }
            
            const dropdown = document.getElementById(`dropdown-add-${type}`);
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = (data || []).filter(item => item.name.toLowerCase().includes(searchTerm));
            
            if (dropdown) {
                if (filteredData.length > 0) {
                    dropdown.innerHTML = filteredData.map(item => `<div class="p-2 cursor-pointer search-dropdown-item" data-id="${item.id}" data-name="${item.name}">${item.name}</div>`).join('');
                } else {
                    dropdown.innerHTML = `<div class="p-2 text-sm text-slate-500">Tidak ada hasil.</div>`;
                }
            }
        }
    });

    document.body.addEventListener('focusin', e => {
         if (e.target.matches('[id^="search-add-"]')) {
            const type = e.target.id.split('-')[2];
            document.querySelectorAll('[id^="dropdown-add-"]').forEach(d => d.classList.add('hidden'));
            
            let data;
            if (type === 'pengeluaran') {
                const category = document.getElementById('pengeluaran-kategori').value;
                if (!category) return;
                data = category === 'rawMaterials' ? rawMaterialsData : supplementaryMaterialsData;
            } else {
                data = { rm: rawMaterialsData, fg: finishedGoodsData, sm: supplementaryMaterialsData }[type];
            }

            const dropdown = document.getElementById(`dropdown-add-${type}`);
            if (dropdown) {
                if ((data || []).length > 0) {
                    dropdown.innerHTML = data.map(item => `<div class="p-2 cursor-pointer search-dropdown-item" data-id="${item.id}" data-name="${item.name}">${item.name}</div>`).join('');
                } else {
                    dropdown.innerHTML = `<div class="p-2 text-sm text-slate-500">Tidak ada data.</div>`;
                }
                dropdown.classList.remove('hidden');
            }
         }
    });
    
    document.body.addEventListener('click', e => {
         if (e.target.classList.contains('search-dropdown-item')) {
            const dropdown = e.target.parentElement;
            const container = dropdown.closest('.searchable-dropdown-container');
            
            container.querySelector('[id$="-id"]').value = e.target.dataset.id;
            container.querySelector('[id^="search-add-"]').value = e.target.dataset.name;
            dropdown.classList.add('hidden');
        } else if (!e.target.closest('.searchable-dropdown-container')) {
            document.querySelectorAll('[id^="dropdown-add-"]').forEach(d => d.classList.add('hidden'));
        }
    });
};

const populateUnitsDropdowns = () => {
    const selects = document.querySelectorAll('.units-dropdown');
    selects.forEach(select => {
        const selectedValue = select.value;
        select.innerHTML = '';
        availableUnits.sort((a,b) => a.localeCompare(b)).forEach(unit => {
            const option = document.createElement('option');
            option.value = unit;
            option.textContent = unit;
            select.appendChild(option);
        });
        select.innerHTML += '<option value="add_new" class="font-bold text-indigo-600">Tambah Satuan Baru...</option>';
        if (availableUnits.includes(selectedValue)) {
            select.value = selectedValue;
        }
    });
};

const handleNewUnit = (e) => {
    if (e.target.value === 'add_new') {
        const newUnit = prompt("Masukkan nama satuan baru:");
        if (newUnit && newUnit.trim() !== '' && !availableUnits.map(u => u.toLowerCase()).includes(newUnit.toLowerCase())) {
            availableUnits.push(newUnit.trim());
            populateUnitsDropdowns();
            e.target.value = newUnit.trim();
        } else if (!newUnit) {
            e.target.selectedIndex = 0;
        } else {
            alert('Satuan tersebut sudah ada!');
            e.target.value = newUnit;
        }
    }
};

const populateDynamicDropdowns = () => { 
    populateBrandsDropdowns();
    const sortedFinishedGoods = [...finishedGoodsData].sort((a, b) => a.name.localeCompare(b.name)); 
    
    const recipeFgSelect = document.getElementById('recipe-fg-name'); 
    const calcFgSelect = document.getElementById('calc-fg-name'); 
    
    if (recipeFgSelect) {
        const recipeBrandSelect = document.getElementById('recipe-brand');
        if (recipeBrandSelect && recipeBrandSelect.value) {
            populateProductsByBrand(recipeBrandSelect.value, 'recipe-fg-name');
        } else {
            recipeFgSelect.innerHTML = '<option value="">Pilih Brand Dahulu</option>';
            recipeFgSelect.disabled = true;
        }
    }

    if (calcFgSelect) calcFgSelect.innerHTML = '<option value="">-- Pilih Produk --</option>' + sortedFinishedGoods.map(item => `<option value="${item.id}">${item.brandName} - ${item.name}</option>`).join(''); 
    
    if (document.getElementById('page-produksi')?.classList.contains('active')) renderProductionRawMaterials(); 
};
const populateBrandsDropdowns = () => {
    const sortedBrands = [...brandsData].sort((a,b) => a.name.localeCompare(b.name));
    const optionsHTML = '<option value="">-- Pilih Brand --</option>' + sortedBrands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    document.querySelectorAll('.brands-dropdown').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = optionsHTML;
        select.value = currentValue;
    });
};
const populateProductsByBrand = (brandId, productSelectId) => {
    const productSelect = document.getElementById(productSelectId);
    if (!productSelect) return;
    if (!brandId) {
        productSelect.innerHTML = '<option value="">Pilih Brand Dahulu</option>';
        productSelect.disabled = true;
        return;
    }
    const filteredProducts = finishedGoodsData.filter(p => p.brandId === brandId).sort((a,b) => a.name.localeCompare(b.name));
    productSelect.innerHTML = '<option value="">-- Pilih Produk --</option>' + filteredProducts.map(p => `<option value="${p.id}">${p.name} (Stok: ${p.stock})</option>`).join('');
    productSelect.disabled = false;
};
const populateProductsByBrandWithRecipe = (brandId, productSelectId) => {
  const productSelect = document.getElementById(productSelectId);
  if (!productSelect) return;

  if (!brandId) {
    productSelect.innerHTML = '<option value="">Pilih Brand Dahulu</option>';
    productSelect.disabled = true;
    return;
  }

  const productIdsWithRecipe = new Set(recipes.map(r => r.id));
  const list = finishedGoodsData
    .filter(p => p.brandId === brandId && productIdsWithRecipe.has(p.id))
    .sort((a,b) => a.name.localeCompare(b.name));

  if (list.length === 0) {
    productSelect.innerHTML = '<option value="">Tidak ada produk dengan resep</option>';
    productSelect.disabled = true;
    return;
  }

  productSelect.innerHTML = ['<option value="">-- Pilih Produk --</option>']
    .concat(list.map(p => `<option value="${p.id}">${p.name}</option>`))
    .join('');
  productSelect.disabled = false;
};

// === Pagination Renderer ===
const renderPaginationControls = (key, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const state = paginationState[key];
    if (!state) return;

    const options = [5, 10, 25, 50, 100];
    const selectHTML = `
        <div class="flex items-center gap-2 text-sm">
            <label for="rows-per-page-${key}" class="text-slate-600">Baris:</label>
            <select id="rows-per-page-${key}" data-key="${key}" class="rows-per-page-select bg-white border-slate-300 rounded-md shadow-sm p-1">
                ${options.map(opt => `<option value="${opt}" ${state.rowsPerPage === opt ? 'selected' : ''}>${opt}</option>`).join('')}
            </select>
        </div>
    `;
    container.innerHTML = selectHTML;
};

const renderPaginationButtons = (key, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const state = paginationState[key];
    if (!state) return;

    const totalRows = state.data.length;
    const totalPages = Math.ceil(totalRows / state.rowsPerPage);
    const startRow = (state.currentPage - 1) * state.rowsPerPage + 1;
    const endRow = Math.min(state.currentPage * state.rowsPerPage, totalRows);

    if (totalRows === 0) {
        container.innerHTML = '';
        return;
    }

    let buttonsHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === state.currentPage;
        buttonsHTML += `<button 
            class="pagination-btn px-3 py-1 rounded-md ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}" 
            data-page="${i}" 
            data-key="${key}">
            ${i}
        </button>`;
    }

    container.innerHTML = `
        <div class="text-slate-600">
            Menampilkan ${startRow} - ${endRow} dari ${totalRows} data
        </div>
        <div class="flex items-center gap-2">
            ${buttonsHTML}
        </div>
    `;
};

const handlePaginationClick = (e) => {
    if (e.target.classList.contains('pagination-btn')) {
        const key = e.target.dataset.key;
        const page = parseInt(e.target.dataset.page, 10);
        if (paginationState[key]) {
            paginationState[key].currentPage = page;
            applyFiltersAndRender();
        }
    }
};

const handleRowsPerPageChange = (e) => {
    if (e.target.classList.contains('rows-per-page-select')) {
        const key = e.target.dataset.key;
        const rows = parseInt(e.target.value, 10);
        if (paginationState[key]) {
            paginationState[key].rowsPerPage = rows;
            paginationState[key].currentPage = 1; // Reset to first page
            applyFiltersAndRender();
        }
    }
};


// === Specific Page Renderers ===
const renderTableWithPagination = (config) => {
    const {
        key,
        data,
        tableBodyId,
        rowRenderer,
        paginationControlsId,
        paginationButtonsId,
        footerId,
        footerRenderer
    } = config;

    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    // Update pagination state with the full filtered data
    paginationState[key].data = data;
    const { currentPage, rowsPerPage } = paginationState[key];

    // Slice data for the current page
    const paginatedData = data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    // Render table rows
    tableBody.innerHTML = paginatedData.map(rowRenderer).join('') || `<tr><td colspan="100%" class="text-center py-4 text-slate-500">Tidak ada data.</td></tr>`;

    // Render pagination controls and buttons
    renderPaginationControls(key, paginationControlsId);
    renderPaginationButtons(key, paginationButtonsId);

    // Render footer if provided
    if (footerId && footerRenderer) {
        const footer = document.getElementById(footerId);
        if (footer) {
            footer.innerHTML = footerRenderer(data); // Footer calculates based on all filtered data
        }
    }
};

const renderInputPengeluaranPage = () => {
    const startDate = document.getElementById('start-date-pengeluaran')?.value;
    const endDate = document.getElementById('end-date-pengeluaran')?.value;
    
    let filteredData = filterByDateRange(expenditureHistory, 'date', startDate, endDate);
    filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));

    renderTableWithPagination({
        key: 'expenditure',
        data: filteredData,
        tableBodyId: 'table-rekap-pengeluaran',
        paginationControlsId: 'pagination-expenditure-controls',
        paginationButtonsId: 'pagination-expenditure',
        rowRenderer: item => `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-4 text-sm text-slate-700">${item.date}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.categoryDisplay}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.itemName}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.supplier}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${formatRupiah(item.unitPrice)}</td>
                <td class="px-6 py-4 text-sm font-medium text-slate-800">${formatRupiah(item.totalPrice)}</td>
            </tr>`,
        footerId: 'tfoot-rekap-pengeluaran',
        footerRenderer: (data) => {
            const total = data.reduce((sum, item) => sum + item.totalPrice, 0);
            return `<tr class="bg-slate-100 font-bold">
                        <td colspan="5" class="px-6 py-3 text-right text-slate-800">TOTAL</td>
                        <td class="px-6 py-3 text-slate-800">${formatRupiah(total)}</td>
                    </tr>`;
        }
    });
};


// === MAIN RENDER & FILTER LOGIC ===
const applyFiltersAndRender = () => {
    const activePageId = document.querySelector('.page.active')?.id;
    if (!activePageId) return;

    const pageRenderMap = {
        'page-dashboard': () => {
            const startDate = document.getElementById('start-date-dash')?.value;
            const endDate = document.getElementById('end-date-dash')?.value;
            const filteredProduction = filterByDateRange(productionHistory, 'date', startDate, endDate);
            const filteredGoodsOut = filterByDateRange(goodsOutHistory, 'date', startDate, endDate);
            const filteredStockAdd = filterByDateRange(stockAddHistory, 'date', startDate, endDate);
            renderDashboard(filteredProduction, filteredGoodsOut, filteredStockAdd, startDate, endDate);
        },
        'page-laporan': () => {
            const startDate = document.getElementById('start-date-laporan')?.value;
            const endDate = document.getElementById('end-date-laporan')?.value;
            renderReportsPage(
                filterByDateRange(productionHistory, 'date', startDate, endDate),
                filterByDateRange(goodsOutHistory, 'date', startDate, endDate),
                filterByDateRange(stockAddHistory, 'date', startDate, endDate),
                filterByDateRange(activityLogs, 'date', startDate, endDate)
            );
        },
        'page-input-pengeluaran': renderInputPengeluaranPage,
        'page-barang-keluar': () => {
            const sortedHistory = [...goodsOutHistory].sort((a,b) => new Date(b.date) - new Date(a.date));
            renderTableWithPagination({
                key: 'goodsOutHistory',
                data: sortedHistory,
                tableBodyId: 'table-goods-out-history',
                paginationControlsId: 'pagination-goods-out-history-controls',
                paginationButtonsId: 'pagination-goods-out-history',
                rowRenderer: item => `
                    <tr class="hover:bg-slate-50">
                        <td class="px-6 py-4 text-sm text-slate-700">${item.date}</td>
                        <td class="px-6 py-4 text-sm text-slate-700">${item.brandName || '-'}</td>
                        <td class="px-6 py-4 text-sm text-slate-700">${item.productName}</td>
                        <td class="px-6 py-4 text-sm text-slate-700">${item.quantity.toLocaleString('id-ID')}</td>
                        <td class="px-6 py-4 text-sm space-x-2">
                            <button class="edit-g-out-btn px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800" data-id="${item.id}">Edit</button>
                            <button class="delete-g-out-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${item.id}">Hapus</button>
                        </td>
                    </tr>`
            });
        },
        'page-admin': () => {
            renderAdminPage();
            renderBrandsTable();
        },
        'page-input': () => {
            renderDefinedItemsLists();
            setupRecipeLookup();
            displayRecipeDetails();
            renderSupplementaryMaterialsTable();
            populateUnitsDropdowns();
            populateBrandsDropdowns();
        },
        'page-master': () => {
            renderRawMaterialsTable(rawMaterialsData.filter(item => item.name.toLowerCase().includes(document.getElementById('search-raw').value.toLowerCase())));
            renderFinishedGoodsTable(finishedGoodsData.filter(item => (item.name.toLowerCase() + (item.brandName || '').toLowerCase()).includes(document.getElementById('search-finished').value.toLowerCase())));
            renderMasterSupplementaryTable(supplementaryMaterialsData.filter(item => item.name.toLowerCase().includes(document.getElementById('search-supplementary').value.toLowerCase())));
        }
    };

    if (pageRenderMap[activePageId]) {
        pageRenderMap[activePageId]();
    }
};

const renderDashboard = (filteredProduction, filteredGoodsOut, filteredStockAdd, startDate, endDate) => {
  updateKPIs(startDate, endDate, filteredProduction, filteredStockAdd);
  renderPieCharts(filteredProduction, filteredGoodsOut);
  renderDashboardTables(rawMaterialsData, finishedGoodsData);
  renderTrendlineChart(filteredProduction, filteredGoodsOut, filteredStockAdd);
};

const renderRawMaterialsTable = (data) => {
    renderTableWithPagination({
        key: 'rawMaterials',
        data: data,
        tableBodyId: 'table-raw-materials',
        paginationControlsId: 'pagination-rawMaterials-controls',
        paginationButtonsId: 'pagination-rawMaterials',
        rowRenderer: item => `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-4 text-sm text-slate-700">${item.name}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.stock.toLocaleString('id-ID')} ${item.unit}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${formatRupiah(item.price)}</td>
                <td class="px-6 py-4 text-sm font-medium text-slate-800">${formatRupiah(item.stock * item.price)}</td>
                <td class="px-6 py-4 text-sm space-x-2">
                    <button class="edit-item-btn px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700" data-collection="rawMaterials" data-id="${item.id}">Edit</button>
                    <button class="delete-rm-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${item.id}">Hapus</button>
                </td>
            </tr>`
    });
};

const renderFinishedGoodsTable = (data) => {
    renderTableWithPagination({
        key: 'finishedGoods',
        data: data,
        tableBodyId: 'table-finished-goods',
        paginationControlsId: 'pagination-finishedGoods-controls',
        paginationButtonsId: 'pagination-finishedGoods',
        rowRenderer: item => `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-4 text-sm text-slate-700">${item.brandName || '-'}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.name}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.stock.toLocaleString('id-ID')}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${formatRupiah(item.hpp)}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${formatRupiah(item.price)}</td>
                <td class="px-6 py-4 text-sm font-medium text-slate-800">${formatRupiah(item.stock * item.hpp)}</td>
                <td class="px-6 py-4 text-sm space-x-2">
                    <button class="edit-item-btn px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700" data-collection="finishedGoods" data-id="${item.id}">Edit</button>
                    <button class="delete-fg-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${item.id}">Hapus</button>
                </td>
            </tr>`
    });
};

const renderMasterSupplementaryTable = (data) => {
    renderTableWithPagination({
        key: 'masterSupplementary',
        data: data,
        tableBodyId: 'table-master-supplementary',
        paginationControlsId: 'pagination-masterSupplementary-controls',
        paginationButtonsId: 'pagination-masterSupplementary',
        rowRenderer: item => `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-4 text-sm text-slate-700">${item.name}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${item.stock.toLocaleString('id-ID')} ${item.unit}</td>
                <td class="px-6 py-4 text-sm text-slate-700">${formatRupiah(item.price)}</td>
                <td class="px-6 py-4 text-sm font-medium text-slate-800">${formatRupiah(item.stock * item.price)}</td>
                <td class="px-6 py-4 text-sm space-x-2">
                    <button class="edit-item-btn px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700" data-collection="supplementaryMaterials" data-id="${item.id}">Edit</button>
                    <button class="delete-sm-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${item.id}">Hapus</button>
                </td>
            </tr>`
    });
};

const renderSupplementaryMaterialsTable = () => { const tableContainer = document.getElementById('table-container-sm'); if (!tableContainer) return; let totalValue = 0; const rowsHTML = supplementaryMaterialsData.map(item => { totalValue += item.stock * item.price; return `<tr class="hover:bg-slate-50"><td class="px-6 py-4 text-sm text-slate-700">${item.name}</td><td class="px-6 py-4 text-sm text-slate-700">${item.lastSupplier || '-'}</td><td class="px-6 py-4 text-sm text-slate-700">${item.stock.toLocaleString('id-ID')} ${item.unit}</td><td class="px-6 py-4 text-sm text-slate-700">${formatRupiah(item.price)}</td><td class="px-6 py-4 text-sm font-medium text-slate-800">${formatRupiah(item.stock * item.price)}</td><td class="px-6 py-4 text-sm"><button class="edit-sm-stock-btn px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800" data-id="${item.id}" data-name="${item.name}" data-stock="${item.stock}">Edit Stok</button></td></tr>`; }).join(''); const tableHTML = `<thead class="bg-slate-50"><tr><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bahan Pelengkap</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Supplier Terakhir</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stok</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Rata-rata</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Nilai</th><th class="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Aksi</th></tr></thead><tbody class="bg-white divide-y divide-slate-100">${rowsHTML || `<tr><td colspan="6" class="text-center py-4 text-slate-500">Belum ada data bahan pelengkap.</td></tr>`}</tbody><tfoot><tr class="bg-slate-100 font-bold"><td colspan="4" class="px-6 py-3 text-right text-slate-800">TOTAL</td><td class="px-6 py-3 text-slate-800">${formatRupiah(totalValue)}</td><td></td></tr></tfoot>`; tableContainer.innerHTML = tableHTML; };
const setupRecipeLookup = () => { const brandSelect = document.getElementById('recipe-lookup-brand'); const productSelect = document.getElementById('recipe-lookup-product'); if (!brandSelect || !productSelect) return; const productIdsWithRecipe = new Set(recipes.map(r => r.id)); const productsWithRecipes = finishedGoodsData.filter(fg => productIdsWithRecipe.has(fg.id)); const brandMap = new Map(); productsWithRecipes.forEach(p => brandMap.set(p.brandId, p.brandName || (brandsData.find(b => b.id === p.brandId)?.name) || '-')); const currentBrand = brandSelect.value; const brandOptions = ['<option value="">-- Pilih Brand --</option>'].concat(Array.from(brandMap.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${id}" ${currentBrand === id ? 'selected' : ''}>${name}</option>`)).join(''); brandSelect.innerHTML = brandOptions; const populateProducts = (brandId) => { if (!brandId) { productSelect.innerHTML = '<option value="">Pilih Brand Dahulu</option>'; productSelect.disabled = true; return; } const list = productsWithRecipes.filter(p => p.brandId === brandId).sort((a,b) => a.name.localeCompare(b.name)); if (list.length === 0) { productSelect.innerHTML = '<option value="">Tidak ada produk dengan resep</option>'; productSelect.disabled = true; return; } const currentProduct = productSelect.value; productSelect.innerHTML = ['<option value="">-- Pilih Produk --</option>'].concat(list.map(p => `<option value="${p.id}" ${currentProduct === p.id ? 'selected' : ''}>${p.name}</option>`)).join(''); productSelect.disabled = false; }; populateProducts(brandSelect.value); };
const populateProductsByBrandForRecipeLookup = (brandId) => { const productSelect = document.getElementById('recipe-lookup-product'); if (!productSelect) return; const productIdsWithRecipe = new Set(recipes.map(r => r.id)); const productsWithRecipes = finishedGoodsData.filter(fg => productIdsWithRecipe.has(fg.id) && fg.brandId === brandId).sort((a,b) => a.name.localeCompare(b.name)); if (!brandId) { productSelect.innerHTML = '<option value="">Pilih Brand Dahulu</option>'; productSelect.disabled = true; return; } if (productsWithRecipes.length === 0) { productSelect.innerHTML = '<option value="">Tidak ada produk dengan resep</option>'; productSelect.disabled = true; return; } productSelect.innerHTML = ['<option value="">-- Pilih Produk --</option>'].concat(productsWithRecipes.map(p => `<option value="${p.id}">${p.name}</option>`)).join(''); productSelect.disabled = false; };
const displayRecipeDetails = () => { const productSelect = document.getElementById('recipe-lookup-product'); const detailsContainer = document.getElementById('recipe-lookup-details'); if (!productSelect || !detailsContainer) return; const selectedProductId = productSelect.value; if (!selectedProductId) { detailsContainer.innerHTML = '<p class="text-center text-slate-500">Silakan pilih produk untuk melihat resepnya.</p>'; return; } const selectedRecipe = recipes.find(r => r.id === selectedProductId); const materials = selectedRecipe?.materials || {}; const materialEntries = Object.entries(materials); if (materialEntries.length === 0) { detailsContainer.innerHTML = '<p class="text-center text-slate-500">Resep untuk produk ini masih kosong.</p>'; return; } let totalHpp = 0; const rows = materialEntries.map(([rmId, quantity]) => { const material = rawMaterialsData.find(rm => rm.id === rmId); if (!material) return ''; const lineTotal = quantity * material.price; totalHpp += lineTotal; return `<tr class="border-b border-slate-200"><td class="px-4 py-3 text-sm text-slate-700">${material.name}</td><td class="px-4 py-3 text-sm text-slate-700">${quantity} ${material.unit}</td><td class="px-4 py-3 text-sm text-slate-700">${formatRupiah(material.price)}</td><td class="px-4 py-3 text-sm text-slate-800 font-medium">${formatRupiah(lineTotal)}</td></tr>`; }).join(''); detailsContainer.innerHTML = `<div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-100"><tr><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bahan Baku</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Harga Satuan</th><th class="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th></tr></thead><tbody class="divide-y divide-slate-200">${rows}</tbody><tfoot><tr class="bg-slate-100"><td colspan="3" class="px-4 py-2 text-right text-sm font-bold text-slate-800">Total HPP per Unit</td><td class="px-4 py-2 text-left text-sm font-bold text-indigo-600">${formatRupiah(totalHpp)}</td></tr></tfoot></table></div>`; };
const renderAdminPage = () => { const rolesTableBody = document.getElementById('table-roles'); const usersTableBody = document.getElementById('table-users'); const roleDropdown = document.getElementById('new-user-role'); const permissionsContainer = document.getElementById('role-permissions'); if(rolesTableBody) rolesTableBody.innerHTML = roles.map(role => `<tr class="hover:bg-slate-50"><td class="px-4 py-2 text-sm font-medium">${role.name}</td><td class="px-4 py-2 text-sm space-x-2">${role.name !== 'Admin' ? `<button class="edit-role-btn px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700" data-id="${role.id}">Edit</button><button class="delete-role-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${role.id}">Hapus</button>` : '<span class="text-xs text-slate-500">Default Role</span>'}</td></tr>`).join(''); if(usersTableBody) usersTableBody.innerHTML = users.map(user => { const role = roles.find(r => r.id === user.roleId); return `<tr class="hover:bg-slate-50"><td class="px-4 py-2 text-sm text-slate-700">${user.email}</td><td class="px-4 py-2 text-sm text-slate-700">${role ? role.name : 'Tidak Diketahui'}</td><td class="px-4 py-2 text-sm space-x-2">${user.email !== auth.currentUser.email ? `<button class="edit-user-btn px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700" data-id="${user.id}">Edit</button><button class="delete-user-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${user.id}">Hapus</button>` : '<span class="text-xs text-slate-500">Akun Anda</span>'}</td></tr>`}).join(''); if(roleDropdown) roleDropdown.innerHTML = roles.map(role => `<option value="${role.id}">${role.name}</option>`).join(''); if(permissionsContainer) { const pages = ['dashboard', 'kalkulator', 'produksi', 'barang-keluar', 'input', 'input-pengeluaran', 'master', 'laporan', 'admin']; permissionsContainer.innerHTML = pages.map(page => `<label class="flex items-center space-x-2"><input type="checkbox" class="role-permission-cb rounded text-indigo-600 focus:ring-indigo-500" value="${page}"><span class="capitalize">${page.replace('-', ' ')}</span></label>`).join(''); } populateAppSettingsForm(); };
const renderBrandsTable = () => { const tableBody = document.getElementById('table-brands'); if(tableBody) tableBody.innerHTML = brandsData.map(brand => `<tr><td class="px-4 py-2 text-sm font-medium">${brand.name}</td><td class="px-4 py-2 text-sm space-x-2"><button class="edit-brand-btn px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700" data-collection="brands" data-id="${brand.id}">Edit</button><button class="delete-brand-btn px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700" data-id="${brand.id}">Hapus</button></td></tr>`).join('') || `<tr><td colspan="2" class="text-center text-slate-500 py-3">Belum ada brand.</td></tr>`; };
const renderReportsPage = (filteredProduction, filteredGoodsOut, filteredStockAdd, filteredLogs) => {
    const summaryContainer = document.getElementById('report-summary-container');
    if (!summaryContainer) return;

    let totalHpp = 0, totalSales = 0;
    filteredGoodsOut.forEach(item => {
        const product = finishedGoodsData.find(p => p.id === item.productId);
        if (product) {
            totalHpp += (Number(item.quantity) || 0) * (Number(product.hpp) || 0);
            totalSales += (Number(item.quantity) || 0) * (Number(product.price) || 0);
        }
    });
    const grossProfit = totalSales - totalHpp;
    summaryContainer.innerHTML = `<div class="card"><p class="text-sm font-medium text-slate-500">Total Penjualan</p><p class="text-3xl font-bold text-blue-600">${formatRupiah(totalSales)}</p></div><div class="card"><p class="text-sm font-medium text-slate-500">Total HPP</p><p class="text-3xl font-bold text-red-600">${formatRupiah(totalHpp)}</p></div><div class="card"><p class="text-sm font-medium text-slate-500">Estimasi Laba Kotor</p><p class="text-3xl font-bold text-green-600">${formatRupiah(grossProfit)}</p></div>`;

    renderTableWithPagination({
        key: 'reportStockAdd', data: filteredStockAdd, tableBodyId: 'table-report-stock-add', paginationControlsId: 'pagination-reportStockAdd-controls', paginationButtonsId: 'pagination-reportStockAdd',
        rowRenderer: item => `
            <tr class="hover:bg-slate-50"><td class="px-6 py-4 text-sm">${item.date}</td><td class="px-6 py-4 text-sm">${item.itemName}</td><td class="px-6 py-4 text-sm">${item.supplier || '-'}</td><td class="px-6 py-4 text-sm">${(item.quantity||0).toLocaleString('id-ID')}</td><td class="px-6 py-4 text-sm">${formatRupiah(Number(item.price)||0)}</td><td class="px-6 py-4 text-sm font-medium">${formatRupiah((Number(item.quantity)||0)*(Number(item.price)||0))}</td></tr>`,
        footerId: 'tfoot-report-stock-add', footerRenderer: data => `<tr class="bg-slate-100 font-bold"><td class="px-6 py-3 text-right" colspan="3">TOTAL</td><td class="px-6 py-3">${data.reduce((s,i)=> s + (Number(i.quantity)||0), 0).toLocaleString('id-ID')}</td><td class="px-6 py-3">—</td><td class="px-6 py-3">${formatRupiah(data.reduce((s,i)=> s + ((Number(i.quantity)||0)*(Number(i.price)||0)), 0))}</td></tr>`
    });
    renderTableWithPagination({
        key: 'reportProduction', data: filteredProduction, tableBodyId: 'table-report-production', paginationControlsId: 'pagination-reportProduction-controls', paginationButtonsId: 'pagination-reportProduction',
        rowRenderer: item => `
            <tr class="hover:bg-slate-50"><td class="px-6 py-4 text-sm">${item.date}</td><td class="px-6 py-4 text-sm">${item.productName}</td><td class="px-6 py-4 text-sm">${(item.quantity||0).toLocaleString('id-ID')}</td><td class="px-6 py-4 text-sm">${formatRupiah(Number(item.totalCost)||0)}</td></tr>`,
        footerId: 'tfoot-report-production', footerRenderer: data => `<tr class="bg-slate-100 font-bold"><td class="px-6 py-3 text-right" colspan="2">TOTAL</td><td class="px-6 py-3">${data.reduce((s,i)=> s + (Number(i.quantity)||0), 0).toLocaleString('id-ID')}</td><td class="px-6 py-3">${formatRupiah(data.reduce((s,i)=> s + (Number(i.totalCost)||0), 0))}</td></tr>`
    });
    renderTableWithPagination({
        key: 'reportGoodsOut', data: filteredGoodsOut, tableBodyId: 'table-report-goods-out', paginationControlsId: 'pagination-reportGoodsOut-controls', paginationButtonsId: 'pagination-reportGoodsOut',
        rowRenderer: item => {
            const product = finishedGoodsData.find(p => p.id === item.productId); if (!product) return '';
            const itemTotalHpp = (Number(item.quantity) || 0) * (Number(product.hpp) || 0); const itemTotalSales = (Number(item.quantity) || 0) * (Number(product.price) || 0);
            return `<tr class="hover:bg-slate-50"><td class="px-6 py-4 text-sm">${item.date}</td><td class="px-6 py-4 text-sm">${item.productName}</td><td class="px-6 py-4 text-sm">${(item.quantity||0).toLocaleString('id-ID')}</td><td class="px-6 py-4 text-sm">${formatRupiah(itemTotalHpp)}</td><td class="px-6 py-4 text-sm">${formatRupiah(itemTotalSales)}</td><td class="px-6 py-4 text-sm font-medium text-green-600">${formatRupiah(itemTotalSales - itemTotalHpp)}</td></tr>`;
        },
        footerId: 'tfoot-report-goods-out', footerRenderer: data => {
            let totalHpp = 0, totalSales = 0; data.forEach(item => { const product = finishedGoodsData.find(p => p.id === item.productId); if (product) { totalHpp += (Number(item.quantity) || 0) * (Number(product.hpp) || 0); totalSales += (Number(item.quantity) || 0) * (Number(product.price) || 0); } });
            return `<tr class="bg-slate-100 font-bold"><td class="px-6 py-3 text-right" colspan="2">TOTAL</td><td class="px-6 py-3">${data.reduce((s,i)=> s + (Number(i.quantity)||0), 0).toLocaleString('id-ID')}</td><td class="px-6 py-3">${formatRupiah(totalHpp)}</td><td class="px-6 py-3">${formatRupiah(totalSales)}</td><td class="px-6 py-3 text-green-600">${formatRupiah(totalSales - totalHpp)}</td></tr>`;
        }
    });

    const userFilterSel = document.getElementById('log-user-filter');
    const selectedUser = userFilterSel?.value || '';
    let logsToRender = selectedUser ? filteredLogs.filter(l => l.userEmail === selectedUser) : filteredLogs;
    logsToRender.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (userFilterSel) { const current = userFilterSel.value; const uniqueEmails = Array.from(new Set(activityLogs.map(l => l.userEmail).filter(Boolean))).sort(); userFilterSel.innerHTML = ['<option value="">Semua Pengguna</option>'].concat(uniqueEmails.map(email => `<option value="${email}" ${current===email?'selected':''}>${email}</option>`)).join(''); }
    
    const labelMap = { stock_add_raw: 'Input Stok • Bahan Baku', stock_add_finished: 'Input Stok • Barang Jadi', stock_add_supplementary: 'Input Stok • Bahan Pelengkap', production: 'Produksi', goods_out: 'Barang Keluar', goods_out_edit: 'Edit Barang Keluar', expenditure_add: 'Input Pengeluaran', };
    renderTableWithPagination({
        key: 'activityLog', data: logsToRender, tableBodyId: 'table-activity-log-body', paginationControlsId: 'pagination-activityLog-controls', paginationButtonsId: 'pagination-activityLog',
        rowRenderer: l => {
            const waktu = new Date(l.timestamp).toLocaleString('id-ID'); const jenis = labelMap[l.action] || l.action; let detail = l.details || '';
            if (!detail) { if (l.action === 'production') detail = `${l.productName} — ${l.quantity} unit (Biaya: ${formatRupiah(l.totalCost || 0)})`; else if (l.action.startsWith('stock_add')) detail = `${l.itemName} — ${l.quantity} ${l.unit || ''} @ ${formatRupiah(l.price || 0)}`; else if (l.action.startsWith('goods_out')) detail = `${l.brandName ? l.brandName+' - ': ''}${l.productName} — ${l.quantity} unit`; else if (l.action === 'expenditure_add') detail = `${l.itemName} — ${l.quantity} ${l.unit || ''} (Total: ${formatRupiah(l.totalPrice || 0)})`; }
            return `<tr class="hover:bg-slate-50"><td class="px-6 py-3 text-sm">${waktu}</td><td class="px-6 py-3 text-sm">${l.userEmail || '-'}</td><td class="px-6 py-3 text-sm">${jenis}</td><td class="px-6 py-3 text-sm">${detail}</td></tr>`;
        },
        footerId: 'tfoot-activity-log', footerRenderer: data => `<tr class="bg-slate-100 font-bold"><td class="px-6 py-3 text-right" colspan="3">TOTAL AKTIVITAS</td><td class="px-6 py-3">${data.length.toLocaleString('id-ID')}</td></tr>`
    });
};
const renderDefinedItemsLists = () => { const rmList = document.getElementById('list-defined-raw-materials'); const fgList = document.getElementById('list-defined-finished-goods'); if (rmList) rmList.innerHTML = rawMaterialsData.map(item => `<div class="text-sm p-2 bg-white rounded">${item.name} (${item.unit})</div>`).join('') || `<p class="text-center text-slate-500 text-sm">Belum ada bahan baku.</p>`; if (fgList) fgList.innerHTML = finishedGoodsData.map(item => `<div class="text-sm p-2 bg-white rounded">${item.brandName} - ${item.name}</div>`).join('') || `<p class="text-center text-slate-500 text-sm">Belum ada barang jadi.</p>`; };
const renderRecipeForm = (searchTerm = '') => { const fgId = document.getElementById('recipe-fg-name')?.value; const container = document.getElementById('recipe-materials-container'); if (!container) return; if (!fgId) { container.innerHTML = '<p class="text-sm text-center text-slate-500">Pilih produk jadi untuk mengatur resepnya.</p>'; return; } const recipe = recipes.find(r => r.id === fgId); const materials = recipe ? recipe.materials : {}; const lowerCaseSearchTerm = searchTerm.toLowerCase(); const sortedRawMaterials = [...rawMaterialsData].sort((a, b) => a.name.localeCompare(b.name)); const filteredMaterials = sortedRawMaterials.filter(rm => rm.name.toLowerCase().includes(lowerCaseSearchTerm)); container.innerHTML = filteredMaterials.map(rm => { const val = (recipeDraft[rm.id] != null ? recipeDraft[rm.id] : (materials[rm.id] ?? '')); return `<div class="grid grid-cols-5 gap-2 items-center"><label class="text-sm text-slate-600 col-span-3">${rm.name}</label><input type="number" min="0" step="any" placeholder="Jumlah" data-rm-id="${rm.id}" value="${val}" class="recipe-input col-span-1 block w-full px-2 py-1 border border-slate-300 rounded-md text-sm"><span class="text-sm text-slate-500 col-span-1">${rm.unit}</span></div>`; }).join('') || '<p class="text-sm text-center text-slate-500">Bahan baku tidak ditemukan.</p>'; };
const renderProductionRawMaterials = (searchTerm = '') => { const rmContainer = document.getElementById('raw-material-selection-container'); if (!rmContainer) return; const lowerCaseSearchTerm = searchTerm.toLowerCase(); const filteredMaterials = rawMaterialsData.filter(rm => rm.name.toLowerCase().includes(lowerCaseSearchTerm)); rmContainer.innerHTML = filteredMaterials.map(rm => { const currentValue = productionInputs[rm.id] || ''; return `<div class="grid grid-cols-3 gap-4 items-center"><label class="text-sm text-slate-600 col-span-1">${rm.name}</label><span class="text-xs text-slate-500 text-right">Stok: ${rm.stock.toLocaleString('id-ID')} ${rm.unit}</span><input type="number" min="0" value="${currentValue}" data-rm-id="${rm.id}" placeholder="Jumlah" class="col-span-1 block w-full px-2 py-1 border border-slate-300 rounded-md text-sm production-rm-input"></div>` }).join('') || `<p class="text-center text-slate-500 text-sm">Bahan baku tidak ditemukan.</p>`; };
const populateAppSettingsForm = () => { const form = document.getElementById('form-app-settings'); if(form) { form.elements['setting-title'].value = appSettings.title || 'Data Gudang'; form.elements['setting-logo-url'].value = appSettings.logoUrl || ''; } };
const updateKPIs = () => { const kpiContainer = document.getElementById('kpi-container'); if (!kpiContainer) return; const startDate = document.getElementById('start-date-dash')?.value || ''; const endDate = document.getElementById('end-date-dash')?.value || ''; const hasFilter = !!(startDate || endDate); let rawVal = 0, suppVal = 0, finVal = 0; if (!hasFilter) { rawVal = rawMaterialsData.reduce((s, i) => s + (i.stock || 0) * (i.price || 0), 0); suppVal = supplementaryMaterialsData.reduce((s, i) => s + (i.stock || 0) * (i.price || 0), 0); finVal = finishedGoodsData.reduce((s, i) => s + (i.stock || 0) * (i.hpp || 0), 0); } else { const adds = filterByDateRange(stockAddHistory, 'date', startDate, endDate); const prods = filterByDateRange(productionHistory, 'date', startDate, endDate); const sumVal = (arr) => arr.reduce((s, x) => s + (Number(x.quantity) || 0) * (Number(x.price) || 0), 0); const addRaw = sumVal(adds.filter(x => x.type === 'Bahan Baku')); const addSupp = sumVal(adds.filter(x => x.type === 'Bahan Pelengkap')); const addFGAdj = sumVal(adds.filter(x => x.type === 'Barang Jadi')); const prodCost = prods.reduce((s, p) => s + (Number(p.totalCost) || 0), 0); rawVal = addRaw; suppVal = addSupp; finVal = addFGAdj + prodCost; } const totalVal = rawVal + suppVal + finVal; kpiContainer.innerHTML = `<div class="card"><p class="text-sm font-medium text-slate-500">Nilai Stok Bahan Baku${hasFilter ? ' (periode)' : ''}</p><p class="text-3xl text-indigo-600 font-bold">${formatRupiah(rawVal)}</p></div><div class="card"><p class="text-sm font-medium text-slate-500">Nilai Stok Bahan Pelengkap${hasFilter ? ' (periode)' : ''}</p><p class="text-3xl text-sky-600 font-bold">${formatRupiah(suppVal)}</p></div><div class="card"><p class="text-sm font-medium text-slate-500">Nilai Stok Barang Jadi${hasFilter ? ' (periode)' : ''}</p><p class="text-3xl text-green-600 font-bold">${formatRupiah(finVal)}</p></div>`; let totalCard = document.getElementById('total-stock-card'); if (!totalCard) { totalCard = document.createElement('div'); totalCard.id = 'total-stock-card'; totalCard.className = 'mb-6'; totalCard.innerHTML = `<div class="relative overflow-hidden rounded-xl text-white p-6 md:p-8"><img id="total-stock-bg-logo" alt="" class="absolute right-8 top-1/2 -translate-y-1/2 w-0 md:w-32 opacity-80 pointer-events-none select-none" /><p class="text-sm font-medium opacity-80">Total Nilai Stok Gudang</p><p id="total-stock-value" class="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight text-yellow-300">Rp 0</p></div>`; const page = document.getElementById('page-dashboard'); const trendCard = page?.querySelector('.card.mb-6'); if (trendCard) page.insertBefore(totalCard, trendCard); else kpiContainer.insertAdjacentElement('afterend', totalCard); } const valueEl = document.getElementById('total-stock-value'); if (valueEl) valueEl.textContent = formatRupiah(totalVal); const totalInner = totalCard.querySelector('.relative'); if (totalInner) totalInner.style.backgroundColor = '#002e4e'; const bgLogo = document.getElementById('total-stock-bg-logo'); if (bgLogo) { if (appSettings?.logoUrl) { if (!bgLogo.src) bgLogo.src = appSettings.logoUrl; bgLogo.style.display = 'block'; } else { bgLogo.style.display = 'none'; } } };
const renderPieCharts = (filteredProduction, filteredGoodsOut) => { const prodCtx = document.getElementById('productionPieChart')?.getContext('2d'); if(prodCtx) { if (productionPieChartInstance) productionPieChartInstance.destroy(); const prodSummary = filteredProduction.reduce((acc, curr) => { acc[curr.productName] = (acc[curr.productName] || 0) + curr.quantity; return acc; }, {}); productionPieChartInstance = new Chart(prodCtx, { type: 'pie', data: { labels: Object.keys(prodSummary), datasets: [{ data: Object.values(prodSummary), backgroundColor: ['#4f46e5', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'] }] }, options: { responsive: true, maintainAspectRatio: false } }); } const goodsOutCtx = document.getElementById('goodsOutPieChart')?.getContext('2d'); if(goodsOutCtx) { if (goodsOutPieChartInstance) goodsOutPieChartInstance.destroy(); const goodsOutSummary = filteredGoodsOut.reduce((acc, curr) => { acc[curr.productName] = (acc[curr.productName] || 0) + curr.quantity; return acc; }, {}); goodsOutPieChartInstance = new Chart(goodsOutCtx, { type: 'pie', data: { labels: Object.keys(goodsOutSummary), datasets: [{ data: Object.values(goodsOutSummary), backgroundColor: ['#ef4444', '#8b5cf6', '#22c55e', '#eab308', '#06b6d4'] }] }, options: { responsive: true, maintainAspectRatio: false } }); } };
const renderTrendlineChart = (filteredProduction, filteredGoodsOut, filteredStockAdd) => { const ctx = document.getElementById('trendlineChart')?.getContext('2d'); if (!ctx) return; const allDates = new Set([...filteredProduction.map(p => p.date), ...filteredGoodsOut.map(g => g.date), ...filteredStockAdd.filter(s => s.type === 'Bahan Baku').map(s => s.date)]); const labels = Array.from(allDates).sort(); const aggregateByDate = (data, valueField) => { const aggregated = data.reduce((acc, curr) => { acc[curr.date] = (acc[curr.date] || 0) + (valueField(curr)); return acc; }, {}); return labels.map(date => aggregated[date] || 0); }; const productionDataPoints = aggregateByDate(filteredProduction, item => item.quantity); const goodsOutDataPoints = aggregateByDate(filteredGoodsOut, item => item.quantity); const stockAddDataPoints = aggregateByDate(filteredStockAdd.filter(s => s.type === 'Bahan Baku'), item => item.quantity * item.price); if (trendlineChartInstance) trendlineChartInstance.destroy(); trendlineChartInstance = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Jumlah Produksi', data: productionDataPoints, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.4, yAxisID: 'y' }, { label: 'Jumlah Barang Keluar', data: goodsOutDataPoints, borderColor: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.1)', fill: true, tension: 0.4, yAxisID: 'y' }, { label: 'Nilai Pembelian Bahan', data: stockAddDataPoints, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, yAxisID: 'y1' } ] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(0, 0, 0, 0.05)' }, title: { display: true, text: 'Jumlah (Unit)' } }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Nilai (IDR)' } } }, plugins: { legend: { position: 'top' } }, interaction: { intersect: false, mode: 'index' } } }); };

// === FORM HANDLERS ===
async function handleDefineRawMaterial(e) { e.preventDefault(); const form = e.target, name = form.elements['define-rm-name'].value, unit = form.elements['define-rm-unit'].value; if (rawMaterialsData.some(item => item.name.toLowerCase() === name.toLowerCase())) return showNotification(`Bahan baku '${name}' sudah ada.`, true); try { await addDoc(collection(db, 'rawMaterials'), { name, unit, stock: 0, price: 0 }); showNotification(`Bahan baku '${name}' berhasil didaftarkan.`); form.reset(); } catch (error) { showNotification("Gagal mendaftarkan bahan baku.", true); } };
async function handleDefineFinishedGood(e) { e.preventDefault(); const form = e.target, name = form.elements['define-fg-name'].value, brandId = form.elements['define-fg-brand'].value; if (!brandId) return showNotification("Pilih brand terlebih dahulu.", true); const brand = brandsData.find(b => b.id === brandId); if (finishedGoodsData.some(item => item.name.toLowerCase() === name.toLowerCase() && item.brandId === brandId)) return showNotification(`Barang jadi '${name}' untuk brand ${brand.name} sudah ada.`, true); try { await addDoc(collection(db, 'finishedGoods'), { name, brandId, brandName: brand.name, stock: 0, hpp: 0, price: 0 }); showNotification(`Barang jadi '${name}' berhasil didaftarkan.`); form.reset(); } catch (error) { showNotification("Gagal mendaftarkan barang jadi.", true); } };
async function handleDefineSupplementaryMaterial(e) { e.preventDefault(); const form = e.target, name = form.elements['new-sm-name-modal'].value, unit = form.elements['new-sm-unit-modal'].value; if (supplementaryMaterialsData.some(item => item.name.toLowerCase() === name.toLowerCase())) return showNotification(`Bahan pelengkap '${name}' sudah ada.`, true); try { await addDoc(collection(db, 'supplementaryMaterials'), { name, unit, stock: 0, price: 0, lastSupplier: '' }); showNotification(`Bahan pelengkap '${name}' berhasil didaftarkan.`); form.reset(); document.getElementById('add-sm-modal').style.display = 'none'; } catch (error) { showNotification("Gagal mendaftarkan bahan pelengkap.", true); } };
async function handleDefineRawMaterialFromModal(e) { e.preventDefault(); const form = e.target, name = form.elements['new-rm-name-modal'].value, unit = form.elements['new-rm-unit-modal'].value; if (rawMaterialsData.some(item => item.name.toLowerCase() === name.toLowerCase())) return showNotification(`Bahan baku '${name}' sudah ada.`, true); try { await addDoc(collection(db, 'rawMaterials'), { name, unit, stock: 0, price: 0 }); showNotification(`Bahan baku '${name}' berhasil didaftarkan.`); form.reset(); document.getElementById('add-rm-modal').style.display = 'none'; } catch (error) { showNotification("Gagal mendaftarkan bahan baku.", true); } };
async function handleDefineFinishedGoodFromModal(e) { e.preventDefault(); const form = e.target, name = form.elements['new-fg-name-modal'].value, brandId = form.elements['new-fg-brand-modal'].value; if (!brandId) return showNotification("Pilih brand terlebih dahulu.", true); const brand = brandsData.find(b => b.id === brandId); if (finishedGoodsData.some(item => item.name.toLowerCase() === name.toLowerCase() && item.brandId === brandId)) return showNotification(`Barang jadi '${name}' untuk brand ${brand.name} sudah ada.`, true); try { await addDoc(collection(db, 'finishedGoods'), { name, brandId, brandName: brand.name, stock: 0, hpp: 0, price: 0 }); showNotification(`Barang jadi '${name}' berhasil didaftarkan.`); form.reset(); document.getElementById('add-fg-modal').style.display = 'none'; } catch (error) { showNotification("Gagal mendaftarkan barang jadi.", true); } };
async function handleAddStockRawMaterial(e) { e.preventDefault(); const form = e.target, id = form.elements['add-rm-id'].value, newStock = parseFloat(form.elements['add-rm-stock'].value), newPrice = parseFloat(form.elements['add-rm-price'].value), supplier = form.elements['add-rm-supplier'].value; if (!id) return showNotification('Silakan pilih bahan baku.', true); const item = rawMaterialsData.find(i => i.id === id); const totalStock = item.stock + newStock; const newAvgPrice = totalStock > 0 ? ((item.stock * item.price) + (newStock * newPrice)) / totalStock : newPrice; try { const batch = writeBatch(db); batch.update(doc(db, 'rawMaterials', id), { stock: totalStock, price: newAvgPrice }); batch.set(doc(collection(db, 'stockAddHistory')), { date: getTodayDate(), itemName: item.name, supplier, quantity: newStock, price: newPrice, type: 'Bahan Baku' }); batch.set(doc(collection(db, 'activityLogs')), { timestamp: new Date().toISOString(), date: getTodayDate(), userEmail: auth.currentUser?.email || '-', action: 'stock_add_raw', itemId: id, itemName: item.name, quantity: newStock, price: newPrice, unit: item.unit }); await batch.commit(); showNotification(`Stok & harga untuk ${item.name} berhasil diperbarui.`); form.reset(); document.getElementById('search-add-rm').value = ''; } catch (error) { showNotification("Gagal memperbarui stok.", true); } };
async function handleAddStockFinishedGood(e) { e.preventDefault(); const form = e.target, id = form.elements['add-fg-name'].value, newStock = parseFloat(form.elements['add-fg-stock'].value), price = parseFloat(form.elements['add-fg-price'].value); if (!id) return showNotification('Silakan pilih barang jadi.', true); const item = finishedGoodsData.find(i => i.id === id); const totalStock = item.stock + newStock; try { const batch = writeBatch(db); batch.update(doc(db, 'finishedGoods', id), { stock: totalStock, price: price }); batch.set(doc(collection(db, 'stockAddHistory')), { date: getTodayDate(), itemName: item.name, supplier: 'Penyesuaian Stok', quantity: newStock, price: item.hpp, type: 'Barang Jadi' }); batch.set(doc(collection(db, 'activityLogs')), { timestamp: new Date().toISOString(), date: getTodayDate(), userEmail: auth.currentUser?.email || '-', action: 'stock_add_finished', itemId: id, itemName: item.name, quantity: newStock, price: price }); await batch.commit(); showNotification(`Stok untuk ${item.name} berhasil diperbarui.`); form.reset(); form.elements['add-fg-brand'].value = ''; form.elements['add-fg-name'].innerHTML = '<option value="">Pilih Brand Dulu</option>'; form.elements['add-fg-name'].disabled = true; } catch (error) { console.error(error); showNotification("Gagal memperbarui stok.", true); } };
async function handleAddStockSupplementary(e) { e.preventDefault(); const form = e.target, id = form.elements['add-sm-id'].value, newStock = parseFloat(form.elements['add-sm-stock'].value), newPrice = parseFloat(form.elements['add-sm-price'].value), supplier = form.elements['add-sm-supplier'].value; if (!id) return showNotification('Silakan pilih bahan pelengkap.', true); const item = supplementaryMaterialsData.find(i => i.id === id); const totalStock = item.stock + newStock; const newAvgPrice = totalStock > 0 ? ((item.stock * item.price) + (newStock * newPrice)) / totalStock : newPrice; try { const batch = writeBatch(db); batch.update(doc(db, 'supplementaryMaterials', id), { stock: totalStock, price: newAvgPrice, lastSupplier: supplier }); batch.set(doc(collection(db, 'stockAddHistory')), { date: getTodayDate(), itemName: item.name, supplier, quantity: newStock, price: newPrice, type: 'Bahan Pelengkap' }); batch.set(doc(collection(db, 'activityLogs')), { timestamp: new Date().toISOString(), date: getTodayDate(), userEmail: auth.currentUser?.email || '-', action: 'stock_add_supplementary', itemId: id, itemName: item.name, quantity: newStock, price: newPrice, unit: item.unit }); await batch.commit(); showNotification(`Stok & harga untuk ${item.name} berhasil diperbarui.`); form.reset(); document.getElementById('search-add-sm').value = ''; } catch (error) { showNotification("Gagal memperbarui stok.", true); } };
async function handleSaveRecipe(e) { e.preventDefault(); e.stopPropagation(); const fgId = document.getElementById('recipe-fg-name')?.value; if (!fgId) { showNotification("Pilih produk jadi terlebih dahulu.", true); return; } const inputs = Array.from(document.querySelectorAll('#recipe-materials-container .recipe-input')); const materials = {}; for (const el of inputs) { const qty = parseFloat(el.value); if (!isNaN(qty) && qty > 0) { materials[el.dataset.rmId] = qty; } } const submitBtn = e.target.querySelector('button[type="submit"]'); try { if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; } await setDoc(doc(db, 'recipes', fgId), { materials }); const idx = recipes.findIndex(r => r.id === fgId); if (idx >= 0) { recipes[idx] = { ...recipes[idx], materials }; } else { recipes.push({ id: fgId, materials }); } recipeDraft = Object.fromEntries(Object.entries(materials).map(([k, v]) => [k, String(v)])); renderRecipeForm(); displayRecipeDetails(); showNotification("Resep berhasil disimpan."); } catch (error) { console.error('save recipe error:', error); showNotification("Gagal menyimpan resep.", true); } finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Simpan Resep'; } } }
async function handleAddBrand(e) { e.preventDefault(); const form = e.target, name = form.elements['new-brand-name'].value; if (brandsData.some(b => b.name.toLowerCase() === name.toLowerCase())) return showNotification(`Brand '${name}' sudah ada.`, true); try { await addDoc(collection(db, 'brands'), { name }); showNotification(`Brand '${name}' berhasil ditambahkan.`); form.reset(); } catch (error) { showNotification('Gagal menambahkan brand.', true); }};
function handleCalculatorSubmit(e) { e.preventDefault(); const form = e.target, fgId = form.elements['calc-fg-name'].value, quantity = parseFloat(form.elements['calc-quantity'].value), resultContainer = document.getElementById('calculator-result-container'); if (!fgId || !quantity) { resultContainer.innerHTML = `<p class="text-center text-slate-500">Pilih produk dan isi jumlah produksi.</p>`; return; } const product = finishedGoodsData.find(p => p.id === fgId); const recipe = recipes.find(r => r.id === fgId); if (!recipe || Object.keys(recipe.materials).length === 0) { resultContainer.innerHTML = `<p class="text-center text-red-500">Resep untuk <strong>${product.name}</strong> belum diatur. Silakan atur di halaman <strong>Input Data</strong>.</p>`; return; } const resultsHTML = Object.entries(recipe.materials).map(([rmId, qtyPerUnit]) => { const rm = rawMaterialsData.find(r => r.id === rmId); if (!rm) return ''; const totalNeeded = qtyPerUnit * quantity; const isSufficient = rm.stock >= totalNeeded; const statusClass = isSufficient ? 'text-green-600' : 'text-red-600'; const statusText = isSufficient ? 'Cukup' : `Kurang ${(totalNeeded - rm.stock).toLocaleString('id-ID')}`; return `<tr class="border-b"><td class="py-2 px-3 text-sm text-slate-700">${rm.name}</td><td class="py-2 px-3 text-sm text-slate-700">${totalNeeded.toLocaleString('id-ID')} ${rm.unit}</td><td class="py-2 px-3 text-sm font-semibold ${statusClass}">${statusText}</td></tr>`; }).join(''); resultContainer.innerHTML = `<h3 class="text-lg font-medium text-slate-800 mb-2">Kebutuhan untuk ${quantity.toLocaleString('id-ID')} unit ${product.name}:</h3><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bahan Baku</th><th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah Dibutuhkan</th><th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Stok</th></tr></thead><tbody class="divide-y divide-slate-200">${resultsHTML}</tbody></table></div>`; };
function handleProdCalculatorSubmit(e) { e.preventDefault(); const brandId = document.getElementById('prod-calc-brand').value; const productId = document.getElementById('prod-calc-fg').value; const qty = parseFloat(document.getElementById('prod-calc-qty').value); if (!brandId || !productId || !qty) { showNotification('Lengkapi brand, produk, dan jumlah rencana produksi.', true); return; } const product = finishedGoodsData.find(p => p.id === productId); const recipe = recipes.find(r => r.id === productId); if (!recipe || Object.keys(recipe.materials || {}).length === 0) { showNotification(`Resep untuk ${product?.name || 'produk ini'} belum diatur.`, true); document.getElementById('prod-calc-result').innerHTML = ''; return; } let rows = ''; Object.entries(recipe.materials).forEach(([rmId, perUnit]) => { const rm = rawMaterialsData.find(r => r.id === rmId); if (!rm) return; const needed = perUnit * qty; const ok = rm.stock >= needed; const status = ok ? 'Cukup' : `Kurang ${(needed - rm.stock).toLocaleString('id-ID')}`; const cls = ok ? 'text-green-600' : 'text-red-600'; rows += `<tr class="border-b"><td class="py-2 px-3 text-sm text-slate-700">${rm.name}</td><td class="py-2 px-3 text-sm text-slate-700">${needed.toLocaleString('id-ID')} ${rm.unit}</td><td class="py-2 px-3 text-sm font-semibold ${cls}">${status}</td></tr>`; }); const html = `<h3 class="text-lg font-medium text-slate-800 mb-2">Hasil Perhitungan</h3><p class="text-slate-700 mb-3">Kebutuhan untuk <strong>${qty.toLocaleString('id-ID')}</strong> unit <strong>${product.brandName} - ${product.name}</strong>:</p><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-slate-50"><tr><th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bahan Baku</th><th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jumlah yang Dibutuhkan</th><th class="py-2 px-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Stok</th></tr></thead><tbody class="divide-y divide-slate-200">${rows}</tbody></table></div><div class="mt-4 flex items-center justify-between"><label class="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" id="prod-calc-use-today" class="rounded text-indigo-600" checked>Pakai tanggal hari ini</label><button id="prod-calc-apply-btn" data-brand-id="${brandId}" data-product-id="${productId}" data-qty="${qty}" class="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 font-semibold">Lanjut Produksi</button></div>`; document.getElementById('prod-calc-result').innerHTML = html; }
function handleProduksiSubmit(e) { e.preventDefault(); const form = e.target, date = form.elements['prod-date'].value || getTodayDate(), productId = form.elements['prod-fg-name'].value, quantity = parseInt(form.elements['prod-quantity'].value); if (!productId) return showNotification("Silakan pilih produk.", true); const materialsToDeduct = []; let totalMaterialCost = 0; for (const rmId in productionInputs) { const usedQty = parseFloat(productionInputs[rmId]); if (usedQty > 0) { const rm = rawMaterialsData.find(r => r.id === rmId); if (rm.stock < usedQty) return showNotification(`Stok ${rm.name} tidak cukup.`, true); materialsToDeduct.push({ material: rm, quantity: usedQty }); totalMaterialCost += usedQty * rm.price; } } if (materialsToDeduct.length === 0) return showNotification("Masukkan minimal satu bahan baku.", true); pendingProductionData = { date, productId, quantity, materialsToDeduct, totalMaterialCost }; const product = finishedGoodsData.find(p => p.id === productId); document.getElementById('production-confirm-text').textContent = `Anda yakin ingin memproduksi ${quantity} unit ${product.name}?`; document.getElementById('production-confirm-materials').innerHTML = materialsToDeduct.map(item => `<div class="text-sm text-slate-700">${item.material.name}: ${item.quantity} ${item.material.unit}</div>`).join(''); document.getElementById('production-confirm-modal').style.display = 'flex'; };
async function executeProduction() { if (!pendingProductionData) return; const { date, productId, quantity, materialsToDeduct, totalMaterialCost } = pendingProductionData; try { const batch = writeBatch(db); const hppPerUnit = totalMaterialCost / quantity; materialsToDeduct.forEach(item => { batch.update(doc(db, 'rawMaterials', item.material.id), { stock: item.material.stock - item.quantity }); }); const fg = finishedGoodsData.find(f => f.id === productId); const totalStock = fg.stock + quantity; const newAvgHpp = totalStock > 0 ? ((fg.stock * fg.hpp) + (quantity * hppPerUnit)) / totalStock : hppPerUnit; batch.update(doc(db, 'finishedGoods', productId), { stock: totalStock, hpp: newAvgHpp }); batch.set(doc(collection(db, 'productionHistory')), { date, productName: `${fg.brandName} - ${fg.name}`, quantity, totalCost: totalMaterialCost }); batch.set(doc(collection(db, 'activityLogs')), { timestamp: new Date().toISOString(), date, userEmail: auth.currentUser?.email || '-', action: 'production', productId, productName: `${fg.brandName} - ${fg.name}`, quantity, totalCost: totalMaterialCost }); await batch.commit(); showNotification(`Produksi ${quantity} unit ${fg.name} berhasil.`); document.getElementById('form-produksi').reset(); productionInputs = {}; } catch (error) { showNotification("Gagal memproses produksi.", true); } finally { pendingProductionData = null; document.getElementById('production-confirm-modal').style.display = 'none'; } };
async function handleBarangKeluarSubmit(e) { e.preventDefault(); const form = e.target, date = form.elements['out-date'].value || getTodayDate(), productId = form.elements['out-fg-name'].value, quantity = parseInt(form.elements['out-quantity'].value), editId = form.elements['g-out-edit-id'].value; if (!productId) return showNotification("Silakan pilih produk.", true); try { const batch = writeBatch(db); const product = finishedGoodsData.find(p => p.id === productId); if (editId) { const originalQty = parseInt(form.elements['g-out-original-qty'].value); const originalProductId = form.elements['g-out-original-product-id'].value; const qtyDiff = quantity - originalQty; if (originalProductId === productId) { const p = finishedGoodsData.find(i => i.id === productId); if (p.stock < qtyDiff) return showNotification(`Stok ${p.name} tidak cukup.`, true); batch.update(doc(db, 'finishedGoods', productId), { stock: p.stock - qtyDiff }); } else { const oldP = finishedGoodsData.find(i => i.id === originalProductId); const newP = finishedGoodsData.find(i => i.id === productId); if (newP.stock < quantity) return showNotification(`Stok ${newP.name} tidak mencukupi.`, true); batch.update(doc(db, 'finishedGoods', originalProductId), { stock: oldP.stock + originalQty }); batch.update(doc(db, 'finishedGoods', productId), { stock: newP.stock - quantity }); } batch.update(doc(db, 'goodsOutHistory', editId), { date, productId, productName: product.name, brandName: product.brandName, brandId: product.brandId, quantity }); batch.set(doc(collection(db, 'activityLogs')), { timestamp: new Date().toISOString(), date, userEmail: auth.currentUser?.email || '-', action: 'goods_out_edit', productId, productName: product.name, brandName: product.brandName, quantity }); showNotification('Riwayat berhasil diperbarui.'); } else { if (product.stock < quantity) return showNotification(`Stok ${product.name} tidak cukup.`, true); batch.update(doc(db, 'finishedGoods', productId), { stock: product.stock - quantity }); batch.set(doc(collection(db, 'goodsOutHistory')), { date, productId, productName: product.name, brandName: product.brandName, brandId: product.brandId, quantity }); batch.set(doc(collection(db, 'activityLogs')), { timestamp: new Date().toISOString(), date, userEmail: auth.currentUser?.email || '-', action: 'goods_out', productId, productName: product.name, brandName: product.brandName, quantity }); showNotification(`${quantity} unit ${product.name} berhasil dicatat keluar.`); } await batch.commit(); resetBarangKeluarForm(); } catch (error) { showNotification("Gagal memproses barang keluar.", true); } }
async function handleDeleteClick(collectionName, id) { if (confirm('Anda yakin ingin menghapus item ini? Data yang terhapus tidak dapat dikembalikan.')) { try { await deleteDoc(doc(db, collectionName, id)); showNotification('Data berhasil dihapus.'); } catch (error) { showNotification("Gagal menghapus data.", true); } } };
function handleEditSmStockClick(id, name, currentStock) { const modal = document.getElementById('edit-modal'), title = document.getElementById('edit-modal-title'), form = document.getElementById('edit-modal-form'); title.textContent = `Edit Stok: ${name}`; form.innerHTML = `<input type="hidden" id="edit-id" value="${id}"><input type="hidden" id="edit-type" value="sm-stock"><div><label for="edit-stock-value" class="block text-sm font-medium text-slate-700">Jumlah Stok Baru</label><input type="number" id="edit-stock-value" value="${currentStock}" required class="mt-1 block w-full px-3 py-2 border border-slate-300 bg-slate-50 rounded-md"></div><div class="mt-4 flex justify-end space-x-2"><button type="button" id="edit-modal-cancel-btn" class="px-4 py-2 bg-slate-200 rounded-md">Batal</button><button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-md">Simpan</button></div>`; modal.style.display = 'flex'; }
function handleEditItemClick(collectionName, id) { const modal = document.getElementById('edit-modal'), title = document.getElementById('edit-modal-title'), form = document.getElementById('edit-modal-form'); const baseInputClasses = "mt-1 block w-full px-3 py-2 border border-slate-300 bg-slate-50 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"; let item; if (collectionName === 'brands') { item = brandsData.find(i => i.id === id); title.textContent = `Edit Brand: ${item.name}`; form.innerHTML = `<input type="hidden" id="edit-id" value="${item.id}"><input type="hidden" id="edit-type" value="brand"><input type="hidden" id="edit-collection" value="${collectionName}"><div><label class="block text-sm font-medium">Nama Brand</label><input type="text" id="edit-name" value="${item.name}" required class="${baseInputClasses}"></div>`; } else if (collectionName === 'rawMaterials') { item = rawMaterialsData.find(i => i.id === id); title.textContent = `Edit Data: ${item.name}`; form.innerHTML = `<input type="hidden" id="edit-id" value="${item.id}"><input type="hidden" id="edit-type" value="item"><input type="hidden" id="edit-collection" value="${collectionName}"><div><label class="block text-sm font-medium">Nama</label><input type="text" id="edit-name" value="${item.name}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Stok</label><input type="number" id="edit-stock" value="${item.stock}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Harga Rata-rata</label><input type="number" id="edit-price" value="${item.price}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Satuan</label><input type="text" id="edit-unit" value="${item.unit}" required class="${baseInputClasses}"></div>`; } else if (collectionName === 'finishedGoods') { item = finishedGoodsData.find(i => i.id === id); const brandsOptions = brandsData.map(b => `<option value="${b.id}" ${item.brandId === b.id ? 'selected' : ''}>${b.name}</option>`).join(''); title.textContent = `Edit Data: ${item.name}`; form.innerHTML = `<input type="hidden" id="edit-id" value="${item.id}"><input type="hidden" id="edit-type" value="item"><input type="hidden" id="edit-collection" value="${collectionName}"><div><label class="block text-sm font-medium">Brand</label><select id="edit-brand" class="${baseInputClasses}">${brandsOptions}</select></div><div><label class="block text-sm font-medium">Nama</label><input type="text" id="edit-name" value="${item.name}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Stok</label><input type="number" id="edit-stock" value="${item.stock}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">HPP Rata-rata</label><input type="number" id="edit-hpp" value="${item.hpp}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Harga Jual</label><input type="number" id="edit-price" value="${item.price}" required class="${baseInputClasses}"></div>`; } else if (collectionName === 'supplementaryMaterials') { item = supplementaryMaterialsData.find(i => i.id === id); title.textContent = `Edit Data: ${item.name}`; form.innerHTML = `<input type="hidden" id="edit-id" value="${item.id}"><input type="hidden" id="edit-type" value="item"><input type="hidden" id="edit-collection" value="${collectionName}"><div><label class="block text-sm font-medium">Nama</label><input type="text" id="edit-name" value="${item.name}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Stok</label><input type="number" id="edit-stock" value="${item.stock}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Harga Rata-rata</label><input type="number" id="edit-price" value="${item.price}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Satuan</label><input type="text" id="edit-unit" value="${item.unit}" required class="${baseInputClasses}"></div><div><label class="block text-sm font-medium">Supplier Terakhir</label><input type="text" id="edit-supplier" value="${item.lastSupplier || ''}" class="${baseInputClasses}"></div>`; } if (!item) return; form.innerHTML += `<div class="mt-4 flex justify-end space-x-2"><button type="button" id="edit-modal-cancel-btn" class="px-4 py-2 bg-slate-200 rounded-md">Batal</button><button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-md">Simpan</button></div>`; modal.style.display = 'flex'; };
async function handleEditModalSubmit(e) { e.preventDefault(); const form = e.target, id = form.elements['edit-id'].value, type = form.elements['edit-type'].value; try { if (type === 'brand') { await updateDoc(doc(db, 'brands', id), { name: form.elements['edit-name'].value }); } else if (type === 'item') { const collectionName = form.elements['edit-collection'].value; let data = { name: form.elements['edit-name'].value, stock: parseFloat(form.elements['edit-stock'].value) }; if (collectionName === 'rawMaterials' || collectionName === 'supplementaryMaterials') { data.price = parseFloat(form.elements['edit-price'].value); data.unit = form.elements['edit-unit'].value; if(collectionName === 'supplementaryMaterials') data.lastSupplier = form.elements['edit-supplier'].value; } else { const brandId = form.elements['edit-brand'].value; const brand = brandsData.find(b => b.id === brandId); data.brandId = brandId; data.brandName = brand.name; data.hpp = parseFloat(form.elements['edit-hpp'].value); data.price = parseFloat(form.elements['edit-price'].value); } await updateDoc(doc(db, collectionName, id), data); } else if (type === 'sm-stock') { const newStock = parseFloat(form.elements['edit-stock-value'].value); if (isNaN(newStock) || newStock < 0) return showNotification("Jumlah stok tidak valid.", true); await updateDoc(doc(db, 'supplementaryMaterials', id), { stock: newStock }); } else if (type === 'user') { await updateDoc(doc(db, 'users', id), { roleId: form.elements['edit-user-role'].value }); } else if (type === 'role') { const access = Array.from(document.querySelectorAll('.role-permission-cb-edit:checked')).map(cb => cb.value); await updateDoc(doc(db, 'roles', id), { name: form.elements['edit-role-name'].value, access }); } showNotification("Data berhasil diperbarui."); } catch (error) { showNotification("Gagal memperbarui data.", true); } finally { document.getElementById('edit-modal').style.display = 'none'; } };
async function handleDeleteGoodsOutClick(id) { if (confirm('Menghapus riwayat ini akan mengembalikan stok barang. Lanjutkan?')) { const item = goodsOutHistory.find(i => i.id === id); if (!item) return showNotification('Data riwayat tidak ditemukan.', true); try { const batch = writeBatch(db); const p = finishedGoodsData.find(i => i.id === item.productId); if (p) { batch.update(doc(db, 'finishedGoods', item.productId), { stock: p.stock + item.quantity }); } batch.delete(doc(db, 'goodsOutHistory', id)); await batch.commit(); showNotification('Riwayat berhasil dihapus dan stok dikembalikan.'); } catch (error) { showNotification("Gagal menghapus riwayat.", true); } } };
function handleEditGoodsOutClick(id) { const item = goodsOutHistory.find(i => i.id === id); if (!item) return; const form = document.getElementById('form-barang-keluar'); form.elements['g-out-edit-id'].value = item.id; form.elements['g-out-original-qty'].value = item.quantity; form.elements['g-out-original-product-id'].value = item.productId; form.elements['out-date'].value = item.date; const prod = finishedGoodsData.find(i => i.id === item.productId); const brandIdToUse = item.brandId || prod?.brandId || ''; const brandSelect = form.elements['out-brand']; brandSelect.value = brandIdToUse; populateProductsByBrand(brandIdToUse, 'out-fg-name'); setTimeout(() => { form.elements['out-fg-name'].value = item.productId; }, 50); form.elements['out-quantity'].value = item.quantity; const btn = document.getElementById('g-out-submit-btn'); btn.textContent = 'Update Pengeluaran'; btn.classList.replace('bg-red-600', 'bg-yellow-500'); }
function resetBarangKeluarForm() { const form = document.getElementById('form-barang-keluar'); if (form) { form.reset(); form.elements['g-out-edit-id'].value = ''; form.elements['g-out-original-qty'].value = ''; form.elements['g-out-original-product-id'].value = ''; const productSelect = form.elements['out-fg-name']; productSelect.innerHTML = '<option>Pilih Brand Dahulu</option>'; productSelect.disabled = true; const btn = document.getElementById('g-out-submit-btn'); btn.textContent = 'CATAT PENGELUARAN'; btn.classList.replace('bg-yellow-500', 'bg-red-600'); } };
function resetProductionForm() { const calcBrand = document.getElementById('prod-calc-brand'); const calcFg = document.getElementById('prod-calc-fg'); const calcQty = document.getElementById('prod-calc-qty'); const calcRes = document.getElementById('prod-calc-result'); if (calcBrand) calcBrand.value = ''; if (calcFg) { calcFg.innerHTML = '<option>Pilih Brand Dahulu</option>'; calcFg.disabled = true; } if (calcQty) calcQty.value = ''; if (calcRes) calcRes.innerHTML = ''; const form = document.getElementById('form-produksi'); if (form) form.reset(); const prodBrand = document.getElementById('prod-brand'); const prodFg = document.getElementById('prod-fg-name'); if (prodBrand) prodBrand.value = ''; if (prodFg) { prodFg.innerHTML = '<option>Pilih Brand Dahulu</option>'; prodFg.disabled = true; } const searchRM = document.getElementById('search-prod-raw-material'); if (searchRM) searchRM.value = ''; productionInputs = {}; pendingProductionData = null; renderProductionRawMaterials(); const modal = document.getElementById('production-confirm-modal'); if (modal) modal.style.display = 'none'; }
async function handleAddUser(e) { e.preventDefault(); const form = e.target; const email = form.elements['new-user-email'].value; const password = form.elements['new-user-password'].value; const roleId = form.elements['new-user-role'].value; if (!password || password.length < 6) { showNotification("Password harus diisi (minimal 6 karakter).", true); return; } try { const userCredential = await createUserWithEmailAndPassword(auth, email, password); if (userCredential.user) { await addDoc(collection(db, 'users'), { email: email, roleId: roleId }); showNotification(`Pengguna ${email} berhasil dibuat dan ditambahkan.`); form.reset(); } } catch (error) { if (error.code === 'auth/email-already-in-use') { showNotification(`Email ${email} sudah terdaftar.`, true); } else { showNotification(`Gagal menambahkan pengguna. Error: ${error.message}`, true); } } }
async function handleDeleteUser(id) { if (confirm('Hapus pengguna ini dari daftar peran? Ini tidak menghapus akun loginnya.')) { await deleteDoc(doc(db, 'users', id)); showNotification('Pengguna berhasil dihapus dari daftar peran.'); } };
async function handleAddRole(e) { e.preventDefault(); const form = e.target, name = form.elements['new-role-name'].value; const access = Array.from(document.querySelectorAll('.role-permission-cb:checked')).map(cb => cb.value); await addDoc(collection(db, 'roles'), { name, access }); showNotification(`Peran '${name}' berhasil ditambahkan.`); form.reset(); };
async function handleDeleteRole(id) { if (confirm('Hapus peran ini?')) { await deleteDoc(doc(db, 'roles', id)); showNotification('Peran berhasil dihapus.'); } };
async function handleSaveSettings(e) { e.preventDefault(); const form = e.target, title = form.elements['setting-title'].value, logoUrl = form.elements['setting-logo-url'].value; try { await setDoc(doc(db, 'settings', 'appConfig'), { title, logoUrl }, { merge: true }); showNotification('Pengaturan berhasil disimpan.'); } catch (error) { showNotification("Gagal menyimpan pengaturan.", true); } };

// === [BARU] Handler untuk Form Input Pengeluaran ===
async function handleInputPengeluaranSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const date = form.elements['pengeluaran-date'].value || getTodayDate();
    const category = document.getElementById('pengeluaran-kategori').value;
    const itemId = form.elements['add-pengeluaran-id'].value;
    const supplier = form.elements['pengeluaran-supplier'].value;
    const quantity = parseFloat(form.elements['pengeluaran-jumlah'].value);
    const totalPrice = parseFloat(form.elements['pengeluaran-total'].value);

    if (!category || !itemId || !supplier || isNaN(quantity) || quantity <= 0 || isNaN(totalPrice) || totalPrice < 0) {
        return showNotification("Harap isi semua kolom dengan benar.", true);
    }

    const dataMap = {
        rawMaterials: rawMaterialsData,
        supplementaryMaterials: supplementaryMaterialsData,
    };

    const item = dataMap[category].find(i => i.id === itemId);
    if (!item) return showNotification("Item yang dipilih tidak valid.", true);

    // Hitung harga satuan dan harga rata-rata baru
    const unitPrice = totalPrice / quantity;
    const currentTotalValue = (item.stock || 0) * (item.price || 0);
    const newTotalStock = (item.stock || 0) + quantity;
    const newTotalValue = currentTotalValue + totalPrice;
    const newAveragePrice = newTotalStock > 0 ? newTotalValue / newTotalStock : unitPrice;

    try {
        const batch = writeBatch(db);

        // 1. Update stok dan harga item
        const itemRef = doc(db, category, itemId);
        batch.update(itemRef, {
            stock: newTotalStock,
            price: newAveragePrice,
            ...(category === 'supplementaryMaterials' && { lastSupplier: supplier })
        });

        // 2. Simpan riwayat pengeluaran
        const expenditureRef = doc(collection(db, 'expenditureHistory'));
        batch.set(expenditureRef, {
            date,
            category,
            categoryDisplay: category === 'rawMaterials' ? 'Bahan Baku' : 'Bahan Pelengkap',
            itemId,
            itemName: item.name,
            supplier,
            quantity,
            totalPrice,
            unitPrice,
            unit: item.unit
        });
        
        // 3. Simpan log aktivitas
        const logRef = doc(collection(db, 'activityLogs'));
        batch.set(logRef, {
            timestamp: new Date().toISOString(),
            date,
            userEmail: auth.currentUser?.email || '-',
            action: 'expenditure_add',
            details: `${item.name} - ${quantity} ${item.unit} dari ${supplier}`,
            itemId,
            itemName: item.name,
            quantity,
            totalPrice,
            unit: item.unit
        });

        await batch.commit();
        showNotification(`Pengeluaran untuk ${item.name} berhasil dicatat.`);
        form.reset();
        document.getElementById('search-add-pengeluaran').value = '';
        document.getElementById('add-pengeluaran-id').value = '';
        document.getElementById('pengeluaran-kategori').value = '';
        document.getElementById('searchable-dropdown-pengeluaran-container').classList.add('hidden');

    } catch (error) {
        console.error("Error saving expenditure:", error);
        showNotification("Gagal menyimpan data pengeluaran.", true);
    }
}

// === [BARU] Handlers untuk Edit di Halaman Admin ===
function handleEditUserClick(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;

    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('edit-modal-title');
    const form = document.getElementById('edit-modal-form');

    title.textContent = `Edit Peran Pengguna: ${user.email}`;
    const rolesOptions = roles.map(r => `<option value="${r.id}" ${user.roleId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');

    form.innerHTML = `
        <input type="hidden" id="edit-id" value="${user.id}">
        <input type="hidden" id="edit-type" value="user">
        <div>
            <label for="edit-user-role" class="block text-sm font-medium text-slate-700">Peran</label>
            <select id="edit-user-role" class="mt-1 block w-full px-3 py-2 border border-slate-300 bg-white rounded-md">
                ${rolesOptions}
            </select>
        </div>
        <div class="mt-4 flex justify-end space-x-2">
            <button type="button" id="edit-modal-cancel-btn" class="px-4 py-2 bg-slate-200 rounded-md">Batal</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-md">Simpan</button>
        </div>`;
    modal.style.display = 'flex';
}

function handleEditRoleClick(id) {
    const role = roles.find(r => r.id === id);
    if (!role) return;

    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('edit-modal-title');
    const form = document.getElementById('edit-modal-form');

    title.textContent = `Edit Peran: ${role.name}`;
    const allPages = ['dashboard', 'kalkulator', 'produksi', 'barang-keluar', 'input', 'input-pengeluaran', 'master', 'laporan', 'admin'];
    const permissionsCheckboxes = allPages.map(page => `
        <label class="flex items-center space-x-2">
            <input type="checkbox" class="role-permission-cb-edit rounded text-indigo-600" value="${page}" ${role.access.includes(page) ? 'checked' : ''}>
            <span class="capitalize">${page.replace('-', ' ')}</span>
        </label>
    `).join('');

    form.innerHTML = `
        <input type="hidden" id="edit-id" value="${role.id}">
        <input type="hidden" id="edit-type" value="role">
        <div>
            <label for="edit-role-name" class="block text-sm font-medium text-slate-700">Nama Peran</label>
            <input type="text" id="edit-role-name" value="${role.name}" required class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md">
        </div>
        <div class="mt-4">
            <label class="block text-sm font-medium text-slate-700">Hak Akses</label>
            <div class="grid grid-cols-2 gap-2 text-sm mt-2">
                ${permissionsCheckboxes}
            </div>
        </div>
        <div class="mt-4 flex justify-end space-x-2">
            <button type="button" id="edit-modal-cancel-btn" class="px-4 py-2 bg-slate-200 rounded-md">Batal</button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-md">Simpan</button>
        </div>`;
    modal.style.display = 'flex';
}


// === EVENT LISTENERS ===
function addEventListeners() {
    document.getElementById('form-define-raw-material')?.addEventListener('submit', handleDefineRawMaterial);
    document.getElementById('form-define-finished-good')?.addEventListener('submit', handleDefineFinishedGood);
    document.getElementById('add-sm-modal-form')?.addEventListener('submit', handleDefineSupplementaryMaterial);
    document.getElementById('add-rm-modal-form')?.addEventListener('submit', handleDefineRawMaterialFromModal);
    document.getElementById('add-fg-modal-form')?.addEventListener('submit', handleDefineFinishedGoodFromModal);
    document.getElementById('form-add-stock-raw-material')?.addEventListener('submit', handleAddStockRawMaterial);
    document.getElementById('form-add-stock-finished-good')?.addEventListener('submit', handleAddStockFinishedGood);
    document.getElementById('form-add-stock-supplementary')?.addEventListener('submit', handleAddStockSupplementary);
    document.getElementById('form-produksi')?.addEventListener('submit', handleProduksiSubmit);
    document.getElementById('form-prod-calculator')?.addEventListener('submit', handleProdCalculatorSubmit);
    document.getElementById('form-barang-keluar')?.addEventListener('submit', handleBarangKeluarSubmit);
    document.getElementById('form-add-user')?.addEventListener('submit', handleAddUser);
    document.getElementById('form-add-role')?.addEventListener('submit', handleAddRole);
    document.getElementById('form-add-brand')?.addEventListener('submit', handleAddBrand);
    document.getElementById('form-app-settings')?.addEventListener('submit', handleSaveSettings);
    document.getElementById('form-recipe')?.addEventListener('submit', handleSaveRecipe);
    document.getElementById('form-calculator')?.addEventListener('submit', handleCalculatorSubmit);
    document.getElementById('export-raw-btn')?.addEventListener('click', () => exportToExcel(rawMaterialsData, 'Bahan_Baku.xlsx'));
    document.getElementById('export-finished-btn')?.addEventListener('click', () => exportToExcel(finishedGoodsData, 'Barang_Jadi.xlsx'));
    document.getElementById('edit-modal-form').addEventListener('submit', handleEditModalSubmit);
    document.getElementById('form-input-pengeluaran')?.addEventListener('submit', handleInputPengeluaranSubmit);
    
    document.getElementById('add-stock-tabs')?.addEventListener('click', (e) => { 
        if (e.target.classList.contains('tab-btn')) { 
            const tabId = e.target.dataset.tab; 
            document.querySelectorAll('.tab-btn').forEach(btn => { btn.classList.remove('border-indigo-500', 'text-indigo-600'); btn.classList.add('border-transparent', 'text-gray-500'); }); 
            e.target.classList.add('border-indigo-500', 'text-indigo-600'); 
            ['raw', 'finished', 'supplementary'].forEach(t => document.getElementById(`tab-content-${t}`).classList.add('hidden'));
            document.getElementById(`tab-content-${tabId}`).classList.remove('hidden'); 
        } 
    });
    
    document.body.addEventListener('input', (e) => {
        if (e.target.matches('.search-input, .date-filter-start, .date-filter-end')) {
            Object.keys(paginationState).forEach(key => paginationState[key].currentPage = 1);
            applyFiltersAndRender();
        }
        if (e.target.matches('#search-prod-raw-material')) { renderProductionRawMaterials(e.target.value); }
        if (e.target.matches('.production-rm-input')) { productionInputs[e.target.dataset.rmId] = e.target.value; }
        if (e.target.matches('#search-recipe-raw-material')) { renderRecipeForm(e.target.value); }
        if (e.target.matches('.recipe-input')) {
            const id = e.target.dataset.rmId;
            if (id) recipeDraft[id] = e.target.value;
        }
    });

    document.body.addEventListener('change', (e) => {
        if (e.target.matches('#recipe-lookup-brand')) { populateProductsByBrandForRecipeLookup(e.target.value); const d = document.getElementById('recipe-lookup-details'); if (d) d.innerHTML = '<p class="text-center text-slate-500">Silakan pilih produk.</p>'; }
        if (e.target.matches('#log-user-filter')) { applyFiltersAndRender(); }
        if (e.target.matches('#recipe-lookup-product')) { displayRecipeDetails(); }
        if (e.target.matches('.units-dropdown')) { handleNewUnit(e); }
        if (e.target.matches('#add-fg-brand')) { populateProductsByBrand(e.target.value, 'add-fg-name'); }
        if (e.target.matches('#prod-brand')) { populateProductsByBrand(e.target.value, 'prod-fg-name'); }
        if (e.target.matches('#out-brand')) { populateProductsByBrand(e.target.value, 'out-fg-name'); }
        if (e.target.matches('#recipe-brand')) { populateProductsByBrand(e.target.value, 'recipe-fg-name'); document.getElementById('search-recipe-raw-material').value = ''; recipeDraft = {}; renderRecipeForm(); }
        if (e.target.matches('#prod-calc-brand')) { populateProductsByBrandWithRecipe(e.target.value, 'prod-calc-fg'); }
        if (e.target.matches('.rows-per-page-select')) { handleRowsPerPageChange(e); }
        
        if (e.target.matches('#pengeluaran-kategori')) {
            const category = e.target.value;
            const searchContainer = document.getElementById('searchable-dropdown-pengeluaran-container');
            const searchInput = document.getElementById('search-add-pengeluaran');
            const hiddenInput = document.getElementById('add-pengeluaran-id');
            
            searchInput.value = '';
            hiddenInput.value = '';

            if (category) {
                searchContainer.classList.remove('hidden');
            } else {
                searchContainer.classList.add('hidden');
            }
        }
    });
    
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.password-toggle')) { const i = e.target.closest('.relative').querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; }
        if (e.target.matches('.delete-rm-btn')) showPinModal(() => handleDeleteClick('rawMaterials', e.target.dataset.id));
        if (e.target.matches('.delete-fg-btn')) showPinModal(() => handleDeleteClick('finishedGoods', e.target.dataset.id));
        if (e.target.matches('.delete-sm-btn')) showPinModal(() => handleDeleteClick('supplementaryMaterials', e.target.dataset.id));
        if (e.target.matches('.delete-brand-btn')) showPinModal(() => handleDeleteClick('brands', e.target.dataset.id));
        if (e.target.matches('.edit-item-btn')) showPinModal(() => handleEditItemClick(e.target.dataset.collection, e.target.dataset.id));
        if (e.target.matches('.edit-brand-btn')) handleEditItemClick('brands', e.target.dataset.id);
        if (e.target.matches('.edit-sm-stock-btn')) showPinModal(() => handleEditSmStockClick(e.target.dataset.id, e.target.dataset.name, e.target.dataset.stock));
        if (e.target.matches('.delete-g-out-btn')) showPinModal(() => handleDeleteGoodsOutClick(e.target.dataset.id));
        if (e.target.matches('.edit-g-out-btn')) showPinModal(() => handleEditGoodsOutClick(e.target.dataset.id));
        if (e.target.matches('.delete-user-btn')) handleDeleteUser(e.target.dataset.id);
        if (e.target.matches('.delete-role-btn')) handleDeleteRole(e.target.dataset.id);
        if (e.target.matches('.edit-user-btn')) handleEditUserClick(e.target.dataset.id);
        if (e.target.matches('.edit-role-btn')) handleEditRoleClick(e.target.dataset.id);
        if (e.target.matches('#add-new-sm-btn')) { document.getElementById('add-sm-modal').style.display = 'flex'; }
        if (e.target.matches('#add-new-rm-btn')) { document.getElementById('add-rm-modal').style.display = 'flex'; populateUnitsDropdowns(); }
        if (e.target.matches('#add-new-fg-btn')) { document.getElementById('add-fg-modal').style.display = 'flex'; populateBrandsDropdowns(); }
        if (e.target.matches('.cancel-add-modal-btn')) { e.target.closest('.fixed').style.display = 'none'; }
        if (e.target.matches('#edit-modal-cancel-btn')) { document.getElementById('edit-modal').style.display = 'none'; }
        if (e.target && e.target.id === 'prod-calc-apply-btn') {
            const brandId = e.target.dataset.brandId;
            const productId = e.target.dataset.productId;
            const qty = parseFloat(e.target.dataset.qty);
            const useToday = document.getElementById('prod-calc-use-today')?.checked;
            const brandSel = document.getElementById('prod-brand');
            brandSel.value = brandId;
            populateProductsByBrand(brandId, 'prod-fg-name');
            document.getElementById('prod-fg-name').value = productId;
            document.getElementById('prod-quantity').value = qty;
            if (useToday) { document.getElementById('prod-date').value = getTodayDate(); }
            const recipe = recipes.find(r => r.id === productId);
            productionInputs = {};
            if (recipe && recipe.materials) {
                Object.entries(recipe.materials).forEach(([rmId, perUnit]) => {
                    productionInputs[rmId] = String(perUnit * qty);
                });
            }
            renderProductionRawMaterials();
            document.getElementById('form-produksi')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        handlePaginationClick(e);
    });
    
    document.getElementById('recipe-fg-name')?.addEventListener('change', () => {
        document.getElementById('search-recipe-raw-material').value = '';
        const fgId = document.getElementById('recipe-fg-name').value;
        const r = recipes.find(x => x.id === fgId);
        recipeDraft = r && r.materials ? Object.fromEntries(Object.entries(r.materials).map(([k,v]) => [k, String(v)])) : {};
        renderRecipeForm();
    });
}

// === APP INITIALIZATION & AUTH ===
function setupResponsiveSidebar() { const hamburgerBtn = document.getElementById('hamburger-btn'); const sidebar = document.getElementById('sidebar'); const backdrop = document.getElementById('sidebar-backdrop'); const navLinks = document.getElementById('sidebar-nav'); const openSidebar = () => { sidebar.classList.remove('-translate-x-full'); backdrop.classList.remove('hidden'); }; const closeSidebar = () => { sidebar.classList.add('-translate-x-full'); backdrop.classList.add('hidden'); }; hamburgerBtn.addEventListener('click', openSidebar); backdrop.addEventListener('click', closeSidebar); navLinks.addEventListener('click', (e) => { if (e.target.closest('a') && window.innerWidth < 768) { closeSidebar(); } }); };
async function handleLogin(e) { e.preventDefault(); const email = loginForm.elements.email.value, password = loginForm.elements.password.value; try { await signInWithEmailAndPassword(auth, email, password); } catch (error) { showNotification("Email atau password salah.", true); } };
async function handleRegister(e) { e.preventDefault(); const email = registerForm.elements['register-email'].value, password = registerForm.elements['register-password'].value; try { await createUserWithEmailAndPassword(auth, email, password); } catch (error) { showNotification(error.code === 'auth/email-already-in-use' ? "Email ini sudah terdaftar." : `Gagal mendaftar.`, true); } };
function handleLogout() { signOut(auth); };
function showApp() { loginPage.style.display = 'none'; appContainer.style.display = 'block'; };
function showLogin() { loginPage.style.display = 'flex'; appContainer.style.display = 'none'; updateAppSettingsUI(); };
function updateAppSettingsUI() { const title = appSettings.title || "Data Gudang"; const logoUrl = appSettings.logoUrl; document.getElementById('sidebar-title').textContent = title; document.getElementById('mobile-header-title').textContent = title; document.getElementById('login-title').textContent = `${title} Login`; if (logoUrl) { document.getElementById('sidebar-logo').src = logoUrl; document.getElementById('login-logo').src = logoUrl; } };
function buildSidebarNav() {
    const navContainer = document.getElementById('sidebar-nav');
    if (!currentUserRole) {
        navContainer.innerHTML = '<p class="px-4 text-sm text-gray-400">Tidak ada peran.</p>';
        return;
    }
    const pageMap = {
        dashboard: `<a href="#dashboard" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>Dashboard</a>`,
        kalkulator: `<a href="#kalkulator" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 7h6m0 10v-3m-3 3h3m-3-10h.01M9 17h.01M12 17h.01M15 17h.01M9 14h.01M12 14h.01M15 14h.01M9 11h.01M12 11h.01M15 11h.01M12 21a9 9 0 110-18 9 9 0 010 18z"/></svg>Kalkulator</a>`,
        produksi: `<a href="#produksi" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a1 1 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>Produksi</a>`,
        'barang-keluar': `<a href="#barang-keluar" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>Barang Keluar</a>`,
        input: `<a href="#input" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Input Data</a>`,
        'input-pengeluaran': `<a href="#input-pengeluaran" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>Input Pengeluaran</a>`,
        master: `<a href="#master" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 0v4c0 2.21 3.58 4 8 4s8-1.79 8-4V7"/></svg>Master Data</a>`,
        laporan: `<a href="#laporan" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Laporan</a>`,
        admin: `<a href="#admin" class="nav-link flex items-center px-4 py-2 rounded-lg font-medium"><svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756.426-1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Admin</a>`
    };
    
    const navOrder = ['dashboard', 'kalkulator', 'produksi', 'barang-keluar', 'input', 'input-pengeluaran', 'master', 'laporan', 'admin'];
    const allowedNavs = navOrder.filter(pageId => currentUserRole.access.includes(pageId));
    navContainer.innerHTML = allowedNavs.map(pageId => pageMap[pageId]).join('');
};
function showPinModal(action) { pendingAction = action; document.getElementById('pin-modal').style.display = 'flex'; document.getElementById('pin-input').focus(); };
function hidePinModal() { document.getElementById('pin-modal').style.display = 'none'; document.getElementById('pin-form').reset(); pendingAction = null; };
function handlePinAuth(e) { e.preventDefault(); const pin = document.getElementById('pin-input').value; if (pin === '140190') { if (pendingAction) pendingAction(); hidePinModal(); } else { showNotification('PIN salah.', true); } };
function showPage(hash) {
  const pageName = hash.substring(1) || 'dashboard';
  const targetId = 'page-' + pageName;

  if (currentUserRole && !currentUserRole.access.includes(pageName)) {
    showNotification('Anda tidak memiliki akses.', true);
    window.location.hash = currentUserRole.access[0] || 'dashboard';
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === targetId));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.hash === hash || (hash === '' && l.hash === '#dashboard')));

  const dateFiltersToReset = ['page-dashboard', 'page-laporan', 'page-input-pengeluaran'];
  if (dateFiltersToReset.includes(targetId)) {
    const pagePrefix = pageName.replace('input-', ''); // dashboard, laporan, pengeluaran
    const sd = document.getElementById(`start-date-${pagePrefix}`);
    const ed = document.getElementById(`end-date-${pagePrefix}`);
    if (sd) sd.value = '';
    if (ed) ed.value = '';
  }

  if (['page-produksi', 'page-barang-keluar', 'page-input', 'page-kalkulator'].includes(targetId)) populateDynamicDropdowns();
  if (targetId === 'page-input') renderRecipeForm();
  if (targetId !== 'page-barang-keluar') resetBarangKeluarForm();
  if (targetId !== 'page-produksi') resetProductionForm();

  // Reset pagination for all tables to page 1 and default rows
  Object.keys(paginationState).forEach(key => {
    paginationState[key].currentPage = 1;
    paginationState[key].rowsPerPage = 10;
  });

  applyFiltersAndRender();
}
function setupRealtimeListeners() {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
    const collections = {
        rawMaterials: d => rawMaterialsData = d,
        finishedGoods: d => finishedGoodsData = d,
        productionHistory: d => productionHistory = d,
        goodsOutHistory: d => goodsOutHistory = d,
        users: d => users = d,
        roles: d => roles = d,
        recipes: d => recipes = d,
        stockAddHistory: d => stockAddHistory = d,
        supplementaryMaterials: d => supplementaryMaterialsData = d,
        brands: d => brandsData = d,
        activityLogs: d => activityLogs = d,
        expenditureHistory: d => expenditureHistory = d,
    };

    Object.keys(collections).forEach(colName => {
        const unsub = onSnapshot(collection(db, colName), (snapshot) => {
            collections[colName](snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            if (['roles', 'users'].includes(colName)) {
                const user = auth.currentUser;
                if (user && users.length > 0 && roles.length > 0) {
                    const userDoc = users.find(u => u.email === user.email);
                    if (userDoc) {
                        currentUserRole = roles.find(r => r.id === userDoc.roleId);
                    } else {
                        currentUserRole = null;
                    }
                    if (currentUserRole && !pageContentLoaded) {
                        renderPageContent();
                        buildSidebarNav();
                        showPage(window.location.hash || '#dashboard');
                        mainLoader.style.display = 'none';
                        mainContent.classList.remove('hidden');
                        pageContentLoaded = true;
                    } else if (currentUserRole) {
                        // If already loaded, just rebuild nav in case roles changed
                        buildSidebarNav();
                    }
                }
            }
            applyFiltersAndRender();
            populateDynamicDropdowns();
        });
        unsubscribeListeners.push(unsub);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'appConfig'), (doc) => {
        if (doc.exists()) {
            appSettings = doc.data();
            updateAppSettingsUI();
            updateKPIs();
        }
    });
    unsubscribeListeners.push(unsubSettings);
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        showApp();
        const rolesRef = collection(db, "roles");
        const rolesSnapshot = await getDocs(rolesRef);
        if (rolesSnapshot.empty) {
            const allAccess = ['dashboard', 'kalkulator', 'produksi', 'barang-keluar', 'input', 'input-pengeluaran', 'master', 'laporan', 'admin'];
            const adminRoleRef = await addDoc(rolesRef, { name: 'Admin', access: allAccess });
            await addDoc(collection(db, "users"), { email: user.email, roleId: adminRoleRef.id });
        }
        setupRealtimeListeners();
        setupResponsiveSidebar();
    } else {
        unsubscribeListeners.forEach(unsub => unsub());
        unsubscribeListeners = [];
        currentUserRole = null;
        pageContentLoaded = false; 
        showLogin();
    }
});

// === GLOBAL EVENT LISTENERS ===
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
logoutBtn.addEventListener('click', handleLogout);
window.addEventListener('hashchange', () => showPage(window.location.hash));
document.getElementById('show-register-form').addEventListener('click', (e) => { e.preventDefault(); loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); });
document.getElementById('show-login-form').addEventListener('click', (e) => { e.preventDefault(); registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); });
document.getElementById('pin-form').addEventListener('submit', handlePinAuth);
document.getElementById('confirm-production-btn').addEventListener('click', executeProduction);
document.getElementById('cancel-production-btn').addEventListener('click', () => { pendingProductionData = null; document.getElementById('production-confirm-modal').style.display = 'none'; });
document.getElementById('cancel-pin-btn').addEventListener('click', hidePinModal);
