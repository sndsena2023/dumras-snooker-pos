// =========================================================
// 1. ตั้งค่าเชื่อมต่อระบบ
// =========================================================
const firebaseConfig = {
    apiKey: "AIzaSyD3_M85acXiPsrDNzvzHOPPW9cjRsL2NRk",
    authDomain: "dumras-snooker-pos.firebaseapp.com",
    projectId: "dumras-snooker-pos",
    storageBucket: "dumras-snooker-pos.firebasestorage.app",
    messagingSenderId: "985526889212",
    appId: "1:985526889212:web:f4c71ad06b838cf9748579"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const ONESIGNAL_APP_ID = "d69a2e29-6636-4ac6-b7fe-898e3210754f";
const ONESIGNAL_REST_KEY = "os_v2_app_22nc4klggzfmnn76rghdeedvj7k6ymxxxxaukw5prv77asp7lk36yh323jsgjyfzp2x3klbqjwfc5m2qsea3f6jtq3bmhcc5ykn36zi";
const PROMPTPAY_NUMBER = "0812345678"; // <--- ⚠️ เปลี่ยนเบอร์พร้อมเพย์ที่นี่

const TABLES = [
    { id: "N1", type: "NORMAL", name: "โต๊ะ 1" }, { id: "N2", type: "NORMAL", name: "โต๊ะ 2" },
    { id: "N3", type: "NORMAL", name: "โต๊ะ 3" }, { id: "N4", type: "NORMAL", name: "โต๊ะ 4" },
    { id: "V1", type: "VIP", name: "VIP 1" }, { id: "V2", type: "VIP", name: "VIP 2" },
    { id: "V3", type: "VIP", name: "VIP 3" }
];

let PRODUCTS = [
    { id: 'p1', name: 'มาม่า', category: 'snack', price: 15 },
    { id: 'p2', name: 'ขนมขบเคี้ยว', category: 'snack', price: 20 },
    { id: 'p3', name: 'น้ำเปล่า', category: 'water', price: 10 },
    { id: 'p4', name: 'โค้ก/เป๊ปซี่', category: 'softdrink', price: 20 },
    { id: 'p5', name: 'เบียร์สิงห์', category: 'alcohol', price: 80 },
    { id: 'p6', name: 'เบียร์ช้าง', category: 'alcohol', price: 70 },
    { id: 'p7', name: 'ไฮเนเก้น', category: 'alcohol', price: 90 },
];

const RATES = { NORMAL: 90, VIP: 120 }; 
const activeTables = {}; 
let currentStaff = null, currentPin = "", currentlyOrderingTableId = null, pendingCheckoutData = null; 

// =========================================================
// 3. ฟังก์ชันเริ่มต้นและจำข้อมูล
// =========================================================
async function initializeDefaultStaff() {
    const staffSnapshot = await db.collection("staff").get();
    if (staffSnapshot.empty) {
        await db.collection("staff").doc("1234").set({ id: "S01", name: "พนักงาน 1", pin: "1234", role: "staff" });
        await db.collection("staff").doc("9999").set({ id: "A01", name: "เจ้าของร้าน", pin: "9999", role: "admin" });
    }
}
initializeDefaultStaff();

function saveDataLocally() {
    localStorage.setItem("dumras_tables", JSON.stringify(activeTables));
    localStorage.setItem("dumras_products", JSON.stringify(PRODUCTS));
}
function loadDataLocally() {
    const savedProducts = localStorage.getItem("dumras_products");
    if (savedProducts) PRODUCTS = JSON.parse(savedProducts);

    const savedTables = localStorage.getItem("dumras_tables");
    if (savedTables) {
        const parsedTables = JSON.parse(savedTables);
        for (let id in parsedTables) {
            parsedTables[id].startTime = new Date(parsedTables[id].startTime);
            activeTables[id] = parsedTables[id];
        }
    }
}
loadDataLocally();

setInterval(() => {
    if (currentStaff && !document.getElementById("dashboard-screen").classList.contains("hidden")) {
        renderTables();
    }
}, 60000);

// =========================================================
// 4. ระบบ Login
// =========================================================
function pressPin(num) {
    if (currentPin.length < 4) { currentPin += num; updatePinUI(); if (currentPin.length === 4) checkLogin(); }
}
function clearPin() { currentPin = ""; updatePinUI(); document.getElementById("pin-error").innerText = ""; }
function updatePinUI() {
    for (let i = 1; i <= 4; i++) document.getElementById(`pin-${i}`).className = (i <= currentPin.length) ? "dot active" : "dot";
}

async function checkLogin() {
    try {
        const querySnapshot = await db.collection("staff").where("pin", "==", currentPin).get();
        if (!querySnapshot.empty) {
            const staffData = querySnapshot.docs[0].data();
            currentStaff = staffData;
            localStorage.setItem("dumras_staff_session", JSON.stringify(staffData));
            applyLoginState();
        } else {
            document.getElementById("pin-error").innerText = "รหัส PIN ไม่ถูกต้อง"; setTimeout(clearPin, 800);
        }
    } catch (error) {
        document.getElementById("pin-error").innerText = "เกิดข้อผิดพลาดในการเชื่อมต่อ"; setTimeout(clearPin, 1000);
    }
}

function applyLoginState() {
    document.getElementById("current-staff-name").innerText = `${currentStaff.name}`;
    if (currentStaff.role === "admin") {
        document.getElementById("btn-admin-manage").classList.remove("hidden");
        document.getElementById("btn-admin-report").classList.remove("hidden");
    } else {
        document.getElementById("btn-admin-manage").classList.add("hidden");
        document.getElementById("btn-admin-report").classList.add("hidden");
    }
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("dashboard-screen").classList.remove("hidden");
    clearPin();
    renderTables();
}

function restoreSession() {
    const savedStaff = localStorage.getItem("dumras_staff_session");
    if (savedStaff) { currentStaff = JSON.parse(savedStaff); applyLoginState(); }
}
restoreSession();

function logout() {
    currentStaff = null; localStorage.removeItem("dumras_staff_session");
    document.getElementById("dashboard-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

// =========================================================
// 5. ระบบจัดการโต๊ะ
// =========================================================
function renderTables() {
    const normalContainer = document.getElementById("normal-tables-container");
    const vipContainer = document.getElementById("vip-tables-container");
    normalContainer.innerHTML = ""; vipContainer.innerHTML = "";

    const isAdmin = currentStaff && currentStaff.role === "admin";

    TABLES.forEach(table => {
        const tableData = activeTables[table.id];
        const isActive = !!tableData;
        const borderColor = table.type === "VIP" ? "border-yellow-400" : "border-blue-400";
        const gradient = table.type === "VIP" ? "from-yellow-50 to-orange-50" : "from-blue-50 to-cyan-50";

        let totalItemsCount = 0, timeStartString = "", timeElapsedString = "";

        if (isActive) {
            if (tableData.orders) Object.values(tableData.orders).forEach(o => totalItemsCount += o.qty);
            const startTime = tableData.startTime;
            timeStartString = startTime.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
            const diffMins = Math.floor((new Date() - startTime) / 60000);
            timeElapsedString = `${Math.floor(diffMins / 60)} ชม. ${diffMins % 60} นาที`;
        }

        let actionButtons = "";
        if (isActive) {
            if (isAdmin) {
                actionButtons = `<div class="text-center text-sm font-bold text-purple-600 bg-purple-100 py-2 rounded-xl border border-purple-200">👁️ โหมดดูสถานะ</div>`;
            } else {
                actionButtons = `
                    <div class="flex gap-2">
                        <button onclick="openOrderModal('${table.id}', '${table.name}')" class="flex-1 bg-white border border-blue-500 text-blue-600 font-medium py-2 rounded-xl text-sm hover:bg-blue-50">สั่งของ</button>
                        <button onclick="openCheckoutModal('${table.id}', '${table.name}', '${table.type}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 rounded-xl text-sm">เช็คบิล</button>
                    </div>`;
            }
        } else {
            if (isAdmin) {
                actionButtons = `<div class="text-center text-sm text-gray-400 py-2">- โต๊ะว่าง -</div>`;
            } else {
                actionButtons = `<button onclick="startTable('${table.id}')" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-xl shadow-sm">เปิดโต๊ะ</button>`;
            }
        }

        const cardHTML = `
            <div class="bg-gradient-to-b ${gradient} p-4 rounded-2xl shadow-sm border-t-4 ${borderColor} relative">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-bold text-xl">${table.name}</h3>
                    <span class="text-xs px-2 py-1 rounded-full font-medium ${isActive ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}">${isActive ? 'กำลังเล่น' : 'ว่าง'}</span>
                </div>
                ${isActive 
                    ? `<div class="text-xs text-gray-600 mb-3 space-y-1">
                         <p>⏰ เริ่มเล่น: <span class="font-bold">${timeStartString}</span></p>
                         <p>⏱️ เล่นไปแล้ว: <span class="font-bold text-blue-600">${timeElapsedString}</span></p>
                         <p>🛒 สั่งสินค้า: <span class="font-bold">${totalItemsCount}</span> ชิ้น</p>
                       </div>${actionButtons}` 
                    : `<p class="text-sm text-gray-400 mb-4 text-center">- ยังไม่มีลูกค้า -</p>${actionButtons}`
                }
            </div>
        `;
        if (table.type === "NORMAL") normalContainer.innerHTML += cardHTML;
        else vipContainer.innerHTML += cardHTML;
    });
}

function startTable(tableId) { activeTables[tableId] = { startTime: new Date(), orders: {} }; saveDataLocally(); renderTables(); }

function openOrderModal(tableId, tableName) { 
    currentlyOrderingTableId = tableId;
    document.getElementById("order-modal-title").innerText = `สั่งของเข้า ${tableName}`;
    document.getElementById("order-modal").classList.remove("hidden");
    document.getElementById("order-product-list").innerHTML = PRODUCTS.map(p => `
        <button onclick="addItemToTable('${p.id}')" class="border p-2 rounded-xl text-left bg-white shadow-sm hover:border-blue-500">
            <div class="font-bold text-sm">${p.name}</div><div class="text-xs text-gray-500">฿${p.price}</div>
        </button>
    `).join("");
    renderCurrentOrders();
}
function closeOrderModal() { document.getElementById("order-modal").classList.add("hidden"); renderTables(); }

function addItemToTable(productId) {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    const product = PRODUCTS.find(p => p.id === productId);
    if (tableOrders[productId]) tableOrders[productId].qty += 1;
    else tableOrders[productId] = { detail: product, qty: 1 };
    saveDataLocally(); renderCurrentOrders();
}

function renderCurrentOrders() {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    const items = Object.values(tableOrders);
    if (items.length === 0) { document.getElementById("current-orders-list").innerHTML = "<li class='text-gray-400'>ยังไม่มีรายการ</li>"; return; }
    document.getElementById("current-orders-list").innerHTML = items.map(item => `<li class="flex justify-between items-center bg-white p-2 border rounded"><span>${item.detail.name} <span class="text-xs text-gray-400">(@${item.detail.price})</span></span><span class="font-bold text-blue-600">x${item.qty}</span></li>`).join("");
}

// =========================================================
// 6. ระบบบันทึกรายจ่าย (ใหม่)
// =========================================================
function openExpenseModal() { document.getElementById("expense-modal").classList.remove("hidden"); }
function closeExpenseModal() { document.getElementById("expense-modal").classList.add("hidden"); }

function saveExpense() {
    const desc = document.getElementById("expense-desc").value.trim();
    const amount = parseFloat(document.getElementById("expense-amount").value);

    if (!desc || isNaN(amount) || amount <= 0) {
        alert("กรุณากรอกรายละเอียดและจำนวนเงินให้ถูกต้อง");
        return;
    }

    db.collection("expenses").add({
        description: desc,
        amount: amount,
        staffId: currentStaff.id,
        staffName: currentStaff.name,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        alert("บันทึกรายจ่ายสำเร็จ!");
        document.getElementById("expense-desc").value = "";
        document.getElementById("expense-amount").value = "";
        closeExpenseModal();
    }).catch((error) => {
        console.error("Error writing expense: ", error);
        alert("เกิดข้อผิดพลาดในการบันทึกรายจ่าย");
    });
}

// =========================================================
// 7. จัดการร้านค้า (สินค้า & พนักงาน)
// =========================================================
function switchAdminTab(tab) {
    const prodSec = document.getElementById("admin-section-products"), staffSec = document.getElementById("admin-section-staff");
    const prodBtn = document.getElementById("tab-btn-products"), staffBtn = document.getElementById("tab-btn-staff");
    if(tab === 'products') {
        prodSec.classList.remove("hidden"); staffSec.classList.add("hidden");
        prodBtn.className = "flex-1 pb-2 font-bold text-purple-600 border-b-2 border-purple-600"; staffBtn.className = "flex-1 pb-2 font-bold text-gray-400";
    } else {
        prodSec.classList.add("hidden"); staffSec.classList.remove("hidden");
        staffBtn.className = "flex-1 pb-2 font-bold text-blue-600 border-b-2 border-blue-600"; prodBtn.className = "flex-1 pb-2 font-bold text-gray-400";
        renderAdminStaffList();
    }
}

function openProductManager() { document.getElementById("product-modal").classList.remove("hidden"); renderAdminProductList(); }
function closeProductManager() { document.getElementById("product-modal").classList.add("hidden"); }

function renderAdminProductList() {
    document.getElementById("admin-product-list").innerHTML = PRODUCTS.map(p => `
        <div class="flex justify-between items-center bg-white border p-2.5 rounded-xl shadow-sm">
            <div><span class="font-bold text-sm text-gray-800">${p.name}</span><span class="text-xs text-gray-400 ml-1">(${p.category})</span></div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-purple-600">฿${p.price}</span>
                <div class="border-l pl-3 flex gap-2">
                    <button onclick="editProduct('${p.id}')" class="bg-blue-50 text-blue-500 hover:bg-blue-100 px-2 py-1 rounded text-xs">แก้ราคา</button>
                    <button onclick="deleteProduct('${p.id}')" class="bg-red-50 text-red-500 hover:bg-red-100 px-2 py-1 rounded text-xs">ลบ</button>
                </div>
            </div>
        </div>
    `).join("");
}

function addNewProduct() {
    const name = document.getElementById("new-p-name").value, price = parseInt(document.getElementById("new-p-price").value), category = document.getElementById("new-p-category").value;
    if (!name || isNaN(price)) { alert("ข้อมูลไม่ถูกต้อง"); return; }
    PRODUCTS.push({ id: 'p' + new Date().getTime(), name: name, price: price, category: category });
    saveDataLocally(); document.getElementById("new-p-name").value = ""; document.getElementById("new-p-price").value = ""; renderAdminProductList();
}

function editProduct(id) {
    const product = PRODUCTS.find(p => p.id === id); if (!product) return;
    const newPrice = prompt(`✏️ แก้ไขราคาสินค้า: ${product.name}\nราคาปัจจุบัน: ${product.price} บาท\n\nโปรดใส่ราคาใหม่:`, product.price);
    if (newPrice !== null && newPrice.trim() !== "") {
        const parsed = parseInt(newPrice);
        if (!isNaN(parsed) && parsed >= 0) { product.price = parsed; saveDataLocally(); renderAdminProductList(); } else alert("❌ ราคาต้องเป็นตัวเลข");
    }
}
function deleteProduct(id) {
    if (confirm(`⚠️ ต้องการลบสินค้านี้ใช่หรือไม่?`)) { PRODUCTS = PRODUCTS.filter(p => p.id !== id); saveDataLocally(); renderAdminProductList(); }
}

async function renderAdminStaffList() {
    const listDiv = document.getElementById("admin-staff-list"); listDiv.innerHTML = '<p class="text-gray-400 text-sm">กำลังโหลด...</p>';
    try {
        const snapshot = await db.collection("staff").get(); let html = "";
        snapshot.forEach(doc => {
            const s = doc.data(); const pinId = doc.id;
            const btn = pinId !== "9999" ? `<button onclick="deleteStaff('${pinId}')" class="bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1 rounded-lg text-xs">ลบ</button>` : `<span class="text-[10px] text-gray-400 px-2 py-1">(บัญชีหลัก)</span>`;
            html += `<div class="flex justify-between items-center bg-white border p-2.5 rounded-xl shadow-sm">
                    <div><span class="font-bold text-sm">${s.name}</span> <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded ml-2">PIN: ${s.pin}</span></div>
                    <div class="flex items-center gap-2"><span class="text-xs font-bold px-2.5 py-1 rounded-full ${s.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}">${s.role === 'admin' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>${btn}</div></div>`;
        });
        listDiv.innerHTML = html;
    } catch(e) { listDiv.innerHTML = '<p class="text-red-500 text-sm">โหลดข้อมูลไม่สำเร็จ</p>'; }
}
async function addNewStaff() {
    const name = document.getElementById("new-s-name").value.trim(), pin = document.getElementById("new-s-pin").value.trim(), role = document.getElementById("new-s-role").value;
    if (!name || pin.length !== 4 || isNaN(pin)) { alert("รหัส PIN ต้องมี 4 หลัก"); return; }
    const checkPin = await db.collection("staff").where("pin", "==", pin).get();
    if(!checkPin.empty) { alert("PIN ซ้ำ"); return; }
    await db.collection("staff").doc(pin).set({ id: 'S' + Math.floor(10 + Math.random() * 90), name: name, pin: pin, role: role });
    alert("สำเร็จ!"); renderAdminStaffList();
}
async function deleteStaff(pin) { if(confirm("ลบพนักงานคนนี้?")) { await db.collection("staff").doc(pin).delete(); renderAdminStaffList(); } }

// =========================================================
// 8. ชำระเงิน และ บิล
// =========================================================
function openCheckoutModal(tableId, tableName, tableType) {
    const tableData = activeTables[tableId];
    const msPlayed = Math.abs(new Date() - tableData.startTime);
    let hoursPlayed = msPlayed / 36e5; if(hoursPlayed < 0.1) hoursPlayed = 1; 
    const timeFee = Math.ceil(hoursPlayed * RATES[tableType]);
    let itemsFee = 0; const receiptItems = [{ name: `ค่าโต๊ะ (${hoursPlayed.toFixed(1)} ชม.)`, qty: 1, total: timeFee }];
    if(tableData.orders) {
        Object.values(tableData.orders).forEach(item => { const total = item.detail.price * item.qty; itemsFee += total; receiptItems.push({ name: item.detail.name, qty: item.qty, total: total }); });
    }
    const grandTotal = timeFee + itemsFee;
    pendingCheckoutData = { tableId, tableName, hoursPlayed, timeFee, itemsFee, grandTotal, receiptItems };
    document.getElementById("co-table").innerText = tableName; document.getElementById("co-time").innerText = hoursPlayed.toFixed(1) + " ชม."; document.getElementById("co-fee-table").innerText = timeFee; document.getElementById("co-fee-items").innerText = itemsFee; document.getElementById("co-total").innerText = grandTotal;
    document.getElementById("checkout-modal").classList.remove("hidden");
}
function closeCheckoutModal() { document.getElementById("checkout-modal").classList.add("hidden"); }

function processPayment(method) {
    const data = pendingCheckoutData;
    document.getElementById("rcpt-table").innerText = data.tableName; document.getElementById("rcpt-date").innerText = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    document.getElementById("rcpt-staff").innerText = currentStaff.name; document.getElementById("rcpt-method").innerText = method;
    document.getElementById("rcpt-items").innerHTML = data.receiptItems.map(item => `<tr class="border-b"><td class="py-1">${item.name}</td><td class="py-1 text-center">${item.qty}</td><td class="py-1 text-right">฿${item.total}</td></tr>`).join("");
    document.getElementById("rcpt-total").innerText = data.grandTotal;

    const qrSection = document.getElementById("qr-payment-section");
    if (method === 'เงินโอน') { qrSection.classList.remove("hidden"); qrSection.classList.add("flex"); document.getElementById("qr-total-display").innerText = data.grandTotal; document.getElementById("qr-image").src = `https://promptpay.io/${PROMPTPAY_NUMBER}/${data.grandTotal}.png`; } 
    else { qrSection.classList.remove("flex"); qrSection.classList.add("hidden"); }

    db.collection("transactions").add({
        tableId: data.tableId, tableName: data.tableName, method: method, hoursPlayed: data.hoursPlayed, timeFee: data.timeFee, itemsFee: data.itemsFee, grandTotal: data.grandTotal, staffId: currentStaff.id, staffName: currentStaff.name, timestamp: firebase.firestore.FieldValue.serverTimestamp(), items: data.receiptItems
    }).then(() => {
        fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", "Authorization": "Basic " + ONESIGNAL_REST_KEY },
            body: JSON.stringify({ appId: ONESIGNAL_APP_ID, included_segments: ["Subscribed Users"], headings: { "en": "💰 รับเงิน - ดำรัส สนุ๊กเกอร์", "th": "💰 รับเงิน - ดำรัส สนุ๊กเกอร์" }, contents: { "en": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal} (${method})`, "th": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal} (${method})` } })
        });
    });
    closeCheckoutModal(); document.getElementById("receipt-modal").classList.remove("hidden"); delete activeTables[data.tableId]; saveDataLocally(); renderTables();
}

