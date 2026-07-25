// =========================================================
// 1. ตั้งค่าเชื่อมต่อระบบ (ใส่ข้อมูลจริงของคุณแล้ว)
// =========================================================
const firebaseConfig = {
    apiKey: "AIzaSyD3_M85acXiPsrDNzvzHOPPW9cjRsL2NRk",
    authDomain: "dumras-snooker-pos.firebaseapp.com",
    projectId: "dumras-snooker-pos",
    storageBucket: "dumras-snooker-pos.firebasestorage.app",
    messagingSenderId: "985526889212",
    appId: "1:985526889212:web:f4c71ad06b838cf9748579"
};

// เริ่มต้น Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ตั้งค่า OneSignal & QR Code
const ONESIGNAL_APP_ID = "d69a2e29-6636-4ac6-b7fe-898e3210754f";
const ONESIGNAL_REST_KEY = "os_v2_app_22nc4klggzfmnn76rghdeedvj7k6ymxxxxaukw5prv77asp7lk36yh323jsgjyfzp2x3klbqjwfc5m2qsea3f6jtq3bmhcc5ykn36zi";
const PROMPTPAY_NUMBER = "0812345678"; // <--- ⚠️ อย่าลืมแก้ตรงนี้เป็นเบอร์รับเงินของร้าน

