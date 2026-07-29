// =========================================================
// 1. ตั้งค่าเชื่อมต่อระบบ Firebase
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
const PROMPTPAY_NUMBER = "0812345678"; 

const RATES = { NORMAL: 90, VIP: 120 }; 
const MINIMUM_MINUTES = 30; 

const TABLES = [
    { id: "N1", type: "NORMAL", name: "โต๊ะ 1" }, { id: "N2", type: "NORMAL", name: "โต๊ะ 2" },
    { id: "N3", type: "NORMAL", name: "โต๊ะ 3" }, { id: "N4", type: "NORMAL", name: "โต๊ะ 4" },
    { id: "V1", type: "VIP", name: "VIP 1" }, { id: "V2", type: "VIP", name: "VIP 2" },
    { id: "V3", type: "VIP", name: "VIP 3" }
];

let PRODUCTS = [
    { id: 'p1', name: 'มาม่า', category: 'snack', price: 15, inStock: true },
    { id: 'p2', name: 'ขนมขบเคี้ยว', category: 'snack', price: 20, inStock: true },
    { id: 'p3', name: 'น้ำเปล่า', category: 'water', price: 10, inStock: true },
    { id: 'p4', name: 'โค้ก/เป๊ปซี่', category: 'softdrink', price: 20, inStock: true },
    { id: 'p5', name: 'เบียร์สิงห์', category: 'alcohol', price: 80, inStock: true },
    { id: 'p6', name: 'เบียร์ช้าง', category: 'alcohol', price: 70, inStock: true },
    { id: 'p7', name: 'ไฮเนเก้น', category: 'alcohol', price: 90, inStock: true },
];

const activeTables = {}; 
let currentStaff = null, currentPin = "", currentlyOrderingTableId = null, pendingCheckoutData = null; 
let incomingOrdersData = []; 

function syncProductsToCloud() {
    db.collection("system").doc("products").set({ list: PRODUCTS }).catch(e => console.error("Sync Error", e));
}

// =========================================================
// [อัปเดต] ระบบจัดการออเดอร์ พร้อมปุ่มลบรายการที่ของหมด
// =========================================================
db.collection("incoming_orders").where("status", "==", "pending").onSnapshot((snapshot) => {
    incomingOrdersData = [];
    let isNewAdded = false;

    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") isNewAdded = true;
    });

    snapshot.forEach(doc => {
        incomingOrdersData.push({ id: doc.id, ...doc.data() });
    });
    
    const badge = document.getElementById("pending-badge");
    const btn = document.getElementById("btn-pending-orders");
    
    if(incomingOrdersData.length > 0) {
        btn.classList.remove("hidden");
        badge.innerText = incomingOrdersData.length;
        
        if(isNewAdded && currentStaff && 'speechSynthesis' in window) {
            const lastOrder = incomingOrdersData[incomingOrdersData.length-1];
            const speech = new SpeechSynthesisUtterance(`มีออเดอร์เข้าครับ โต๊ะ ${lastOrder.tableName}`);
            speech.lang = 'th-TH';
            speech.rate = 0.9;
            window.speechSynthesis.speak(speech);
        }
    } else {
        btn.classList.add("hidden");
        closePendingModal(); 
    }

    if (!document.getElementById("pending-modal").classList.contains("hidden")) {
        renderPendingOrders();
    }
});

function openPendingModal() { document.getElementById("pending-modal").classList.remove("hidden"); renderPendingOrders(); }
function closePendingModal() { document.getElementById("pending-modal").classList.add("hidden"); }