function saveReceiptImage() { html2canvas(document.getElementById("receipt-paper"), { scale: 2 }).then(canvas => { const link = document.createElement('a'); link.download = `Receipt_${new Date().getTime()}.png`; link.href = canvas.toDataURL("image/png"); link.click(); }); }
function closeReceiptModal() { document.getElementById("receipt-modal").classList.add("hidden"); }

// =========================================================
// 9. ระบบบัญชี (รายรับ-รายจ่าย เลือกวันได้)
// =========================================================
function openReportModal() {
    document.getElementById("report-modal").classList.remove("hidden");
    
    // ตั้งค่า Date Picker เป็นวันปัจจุบันถ้ายังไม่ได้เลือก
    const datePicker = document.getElementById("report-date-picker");
    if (!datePicker.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        datePicker.value = `${yyyy}-${mm}-${dd}`;
    }
    
    loadReportData();
}

function loadReportData() {
    document.getElementById("report-content").innerHTML = '<p class="text-center text-gray-500 py-10">กำลังโหลดข้อมูลบัญชี...</p>';
    
    // ดึงวันที่จาก Input
    const selectedDateStr = document.getElementById("report-date-picker").value;
    const targetDate = new Date(selectedDateStr);
    
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

    // โหลดข้อมูล รายรับ (transactions) และ รายจ่าย (expenses) พร้อมกัน
    Promise.all([
        db.collection("transactions").where("timestamp", ">=", startOfDay).where("timestamp", "<=", endOfDay).orderBy("timestamp", "desc").get(),
        db.collection("expenses").where("timestamp", ">=", startOfDay).where("timestamp", "<=", endOfDay).orderBy("timestamp", "desc").get()
    ]).then(([transSnapshot, expSnapshot]) => {
        
        let totalIncome = 0, totalExpense = 0;
        let billsHtml = '', expensesHtml = '';
        
        // 1. ประมวลผลรายรับ
        transSnapshot.forEach((doc) => {
            const data = doc.data();
            totalIncome += (data.grandTotal || 0);
            
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'}) : '-';
            billsHtml += `
                <div class="flex justify-between items-center border-b border-gray-100 py-2 text-sm">
                    <div>
                        <div class="font-bold text-gray-700">${data.tableName} <span class="text-xs font-normal text-gray-400 ml-1">(${timeStr})</span></div>
                        <div class="text-xs text-gray-500">รับโดย: ${data.staffName}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-green-600 text-lg">+฿${data.grandTotal}</div>
                        <div class="text-[10px] font-bold px-2 rounded-full inline-block ${data.method === 'เงินสด' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}">${data.method}</div>
                    </div>
                </div>
            `;
        });
        if(transSnapshot.empty) billsHtml = '<p class="text-sm text-gray-400 py-2">ไม่มีรายรับในวันนี้</p>';

        // 2. ประมวลผลรายจ่าย
        expSnapshot.forEach((doc) => {
            const data = doc.data();
            totalExpense += (data.amount || 0);
            
            const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'}) : '-';
            expensesHtml += `
                <div class="flex justify-between items-center border-b border-gray-100 py-2 text-sm">
                    <div>
                        <div class="font-bold text-gray-700">${data.description} <span class="text-xs font-normal text-gray-400 ml-1">(${timeStr})</span></div>
                        <div class="text-xs text-gray-500">บันทึกโดย: ${data.staffName}</div>
                    </div>
                    <div class="font-bold text-red-500 text-lg">-฿${data.amount}</div>
                </div>
            `;
        });
        if(expSnapshot.empty) expensesHtml = '<p class="text-sm text-gray-400 py-2">ไม่มีรายจ่ายในวันนี้</p>';

        // 3. สรุปยอดบัญชี
        const netProfit = totalIncome - totalExpense;
        const profitColorClass = netProfit >= 0 ? 'text-green-400' : 'text-red-400';

        document.getElementById("report-content").innerHTML = `
            <!-- กล่องสรุปยอดบัญชี -->
            <div class="bg-gray-800 text-white p-5 rounded-2xl shadow-lg mb-6 relative overflow-hidden">
                <div class="relative z-10 flex flex-col items-center">
                    <p class="text-sm text-gray-300 mb-1">ยอดคงเหลือสุทธิ (Net Balance)</p>
                    <p class="text-4xl font-bold ${profitColorClass} mb-4">฿${netProfit.toLocaleString()}</p>
                    
                    <div class="w-full grid grid-cols-2 gap-4 border-t border-gray-600 pt-4 mt-2">
                        <div class="text-center">
                            <p class="text-xs text-gray-400 mb-1">รายรับ (Income)</p>
                            <p class="text-xl font-bold text-green-400">฿${totalIncome.toLocaleString()}</p>
                        </div>
                        <div class="text-center border-l border-gray-600">
                            <p class="text-xs text-gray-400 mb-1">รายจ่าย (Expense)</p>
                            <p class="text-xl font-bold text-red-400">฿${totalExpense.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- คอลัมน์รายรับ -->
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <h3 class="font-bold text-green-700 mb-3 border-b pb-2 flex items-center gap-2">
                        <span>📥</span> รายการรับเงิน
                    </h3>
                    <div class="space-y-1">${billsHtml}</div>
                </div>

                <!-- คอลัมน์รายจ่าย -->
                <div class="bg-red-50 p-4 rounded-xl border border-red-100">
                    <h3 class="font-bold text-red-700 mb-3 border-b border-red-200 pb-2 flex items-center gap-2">
                        <span>💸</span> รายการจ่ายเงิน
                    </h3>
                    <div class="space-y-1">${expensesHtml}</div>
                </div>
            </div>
        `;
    }).catch((error) => {
        console.error("Error loading accounting data: ", error);
        document.getElementById("report-content").innerHTML = '<p class="text-center text-red-500 py-10">โหลดข้อมูลไม่สำเร็จ</p>';
    });
}

function closeReportModal() { document.getElementById("report-modal").classList.add("hidden"); }