// =========================================================
// 2. ข้อมูลตั้งต้น
// =========================================================
const STAFF_DB = {
    "1234": { id: "S01", name: "พนักงาน 1", role: "staff" },
    "9999": { id: "A01", name: "เจ้าของร้าน", role: "admin" }
};

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
// 3. ฟังก์ชัน Login
// =========================================================
function pressPin(num) {
    if (currentPin.length < 4) {
        currentPin += num;
        updatePinUI();
        if (currentPin.length === 4) checkLogin();
    }
}
function clearPin() { currentPin = ""; updatePinUI(); document.getElementById("pin-error").innerText = ""; }
function updatePinUI() {
    for (let i = 1; i <= 4; i++) document.getElementById(`pin-${i}`).className = (i <= currentPin.length) ? "dot active" : "dot";
}
function checkLogin() {
    const staff = STAFF_DB[currentPin];
    if (staff) {
        currentStaff = staff;
        document.getElementById("current-staff-name").innerText = `${staff.name}`;
        document.getElementById("btn-admin-manage").className = staff.role === "admin" ? "bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-purple-200" : "hidden";
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("dashboard-screen").classList.remove("hidden");
        clearPin();
        renderTables();
    } else {
        document.getElementById("pin-error").innerText = "รหัสไม่ถูกต้อง";
        setTimeout(clearPin, 800);
    }
}
function logout() {
    currentStaff = null;
    document.getElementById("dashboard-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

// =========================================================
// 4. ฟังก์ชันจัดการโต๊ะ และ สั่งของ
// =========================================================
function renderTables() {
    const normalContainer = document.getElementById("normal-tables-container");
    const vipContainer = document.getElementById("vip-tables-container");
    normalContainer.innerHTML = ""; vipContainer.innerHTML = "";

    TABLES.forEach(table => {
        const tableData = activeTables[table.id];
        const isActive = !!tableData;
        const borderColor = table.type === "VIP" ? "border-yellow-400" : "border-blue-400";
        const gradient = table.type === "VIP" ? "from-yellow-50 to-orange-50" : "from-blue-50 to-cyan-50";

        let totalItemsCount = 0;
        if(isActive && tableData.orders) Object.values(tableData.orders).forEach(o => totalItemsCount += o.qty);

        const cardHTML = `
            <div class="bg-gradient-to-b ${gradient} p-4 rounded-2xl shadow-sm border-t-4 ${borderColor} relative">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-bold text-xl">${table.name}</h3>
                    <span class="text-xs px-2 py-1 rounded-full font-medium ${isActive ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">
                        ${isActive ? 'กำลังเล่น' : 'ว่าง'}
                    </span>
                </div>
                ${isActive 
                    ? `<div class="text-xs text-gray-500 mb-3">
                         <p>⏰ เริ่ม: ${tableData.startTime.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}</p>
                         <p>🛒 สั่งของแล้ว: <span class="font-bold text-blue-600">${totalItemsCount}</span> ชิ้น</p>
                       </div>
                       <div class="flex gap-2">
                           <button onclick="openOrderModal('${table.id}', '${table.name}')" class="flex-1 bg-white border border-blue-500 text-blue-600 font-medium py-2 rounded-xl text-sm">สั่งของ</button>
                           <button onclick="openCheckoutModal('${table.id}', '${table.name}', '${table.type}')" class="flex-1 bg-red-500 text-white font-medium py-2 rounded-xl text-sm">เช็คบิล</button>
                       </div>` 
                    : `<p class="text-sm text-gray-400 mb-4">- ยังไม่มีลูกค้า -</p>
                       <button onclick="startTable('${table.id}')" class="w-full bg-blue-500 text-white font-medium py-2 rounded-xl">เปิดโต๊ะ</button>`
                }
            </div>
        `;
        if (table.type === "NORMAL") normalContainer.innerHTML += cardHTML;
        else vipContainer.innerHTML += cardHTML;
    });
}
function startTable(tableId) { activeTables[tableId] = { startTime: new Date(), orders: {} }; renderTables(); }

// ระบบสั่งของ
function openOrderModal(tableId, tableName) { 
    currentlyOrderingTableId = tableId;
    document.getElementById("order-modal-title").innerText = `สั่งของเข้า ${tableName}`;
    document.getElementById("order-modal").classList.remove("hidden");
    document.getElementById("order-product-list").innerHTML = PRODUCTS.map(p => `
        <button onclick="addItemToTable('${p.id}')" class="border p-2 rounded-xl text-left bg-white shadow-sm">
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
    renderCurrentOrders();
}
function renderCurrentOrders() {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    const items = Object.values(tableOrders);
    if (items.length === 0) { document.getElementById("current-orders-list").innerHTML = "<li class='text-gray-400'>ยังไม่มีรายการ</li>"; return; }
    document.getElementById("current-orders-list").innerHTML = items.map(item => `<li class="flex justify-between items-center bg-white p-2 border rounded"><span>${item.detail.name} <span class="text-xs text-gray-400">(@${item.detail.price})</span></span><span class="font-bold text-blue-600">x${item.qty}</span></li>`).join("");
}

// =========================================================
// 5. จัดการสินค้า (เฉพาะ Admin)
// =========================================================
function openProductManager() { document.getElementById("product-modal").classList.remove("hidden"); renderAdminProductList(); }
function closeProductManager() { document.getElementById("product-modal").classList.add("hidden"); }
function renderAdminProductList() {
    document.getElementById("admin-product-list").innerHTML = PRODUCTS.map(p => `<div class="flex justify-between items-center bg-white border p-2 rounded"><div><span class="font-bold text-sm">${p.name}</span><span class="text-xs text-gray-400 ml-2">(${p.category})</span></div><div class="text-sm font-bold text-purple-600">฿${p.price}</div></div>`).join("");
}
function addNewProduct() {
    const name = document.getElementById("new-p-name").value;
    const price = parseInt(document.getElementById("new-p-price").value);
    const category = document.getElementById("new-p-category").value;
    if (!name || isNaN(price)) { alert("ข้อมูลไม่ถูกต้อง"); return; }
    PRODUCTS.push({ id: 'p' + (PRODUCTS.length + 1), name: name, price: price, category: category });
    document.getElementById("new-p-name").value = ""; document.getElementById("new-p-price").value = "";
    renderAdminProductList();
}

// =========================================================
// 6. ชำระเงิน บันทึกข้อมูล และแจ้งเตือน OneSignal
// =========================================================
function openCheckoutModal(tableId, tableName, tableType) {
    const tableData = activeTables[tableId];
    const msPlayed = Math.abs(new Date() - tableData.startTime);
    let hoursPlayed = msPlayed / 36e5;
    if(hoursPlayed < 0.5) hoursPlayed = 0.5; // ขั้นต่ำครึ่งชั่วโมง
    
    const timeFee = Math.ceil(hoursPlayed * RATES[tableType]);
    let itemsFee = 0;
    
    const receiptItems = [{ name: `ค่าโต๊ะ (${hoursPlayed.toFixed(1)} ชม.)`, qty: 1, total: timeFee }];
    Object.values(tableData.orders).forEach(item => {
        const total = item.detail.price * item.qty;
        itemsFee += total;
        receiptItems.push({ name: item.detail.name, qty: item.qty, total: total });
    });

    const grandTotal = timeFee + itemsFee;
    pendingCheckoutData = { tableId, tableName, hoursPlayed, timeFee, itemsFee, grandTotal, receiptItems };

    document.getElementById("co-table").innerText = tableName;
    document.getElementById("co-time").innerText = hoursPlayed.toFixed(1) + " ชม.";
    document.getElementById("co-fee-table").innerText = timeFee;
    document.getElementById("co-fee-items").innerText = itemsFee;
    document.getElementById("co-total").innerText = grandTotal;
    document.getElementById("checkout-modal").classList.remove("hidden");
}

function closeCheckoutModal() { pendingCheckoutData = null; document.getElementById("checkout-modal").classList.add("hidden"); }

function processPayment(method) {
    const data = pendingCheckoutData;
    
    // สร้างหน้าใบเสร็จ
    document.getElementById("rcpt-table").innerText = data.tableName;
    document.getElementById("rcpt-date").innerText = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    document.getElementById("rcpt-staff").innerText = currentStaff.name;
    document.getElementById("rcpt-method").innerText = method;
    document.getElementById("rcpt-items").innerHTML = data.receiptItems.map(item => `
        <tr class="border-b border-gray-100"><td class="py-1">${item.name}</td><td class="py-1 text-center">${item.qty}</td><td class="py-1 text-right">฿${item.total}</td></tr>
    `).join("");
    document.getElementById("rcpt-total").innerText = data.grandTotal;

    // ระบบ QR Code
    const qrSection = document.getElementById("qr-payment-section");
    if (method === 'เงินโอน') {
        qrSection.classList.remove("hidden"); qrSection.classList.add("flex");
        document.getElementById("qr-total-display").innerText = data.grandTotal;
        document.getElementById("qr-image").src = `https://promptpay.io/${PROMPTPAY_NUMBER}/${data.grandTotal}.png`;
    } else {
        qrSection.classList.remove("flex"); qrSection.classList.add("hidden");
    }

    // ส่งข้อมูลเข้า Firebase 
    db.collection("transactions").add({
        tableId: data.tableId,
        tableName: data.tableName,
        method: method,
        grandTotal: data.grandTotal,
        staffId: currentStaff.id,
        staffName: currentStaff.name,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        items: data.receiptItems
    }).then(() => {
        // ยิง OneSignal
        fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": "Basic " + ONESIGNAL_REST_KEY
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                included_segments: ["Subscribed Users"],
                headings: { "en": "💰 บิลใหม่ - ดำรัส สนุ๊กเกอร์" },
                contents: { "en": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal} | เก็บโดย: ${currentStaff.name} (${method})` }
            })
        });
    });

    closeCheckoutModal();
    document.getElementById("receipt-modal").classList.remove("hidden");
    delete activeTables[data.tableId];
    renderTables();
}

function saveReceiptImage() {
    html2canvas(document.getElementById("receipt-paper"), { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Receipt_${pendingCheckoutData.tableName}_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
}
function closeReceiptModal() { pendingCheckoutData = null; document.getElementById("receipt-modal").classList.add("hidden"); }