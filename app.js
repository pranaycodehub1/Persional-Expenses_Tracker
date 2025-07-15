document.addEventListener('DOMContentLoaded', function() {

    // IndexedDB setup
    let db;
    const DB_NAME = 'FinanceFlowDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'transactions';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => reject('Database error: ' + event.target.errorCode);
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (event) => {
                db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    function addTransactionDB(transaction) {
        return openDB().then(db => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.add(transaction);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        });
    }

    function getAllTransactionsDB() {
        return openDB().then(db => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e);
            });
        });
    }

    function deleteTransactionDB(id) {
        return openDB().then(db => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        });
    }

    // DOM Elements
    const expenseForm = document.getElementById('expenseForm');
    const expenseList = document.getElementById('expenseList');
    const searchInput = document.getElementById('searchInput');
    const totalBalanceEl = document.getElementById('totalBalance');
    // const totalIncomeEl = document.getElementById('totalIncome');
    const totalExpenseEl = document.getElementById('totalExpense');
    const totalIncomeMonthEl = document.getElementById('totalIncomeMonth');
    const dateInput = document.getElementById('date');
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // Chart variables
    let expenseChart;

    // Export buttons
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const downloadExcelBtn = document.getElementById('downloadExcelBtn');

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', async function() {
            const transactions = await getAllTransactionsDB();
            exportTransactionsToPDF(transactions);
        });
    }
    if (downloadExcelBtn) {
        downloadExcelBtn.addEventListener('click', async function() {
            const transactions = await getAllTransactionsDB();
            exportTransactionsToExcel(transactions);
        });
    }

    function exportTransactionsToPDF(transactions) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text('FinanceFlow - Transactions', 10, 15);
        doc.setFontSize(10);
        const headers = [['Date', 'Description', 'Type', 'Category', 'Amount']];
        const rows = transactions.sort((a, b) => b.id - a.id).map(t => [
            t.date,
            t.title,
            t.type.charAt(0).toUpperCase() + t.type.slice(1),
            t.category.charAt(0).toUpperCase() + t.category.slice(1),
            `₹${t.amount.toFixed(2)}`
        ]);
        let y = 25;
        // Table header
        headers[0].forEach((header, i) => {
            doc.text(header, 10 + i * 40, y);
        });
        y += 7;
        // Table rows
        rows.forEach(row => {
            row.forEach((cell, i) => {
                doc.text(String(cell), 10 + i * 40, y);
            });
            y += 7;
            if (y > 270) {
                doc.addPage();
                y = 15;
            }
        });
        doc.save('FinanceFlow_Transactions.pdf');
    }

    function exportTransactionsToExcel(transactions) {
        const ws_data = [
            ['Date', 'Description', 'Type', 'Category', 'Amount'],
            ...transactions.sort((a, b) => b.id - a.id).map(t => [
                t.date,
                t.title,
                t.type.charAt(0).toUpperCase() + t.type.slice(1),
                t.category.charAt(0).toUpperCase() + t.category.slice(1),
                t.amount
            ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
        XLSX.writeFile(wb, 'FinanceFlow_Transactions.xlsx');
    }


    // Initial load
    loadTransactions();

    // Form submission
    expenseForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const title = document.getElementById('title').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const type = document.getElementById('type').value;
        const category = document.getElementById('category').value;
        const date = document.getElementById('date').value;
        const transaction = {
            id: Date.now(),
            title,
            amount: Math.abs(amount),
            type,
            category,
            date
        };
        await addTransaction(transaction);
        expenseForm.reset();
        dateInput.value = today;
    });

    // Search functionality
    searchInput.addEventListener('input', async function() {
        const searchTerm = this.value.toLowerCase();
        const transactions = await getAllTransactionsDB();
        const filteredTransactions = transactions.filter(transaction =>
            transaction.title.toLowerCase().includes(searchTerm) ||
            transaction.category.toLowerCase().includes(searchTerm) ||
            transaction.date.includes(searchTerm)
        );
        renderTransactions(filteredTransactions);
    });


    // Load transactions from IndexedDB
    async function loadTransactions() {
        const transactions = await getAllTransactionsDB();
        renderTransactions(transactions);
        updateSummary(transactions);
        renderChart(transactions);
    }

    // Add new transaction to IndexedDB
    async function addTransaction(transaction) {
        await addTransactionDB(transaction);
        await loadTransactions();
    }

    // Delete transaction from IndexedDB
    async function deleteTransaction(id) {
        await deleteTransactionDB(id);
        await loadTransactions();
    }

    // Render transactions to DOM
    function renderTransactions(transactions = []) {
        expenseList.innerHTML = '';
        
        if (transactions.length === 0) {
            expenseList.innerHTML = '<p class="text-gray-500 text-center py-4">No transactions found</p>';
            return;
        }
        
        transactions.sort((a, b) => b.id - a.id); // newest first
        transactions.forEach(transaction => {
            const isIncome = transaction.type === 'income';
            const transactionEl = document.createElement('div');
            transactionEl.className = `flex flex-col p-3 rounded-lg ${isIncome ? 'bg-green-50' : 'bg-red-50'} cursor-pointer group`;

            // Convert date to readable format
            const dateObj = new Date(transaction.date);
            const formattedDate = dateObj.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });

            // Main row (always visible)
            transactionEl.innerHTML = `
                <div class="flex justify-between items-center w-full">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center ${isIncome ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}">
                            ${getCategoryIcon(transaction.category)}
                        </div>
                        <div>
                            <h3 class="font-medium text-gray-800">${transaction.title}</h3>
                            <p class="text-xs text-gray-500">${formattedDate} • ${transaction.category}</p>
                        </div>
                    </div>
                    <span class="font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'} text-lg">
                        ${isIncome ? '+' : '-'}₹${transaction.amount.toFixed(2)}
                    </span>
                    <button class="delete-btn p-1 text-gray-400 hover:text-gray-600" data-id="${transaction.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
                <div class="description-row hidden mt-2 text-gray-700 text-sm bg-gray-100 rounded p-2">
                    <span class="font-semibold">Description:</span> ${transaction.title}
                </div>
            `;

            // Toggle description on click (only for expenses)
            if (!isIncome) {
                transactionEl.addEventListener('click', function(e) {
                    // Prevent delete button from toggling
                    if (e.target.closest('.delete-btn')) return;
                    const desc = this.querySelector('.description-row');
                    if (desc) desc.classList.toggle('hidden');
                });
            }

            expenseList.appendChild(transactionEl);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = parseInt(this.getAttribute('data-id'));
                deleteTransaction(id);
            });
        });
    }

    // Update summary
    function updateSummary(transactions = []) {
        const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const balance = income - expense;
        // Calculate current month income
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const incomeMonth = transactions.filter(t => t.type === 'income' && new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear).reduce((sum, t) => sum + t.amount, 0);
        totalBalanceEl.textContent = `₹${balance.toFixed(2)}`;
        totalExpenseEl.textContent = `₹${expense.toFixed(2)}`;
        if (totalIncomeMonthEl) {
            totalIncomeMonthEl.textContent = `₹${incomeMonth.toFixed(2)}`;
        }
    }

    // Render chart
    function renderChart(transactions = []) {
        const ctx = document.getElementById('expenseChart').getContext('2d');
        // Group by category
        const categories = {};
        transactions.forEach(transaction => {
            if (transaction.type === 'expense') {
                if (!categories[transaction.category]) {
                    categories[transaction.category] = 0;
                }
                categories[transaction.category] += transaction.amount;
            }
        });
        const labels = Object.keys(categories);
        const data = Object.values(categories);
        const colors = [
            'rgba(239, 68, 68, 0.6)',
            'rgba(249, 115, 22, 0.6)',
            'rgba(234, 179, 8, 0.6)',
            'rgba(16, 185, 129, 0.6)',
            'rgba(59, 130, 246, 0.6)',
            'rgba(139, 92, 246, 0.6)'
        ];
        if (expenseChart) {
            expenseChart.destroy();
        }
        expenseChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ₹${value.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Helper function to get category icons
    function getCategoryIcon(category) {
        const icons = {
            food: '🍔',
            transport: '🚗',
            shopping: '🛍️',
            entertainment: '🎬',
            bills: '🏠',
            rent: '🏢',
            currentbill: '💡',
            hospital: '🏥',
            other: '📊'
        };
        return icons[category] || '💰';
    }
});