function renderPendingOrders() {
    const container = document.getElementById("pending-orders-list");
    if(incomingOrdersData.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 py-10">ไม่มีออเดอร์ค้าง</p>`;
        return;
    }

    let html = '';
    incomingOrdersData.forEach(order => {
        let itemsHtml = '';
        order.items.forEach((it, index) => {
            itemsHtml += `
                <div class="flex justify-between items-center text-sm border-b border-yellow-100/50 py-1.5 last:border-0">
                    <span class="text-gray-700">- ${it.detail.name} <span class="font-bold text-blue-600 ml-1">x${it.qty}</span></span>
                    
                    <!-- [ใหม่] ปุ่มกดตัดสินค้าบางตัวออกกรณีของหมด -->
                    <button onclick="removePendingItem('${order.id}', ${index})" class="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200 transition font-bold">ตัดออก (หมด)</button>
                </div>`;
        });

        html += `
            <div class="border border-yellow-200 bg-yellow-50 rounded-xl p-4 shadow-sm">
                <div class="flex justify-between items-center mb-2 border-b border-yellow-200 pb-2">
                    <h3 class="font-bold text-lg text-yellow-700">📍 ${order.tableName}</h3>
                    <span class="text-xs text-gray-500">รอรับออเดอร์...</span>
                </div>
                <div class="mb-4 space-y-1 bg-white p-2 rounded-lg border border-yellow-100">${itemsHtml}</div>
                <div class="flex gap-2">
                    <button onclick="acceptOrder('${order.id}')" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg shadow">✅ รับออเดอร์นี้</button>
                    <button onclick="rejectOrder('${order.id}')" class="flex-1 bg-red-100 hover:bg-red-200 text-red-600 font-bold py-2 rounded-lg border border-red-200">❌ ยกเลิกทั้งหมด</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// [ใหม่] ฟังก์ชันลบสินค้าแยกชิ้นจากคิวออเดอร์
window.removePendingItem = function(orderId, itemIndex) {
    const order = incomingOrdersData.find(o => o.id === orderId);
    if(order) {
        order.items.splice(itemIndex, 1);
        
        // ถ้าตัดออกหมดทุกชิ้น ก็ถือว่ายกเลิกออเดอร์ทั้งหมด
        if(order.items.length === 0) {
            rejectOrder(orderId);
        } else {
            // อัปเดตข้อมูลขึ้น Firebase ให้ลูกค้าเห็นว่าโดนตัดของ
            db.collection("incoming_orders").doc(orderId).update({ items: order.items });
        }
    }
};

function acceptOrder(orderId) {
    const order = incomingOrdersData.find(o => o.id === orderId);
    if(!order) return;
    
    const tId = order.tableId;
    if (!activeTables[tId]) { activeTables[tId] = { startTime: new Date(), orders: {} }; }
    
    order.items.forEach(item => {
        if (activeTables[tId].orders[item.detail.id]) {
            activeTables[tId].orders[item.detail.id].qty += item.qty;
        } else {
            activeTables[tId].orders[item.detail.id] = { detail: item.detail, qty: item.qty };
        }
    });
    
    saveDataLocally();
    renderTables();
    db.collection("incoming_orders").doc(orderId).update({ status: "accepted" }); 
}

function rejectOrder(orderId) {
    if(confirm("แน่ใจหรือไม่ที่จะยกเลิกออเดอร์นี้ทั้งหมด?")) {
        db.collection("incoming_orders").doc(orderId).update({ status: "rejected" }); 
    }
}

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
    syncProductsToCloud();
}
function loadDataLocally() {
    const savedProducts = localStorage.getItem("dumras_products");
    if (savedProducts) PRODUCTS = JSON.parse(savedProducts);

    PRODUCTS.forEach(p => { if(p.inStock === undefined) p.inStock = true; });

    const savedTables = localStorage.getItem("dumras_tables");
    if (savedTables) {
        const parsedTables = JSON.parse(savedTables);
        for (let id in parsedTables) {
            parsedTables[id].startTime = new Date(parsedTables[id].startTime);
            activeTables[id] = parsedTables[id];
        }
    }
    syncProductsToCloud();
}
loadDataLocally();

setInterval(() => {
    if (currentStaff && !document.getElementById("dashboard-screen").classList.contains("hidden")) { renderTables(); }
}, 60000);

// =========================================================
// 4. ระบบ Login
// =========================================================
function pressPin(num) { if (currentPin.length < 4) { currentPin += num; updatePinUI(); if (currentPin.length === 4) checkLogin(); } }
function clearPin() { currentPin = ""; updatePinUI(); document.getElementById("pin-error").innerText = ""; }
function updatePinUI() { for (let i = 1; i <= 4; i++) document.getElementById(`pin-${i}`).className = (i <= currentPin.length) ? "dot active" : "dot"; }

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
    } catch (error) { document.getElementById("pin-error").innerText = "เกิดข้อผิดพลาด"; setTimeout(clearPin, 1000); }
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
    clearPin(); renderTables();
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
// 5. ระบบจัดการโต๊ะ และการแก้ไขบิลโต๊ะ
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
        if (table.type === "NORMAL") normalContainer.innerHTML += cardHTML; else vipContainer.innerHTML += cardHTML;
    });
}

function startTable(tableId) { activeTables[tableId] = { startTime: new Date(), orders: {} }; saveDataLocally(); renderTables(); }

function openOrderModal(tableId, tableName) { 
    currentlyOrderingTableId = tableId;
    document.getElementById("order-modal-title").innerText = `สั่งของเข้า ${tableName}`;
    document.getElementById("order-modal").classList.remove("hidden");
    
    document.getElementById("order-product-list").innerHTML = PRODUCTS.map(p => {
        if (p.inStock === false) return ''; 
        return `<button onclick="addItemToTable('${p.id}')" class="border p-2 rounded-xl text-left bg-white shadow-sm hover:border-blue-500"><div class="font-bold text-sm">${p.name}</div><div class="text-xs text-gray-500">฿${p.price}</div></button>`;
    }).join("");
    renderCurrentOrders();
}
function closeOrderModal() { document.getElementById("order-modal").classList.add("hidden"); renderTables(); }

function addItemToTable(productId) {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    const product = PRODUCTS.find(p => p.id === productId);
    if (tableOrders[productId]) tableOrders[productId].qty += 1; else tableOrders[productId] = { detail: product, qty: 1 };
    saveDataLocally(); renderCurrentOrders();
}

// [ใหม่] ฟังก์ชันลบสินค้าออกจากบิลของโต๊ะโดยตรง
function reduceItemFromTable(productId) {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    if (tableOrders[productId]) {
        tableOrders[productId].qty -= 1;
        if (tableOrders[productId].qty <= 0) delete tableOrders[productId];
        saveDataLocally(); 
        renderCurrentOrders();
    }
}

// [อัปเดต] หน้าต่างสั่งของ มีปุ่ม + / - เพื่อแก้ไขบิลโต๊ะ
function renderCurrentOrders() {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    const items = Object.values(tableOrders);
    
    if (items.length === 0) { 
        document.getElementById("current-orders-list").innerHTML = "<li class='text-gray-400 text-center py-2'>ยังไม่มีรายการ</li>"; 
        return; 
    }
    
    document.getElementById("current-orders-list").innerHTML = items.map(item => `
        <li class="flex justify-between items-center bg-white p-2 border rounded-lg shadow-sm">
            <span>${item.detail.name} <span class="text-xs text-gray-400">(@${item.detail.price})</span></span>
            
            <div class="flex items-center gap-2 bg-gray-50 p-1 rounded-md border">
                <button onclick="reduceItemFromTable('${item.detail.id}')" class="w-6 h-6 flex items-center justify-center bg-white rounded text-red-500 shadow-sm font-bold">-</button>
                <span class="font-bold text-blue-600 w-4 text-center">${item.qty}</span>
                <button onclick="addItemToTable('${item.detail.id}')" class="w-6 h-6 flex items-center justify-center bg-white rounded text-blue-600 shadow-sm font-bold">+</button>
            </div>
        </li>
    `).join("");
}

// =========================================================
// 6. ระบบบันทึกรายจ่าย
// =========================================================
function openExpenseModal() { document.getElementById("expense-modal").classList.remove("hidden"); }
function closeExpenseModal() { document.getElementById("expense-modal").classList.add("hidden"); }
function saveExpense() {
    const desc = document.getElementById("expense-desc").value.trim(), amount = parseFloat(document.getElementById("expense-amount").value);
    if (!desc || isNaN(amount) || amount <= 0) { alert("กรุณากรอกข้อมูลให้ถูกต้อง"); return; }
    db.collection("expenses").add({ description: desc, amount: amount, staffId: currentStaff.id, staffName: currentStaff.name, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .then(() => { alert("บันทึกรายจ่ายสำเร็จ!"); document.getElementById("expense-desc").value = ""; document.getElementById("expense-amount").value = ""; closeExpenseModal(); })
}

// =========================================================
// 7. จัดการร้านค้า (เพิ่มปุ่มสลับสถานะ "หมด/มีของ")
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
    document.getElementById("admin-product-list").innerHTML = PRODUCTS.map(p => {
        const inStock = p.inStock !== false;
        const stockBtnClass = inStock ? 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border-gray-200 opacity-80';
        const stockText = inStock ? '✅ มีของ' : '🚫 สินค้าหมด';

        return `
        <div class="flex justify-between items-center bg-white border p-2.5 rounded-xl shadow-sm ${!inStock ? 'opacity-70 grayscale' : ''}">
            <div class="flex items-center gap-2">
                <button onclick="toggleStock('${p.id}')" class="px-2 py-1 rounded-lg text-xs font-bold w-16 border transition ${stockBtnClass}">${stockText}</button>
                <div><span class="font-bold text-sm text-gray-800">${p.name}</span><span class="text-xs text-gray-400 ml-1">(${p.category})</span></div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-purple-600">฿${p.price}</span>
                <div class="border-l pl-3 flex gap-2">
                    <button onclick="editProduct('${p.id}')" class="bg-blue-50 text-blue-500 hover:bg-blue-100 px-2 py-1 rounded text-xs">แก้ราคา</button>
                    <button onclick="deleteProduct('${p.id}')" class="bg-red-50 text-red-500 hover:bg-red-100 px-2 py-1 rounded text-xs">ลบ</button>
                </div>
            </div>
        </div>
        `;
    }).join("");
}

function toggleStock(id) {
    const product = PRODUCTS.find(p => p.id === id);
    if(product) {
        product.inStock = product.inStock === false ? true : false;
        saveDataLocally();
        renderAdminProductList();
    }
}

function addNewProduct() {
    const name = document.getElementById("new-p-name").value, price = parseInt(document.getElementById("new-p-price").value), category = document.getElementById("new-p-category").value;
    if (!name || isNaN(price)) { alert("ข้อมูลไม่ถูกต้อง"); return; }
    PRODUCTS.push({ id: 'p' + new Date().getTime(), name: name, price: price, category: category, inStock: true });
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
function deleteProduct(id) { if (confirm(`⚠️ ต้องการลบสินค้านี้ใช่หรือไม่?`)) { PRODUCTS = PRODUCTS.filter(p => p.id !== id); saveDataLocally(); renderAdminProductList(); } }

async function renderAdminStaffList() {
    const listDiv = document.getElementById("admin-staff-list"); listDiv.innerHTML = '<p class="text-gray-400 text-sm">กำลังโหลด...</p>';
    try {
        const snapshot = await db.collection("staff").get(); let html = "";
        snapshot.forEach(doc => {
            const s = doc.data(); const pinId = doc.id;
            const btn = pinId !== "9999" ? `<button onclick="deleteStaff('${pinId}')" class="bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1 rounded-lg text-xs">ลบ</button>` : `<span class="text-[10px] text-gray-400 px-2 py-1">(บัญชีหลัก)</span>`;
            html += `<div class="flex justify-between items-center bg-white border p-2.5 rounded-xl shadow-sm"><div><span class="font-bold text-sm">${s.name}</span> <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded ml-2">PIN: ${s.pin}</span></div><div class="flex items-center gap-2"><span class="text-xs font-bold px-2.5 py-1 rounded-full ${s.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}">${s.role === 'admin' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>${btn}</div></div>`;
        });
        listDiv.innerHTML = html;
    } catch(e) {}
}
async function addNewStaff() {
    const name = document.getElementById("new-s-name").value.trim(), pin = document.getElementById("new-s-pin").value.trim(), role = document.getElementById("new-s-role").value;
    if (!name || pin.length !== 4 || isNaN(pin)) { alert("รหัส PIN ต้องมี 4 หลัก"); return; }
    const checkPin = await db.collection("staff").where("pin", "==", pin).get();
    if(!checkPin.empty) { alert("PIN ซ้ำ"); return; }
    await db.collection("staff").doc(pin).set({ id: 'S' + Math.floor(10 + Math.random() * 90), name: name, pin: pin, role: role }); alert("สำเร็จ!"); renderAdminStaffList();
}
async function deleteStaff(pin) { if(confirm("ลบพนักงานคนนี้?")) { await db.collection("staff").doc(pin).delete(); renderAdminStaffList(); } }

// =========================================================
// 8. ชำระเงิน และ บิล
// =========================================================
function openCheckoutModal(tableId, tableName, tableType) {
    const tableData = activeTables[tableId];
    const msPlayed = Math.abs(new Date() - tableData.startTime);
    let minutesPlayed = Math.floor(msPlayed / 60000); 

    if (minutesPlayed < MINIMUM_MINUTES) minutesPlayed = MINIMUM_MINUTES;
    const ratePerMinute = RATES[tableType] / 60;
    const timeFee = Math.round(minutesPlayed * ratePerMinute); 
    const hoursPlayed = minutesPlayed / 60; 

    const displayHours = Math.floor(minutesPlayed / 60);
    const displayMins = minutesPlayed % 60;
    const timeString = `${displayHours} ชม. ${displayMins} นาที`;

    let itemsFee = 0; const receiptItems = [{ name: `ค่าโต๊ะ (${timeString})`, qty: 1, total: timeFee }];
    if(tableData.orders) { Object.values(tableData.orders).forEach(item => { const total = item.detail.price * item.qty; itemsFee += total; receiptItems.push({ name: item.detail.name, qty: item.qty, total: total }); }); }
    
    const grandTotal = timeFee + itemsFee;
    pendingCheckoutData = { tableId, tableName, hoursPlayed, timeFee, itemsFee, grandTotal, receiptItems };
    
    document.getElementById("co-table").innerText = tableName; document.getElementById("co-time").innerText = timeString; document.getElementById("co-fee-table").innerText = timeFee; document.getElementById("co-fee-items").innerText = itemsFee; document.getElementById("co-total").innerText = grandTotal;
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

    db.collection("transactions").add({ tableId: data.tableId, tableName: data.tableName, method: method, hoursPlayed: data.hoursPlayed, timeFee: data.timeFee, itemsFee: data.itemsFee, grandTotal: data.grandTotal, staffId: currentStaff.id, staffName: currentStaff.name, timestamp: firebase.firestore.FieldValue.serverTimestamp(), items: data.receiptItems })
    .then(() => { fetch("https://onesignal.com/api/v1/notifications", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", "Authorization": "Basic " + ONESIGNAL_REST_KEY }, body: JSON.stringify({ appId: ONESIGNAL_APP_ID, included_segments: ["Subscribed Users"], headings: { "en": "💰 รับเงิน - ดำรัส สนุ๊กเกอร์", "th": "💰 รับเงิน - ดำรัส สนุ๊กเกอร์" }, contents: { "en": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal}`, "th": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal}` } }) }); });
    closeCheckoutModal(); document.getElementById("receipt-modal").classList.remove("hidden"); delete activeTables[data.tableId]; saveDataLocally(); renderTables();
}

function saveReceiptImage() { html2canvas(document.getElementById("receipt-paper"), { scale: 2 }).then(canvas => { const link = document.createElement('a'); link.download = `Receipt_${new Date().getTime()}.png`; link.href = canvas.toDataURL("image/png"); link.click(); }); }
function closeReceiptModal() { document.getElementById("receipt-modal").classList.add("hidden"); }

// =========================================================
// 9. ระบบบัญชี 
// =========================================================
function openReportModal() { document.getElementById("report-modal").classList.remove("hidden"); const datePicker = document.getElementById("report-date-picker"); if (!datePicker.value) { const today = new Date(); datePicker.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; } loadReportData(); }
function toggleReportSection(sectionId) { const sections = ['detail-income', 'detail-expense', 'detail-table', 'detail-product']; sections.forEach(id => { if (id !== sectionId) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); } }); const target = document.getElementById(sectionId); if (target) { target.classList.toggle('hidden'); if(!target.classList.contains('hidden')) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }
function loadReportData() {
    document.getElementById("report-content").innerHTML = '<p class="text-center text-gray-500 py-10">กำลังโหลดข้อมูลบัญชี...</p>';
    const d = new Date(document.getElementById("report-date-picker").value); const sDate = new Date(d); sDate.setHours(0,0,0,0); const eDate = new Date(d); eDate.setHours(23,59,59,999);
    Promise.all([db.collection("transactions").where("timestamp", ">=", sDate).where("timestamp", "<=", eDate).orderBy("timestamp", "desc").get(), db.collection("expenses").where("timestamp", ">=", sDate).where("timestamp", "<=", eDate).orderBy("timestamp", "desc").get()]).then(([tSnap, eSnap]) => {
        let tIn = 0, tEx = 0, tC = 0, tTr = 0, tTa = 0, tP = 0, tblStat = {}, pStat = {}, bHtml = '', eHtml = '';
        tSnap.forEach(doc => { const data = doc.data(); const gT = data.grandTotal||0; tIn+=gT; if(data.method==='เงินสด') tC+=gT; if(data.method==='เงินโอน') tTr+=gT; let tF=data.timeFee||0, pF=data.itemsFee||0; if(tF===0&&pF===0&&data.items&&data.items.length>0){tF=data.items[0].total||0; pF=gT-tF;} tTa+=tF; tP+=pF; const tN=data.tableName; let hrs=data.hoursPlayed; if(hrs===undefined&&data.items&&data.items.length>0){const m=data.items[0].name.match(/ค่าโต๊ะ \(([\d.]+) ชม.\)/); hrs=m&&m[1]?parseFloat(m[1]):0;}else if(hrs===undefined) hrs=0; if(!tblStat[tN]) tblStat[tN]={s:0, h:0, t:0}; tblStat[tN].s++; tblStat[tN].h+=hrs; tblStat[tN].t+=tF; if(data.items) data.items.forEach(i=>{ if(!i.name.startsWith("ค่าโต๊ะ")){ if(!pStat[i.name]) pStat[i.name]={q:0, t:0}; pStat[i.name].q+=i.qty; pStat[i.name].t+=i.total;} }); const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) : '-'; bHtml+=`<div class="border-b border-gray-100 py-2 text-sm"><div class="flex justify-between items-center mb-1"><div><span class="font-bold">${tN}</span><span class="text-xs text-gray-400 ml-1">(${time})</span></div><div class="font-bold text-green-600">+฿${gT}</div></div></div>`; }); if(tSnap.empty) bHtml = '<p class="text-gray-400 text-center text-sm py-2">ไม่มีข้อมูล</p>';
        eSnap.forEach(doc => { const data = doc.data(); tEx+=(data.amount||0); const time = data.timestamp ? data.timestamp.toDate().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) : '-'; eHtml+=`<div class="border-b border-gray-100 py-2 text-sm"><div class="flex justify-between items-center mb-1"><div><span class="font-bold">${data.description}</span><span class="text-xs text-gray-400 ml-1">(${time})</span></div><div class="font-bold text-red-500">-฿${data.amount}</div></div></div>`; }); if(eSnap.empty) eHtml = '<p class="text-gray-400 text-center text-sm py-2">ไม่มีข้อมูล</p>';
        let tblHtml = '<div class="grid grid-cols-2 gap-2 text-sm">'; for(let [k,v] of Object.entries(tblStat)){ tblHtml+=`<div class="bg-white border p-2 rounded-lg"><div class="flex justify-between font-bold"><span>${k}</span><span>฿${v.t}</span></div></div>`;} tblHtml+='</div>';
        const sortedP = Object.entries(pStat).sort((a,b)=>b[1].q-a[1].q); let pHtml = '<div class="space-y-1 text-sm bg-white p-2 rounded-lg border">'; for(let [k,v] of sortedP){ pHtml+=`<div class="flex justify-between border-b pb-1"><span>${k}</span><span class="font-bold">x${v.q} <span class="text-gray-500">฿${v.t}</span></span></div>`;} pHtml+='</div>';
        const net = tIn-tEx, netClass = net>=0?'text-green-400':'text-red-400';
        document.getElementById("report-content").innerHTML = `<div class="bg-gray-800 text-white p-5 rounded-2xl mb-4"><div class="text-center"><p class="text-sm">ยอดคงเหลือ</p><p class="text-4xl font-bold ${netClass} mb-4">฿${net.toLocaleString()}</p><div class="grid grid-cols-2 gap-4 border-t border-gray-600 pt-4"><div onclick="toggleReportSection('detail-income')" class="cursor-pointer hover:bg-gray-700 p-2 rounded"><p class="text-xs">รายรับทั้งหมด</p><p class="text-xl font-bold text-green-400">฿${tIn.toLocaleString()}</p></div><div onclick="toggleReportSection('detail-expense')" class="cursor-pointer hover:bg-gray-700 p-2 rounded border-l border-gray-600"><p class="text-xs">รายจ่ายทั้งหมด</p><p class="text-xl font-bold text-red-400">฿${tEx.toLocaleString()}</p></div></div></div></div><div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"><div class="bg-green-50 p-3 rounded-xl border text-center"><div class="text-[10px] text-green-600 font-bold">เงินสด</div><div class="text-sm font-bold text-green-700">฿${tC}</div></div><div class="bg-blue-50 p-3 rounded-xl border text-center"><div class="text-[10px] text-blue-600 font-bold">เงินโอน</div><div class="text-sm font-bold text-blue-700">฿${tTr}</div></div><div class="bg-orange-50 p-3 rounded-xl border text-center cursor-pointer" onclick="toggleReportSection('detail-table')"><div class="text-[10px] text-orange-600 font-bold">ค่าโต๊ะ</div><div class="text-sm font-bold text-orange-700">฿${tTa}</div></div><div class="bg-purple-50 p-3 rounded-xl border text-center cursor-pointer" onclick="toggleReportSection('detail-product')"><div class="text-[10px] text-purple-600 font-bold">ค่าสินค้า</div><div class="text-sm font-bold text-purple-700">฿${tP}</div></div></div><div id="detail-income" class="hidden bg-green-50 border p-4 rounded-xl mb-4"><h3 class="font-bold text-green-700 mb-2 border-b pb-1">ประวัติรับเงิน</h3>${bHtml}</div><div id="detail-expense" class="hidden bg-red-50 border p-4 rounded-xl mb-4"><h3 class="font-bold text-red-700 mb-2 border-b pb-1">ประวัติจ่ายเงิน</h3>${eHtml}</div><div id="detail-table" class="hidden bg-orange-50 border p-4 rounded-xl mb-4"><h3 class="font-bold text-orange-700 mb-2 border-b pb-1">สรุปการใช้โต๊ะ</h3>${tblHtml}</div><div id="detail-product" class="hidden bg-purple-50 border p-4 rounded-xl mb-4"><h3 class="font-bold text-purple-700 mb-2 border-b pb-1">ยอดขายสินค้า</h3>${pHtml}</div>`;
    });
}
function closeReportModal() { document.getElementById("report-modal").classList.add("hidden"); }
