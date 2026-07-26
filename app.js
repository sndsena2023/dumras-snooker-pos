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
const PROMPTPAY_NUMBER = "0812345678"; // <--- ⚠️ เปลี่ยนเป็นเบอร์พร้อมเพย์รับเงินของร้าน

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
// 3. ฟังก์ชันตรวจสอบและสร้างข้อมูลพนักงานเริ่มต้น
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

// ตั้งเวลาอัปเดตหน้าจอทุกๆ 1 นาที เพื่อให้เวลาเล่นไหลไปเรื่อยๆ (Real-time Timer)
setInterval(() => {
    if (currentStaff && !document.getElementById("dashboard-screen").classList.contains("hidden")) {
        renderTables();
    }
}, 60000);

// =========================================================
// 4. ระบบ Login & Session (จดจำการล็อกอิน)
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

async function checkLogin() {
    try {
        const querySnapshot = await db.collection("staff").where("pin", "==", currentPin).get();
        if (!querySnapshot.empty) {
            const staffData = querySnapshot.docs[0].data();
            currentStaff = staffData;
            
            // [ใหม่] บันทึกการล็อกอินลงในเครื่อง
            localStorage.setItem("dumras_staff_session", JSON.stringify(staffData));
            
            applyLoginState();
        } else {
            document.getElementById("pin-error").innerText = "รหัส PIN ไม่ถูกต้อง";
            setTimeout(clearPin, 800);
        }
    } catch (error) {
        console.error("Login error:", error);
        document.getElementById("pin-error").innerText = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
        setTimeout(clearPin, 1000);
    }
}

// นำสถานะล็อกอินมาแสดงผล
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

// [ใหม่] โหลดสถานะการล็อกอินทันทีที่เปิดแอป
function restoreSession() {
    const savedStaff = localStorage.getItem("dumras_staff_session");
    if (savedStaff) {
        currentStaff = JSON.parse(savedStaff);
        applyLoginState();
    }
}
restoreSession(); // เรียกใช้ทันที

function logout() {
    currentStaff = null;
    // [ใหม่] ลบข้อมูลล็อกอินออกจากเครื่องเมื่อกดออกระบบ
    localStorage.removeItem("dumras_staff_session");
    
    document.getElementById("dashboard-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

// =========================================================
// 5. ฟังก์ชันจัดการโต๊ะ และ สั่งของ
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

        let totalItemsCount = 0;
        let timeStartString = "";
        let timeElapsedString = "";

        if (isActive) {
            if (tableData.orders) {
                Object.values(tableData.orders).forEach(o => totalItemsCount += o.qty);
            }
            
            const startTime = tableData.startTime;
            timeStartString = startTime.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'});
            
            const now = new Date();
            const diffMs = now - startTime;
            const diffMins = Math.floor(diffMs / 60000);
            const hrs = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            timeElapsedString = `${hrs} ชม. ${mins} นาที`;
        }

        let actionButtons = "";
        if (isActive) {
            if (isAdmin) {
                actionButtons = `<div class="text-center text-sm font-bold text-purple-600 bg-purple-100 py-2 rounded-xl border border-purple-200 shadow-inner">👁️ โหมดดูสถานะ</div>`;
            } else {
                actionButtons = `
                    <div class="flex gap-2">
                        <button onclick="openOrderModal('${table.id}', '${table.name}')" class="flex-1 bg-white border border-blue-500 text-blue-600 font-medium py-2 rounded-xl text-sm hover:bg-blue-50 transition">สั่งของ</button>
                        <button onclick="openCheckoutModal('${table.id}', '${table.name}', '${table.type}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 rounded-xl text-sm shadow-sm transition">เช็คบิล</button>
                    </div>`;
            }
        } else {
            if (isAdmin) {
                actionButtons = `<div class="text-center text-sm text-gray-400 py-2">- โต๊ะว่าง -</div>`;
            } else {
                actionButtons = `<button onclick="startTable('${table.id}')" class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-xl shadow-sm transition">เปิดโต๊ะ</button>`;
            }
        }

        const cardHTML = `
            <div class="bg-gradient-to-b ${gradient} p-4 rounded-2xl shadow-sm border-t-4 ${borderColor} relative">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-bold text-xl">${table.name}</h3>
                    <span class="text-xs px-2 py-1 rounded-full font-medium ${isActive ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}">
                        ${isActive ? 'กำลังเล่น' : 'ว่าง'}
                    </span>
                </div>
                ${isActive 
                    ? `<div class="text-xs text-gray-600 mb-3 space-y-1">
                         <p>⏰ เริ่มเล่น: <span class="font-bold">${timeStartString}</span></p>
                         <p>⏱️ เวลาที่เล่น: <span class="font-bold text-blue-600">${timeElapsedString}</span></p>
                         <p>🛒 สั่งสินค้า: <span class="font-bold">${totalItemsCount}</span> ชิ้น</p>
                       </div>
                       ${actionButtons}` 
                    : `<p class="text-sm text-gray-400 mb-4 text-center">- ยังไม่มีลูกค้า -</p>
                       ${actionButtons}`
                }
            </div>
        `;

        if (table.type === "NORMAL") normalContainer.innerHTML += cardHTML;
        else vipContainer.innerHTML += cardHTML;
    });
}

function startTable(tableId) { 
    activeTables[tableId] = { startTime: new Date(), orders: {} }; 
    saveDataLocally(); 
    renderTables(); 
}

function openOrderModal(tableId, tableName) { 
    currentlyOrderingTableId = tableId;
    document.getElementById("order-modal-title").innerText = `สั่งของเข้า ${tableName}`;
    document.getElementById("order-modal").classList.remove("hidden");
    document.getElementById("order-product-list").innerHTML = PRODUCTS.map(p => `
        <button onclick="addItemToTable('${p.id}')" class="border p-2 rounded-xl text-left bg-white shadow-sm hover:border-blue-500 transition">
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
    saveDataLocally();
    renderCurrentOrders();
}

function renderCurrentOrders() {
    const tableOrders = activeTables[currentlyOrderingTableId].orders;
    const items = Object.values(tableOrders);
    if (items.length === 0) { document.getElementById("current-orders-list").innerHTML = "<li class='text-gray-400'>ยังไม่มีรายการ</li>"; return; }
    document.getElementById("current-orders-list").innerHTML = items.map(item => `<li class="flex justify-between items-center bg-white p-2 border rounded"><span>${item.detail.name} <span class="text-xs text-gray-400">(@${item.detail.price})</span></span><span class="font-bold text-blue-600">x${item.qty}</span></li>`).join("");
}

// =========================================================
// 6. จัดการสินค้า และ จัดการพนักงาน (Admin Panel)
// =========================================================
function switchAdminTab(tab) {
    const prodSec = document.getElementById("admin-section-products");
    const staffSec = document.getElementById("admin-section-staff");
    const prodBtn = document.getElementById("tab-btn-products");
    const staffBtn = document.getElementById("tab-btn-staff");

    if(tab === 'products') {
        prodSec.classList.remove("hidden"); staffSec.classList.add("hidden");
        prodBtn.className = "flex-1 pb-2 font-bold text-purple-600 border-b-2 border-purple-600";
        staffBtn.className = "flex-1 pb-2 font-bold text-gray-400";
    } else {
        prodSec.classList.add("hidden"); staffSec.classList.remove("hidden");
        staffBtn.className = "flex-1 pb-2 font-bold text-blue-600 border-b-2 border-blue-600";
        prodBtn.className = "flex-1 pb-2 font-bold text-gray-400";
        renderAdminStaffList();
    }
}

function openProductManager() { 
    document.getElementById("product-modal").classList.remove("hidden"); 
    renderAdminProductList(); 
}
function closeProductManager() { document.getElementById("product-modal").classList.add("hidden"); }

function renderAdminProductList() {
    document.getElementById("admin-product-list").innerHTML = PRODUCTS.map(p => `
        <div class="flex justify-between items-center bg-white border p-2 rounded">
            <div><span class="font-bold text-sm">${p.name}</span><span class="text-xs text-gray-400 ml-2">(${p.category})</span></div>
            <div class="text-sm font-bold text-purple-600">฿${p.price}</div>
        </div>
    `).join("");
}

function addNewProduct() {
    const name = document.getElementById("new-p-name").value;
    const price = parseInt(document.getElementById("new-p-price").value);
    const category = document.getElementById("new-p-category").value;
    if (!name || isNaN(price)) { alert("ข้อมูลไม่ถูกต้อง"); return; }
    PRODUCTS.push({ id: 'p' + (PRODUCTS.length + 1), name: name, price: price, category: category });
    saveDataLocally(); 
    document.getElementById("new-p-name").value = ""; document.getElementById("new-p-price").value = "";
    renderAdminProductList();
}

async function renderAdminStaffList() {
    const listDiv = document.getElementById("admin-staff-list");
    listDiv.innerHTML = '<p class="text-gray-400 text-sm">กำลังโหลด...</p>';
    try {
        const snapshot = await db.collection("staff").get();
        let html = "";
        snapshot.forEach(doc => {
            const s = doc.data();
            const pinId = doc.id;
            const deleteButton = pinId !== "9999" 
                ? `<button onclick="deleteStaff('${pinId}')" class="bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1 rounded-lg text-xs font-medium transition">ลบ</button>` 
                : `<span class="text-[10px] text-gray-400 px-2 py-1">(บัญชีหลัก)</span>`;

            html += `
                <div class="flex justify-between items-center bg-white border p-2.5 rounded-xl shadow-sm">
                    <div>
                        <span class="font-bold text-sm text-gray-800">${s.name}</span>
                        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded ml-2">PIN: ${s.pin}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold px-2.5 py-1 rounded-full ${s.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}">
                            ${s.role === 'admin' ? 'เจ้าของร้าน' : 'พนักงาน'}
                        </span>
                        ${deleteButton}
                    </div>
                </div>
            `;
        });
        listDiv.innerHTML = html;
    } catch(e) {
        listDiv.innerHTML = '<p class="text-red-500 text-sm">โหลดข้อมูลไม่สำเร็จ</p>';
    }
}

async function addNewStaff() {
    const name = document.getElementById("new-s-name").value.trim();
    const pin = document.getElementById("new-s-pin").value.trim();
    const role = document.getElementById("new-s-role").value;
    if (!name || pin.length !== 4 || isNaN(pin)) { alert("กรุณากรอกชื่อและรหัส PIN 4 หลักให้ถูกต้อง"); return; }

    try {
        const checkPin = await db.collection("staff").where("pin", "==", pin).get();
        if(!checkPin.empty) { alert("รหัส PIN นี้มีผู้ใช้งานแล้ว กรุณาใช้รหัสอื่น"); return; }

        const staffId = 'S' + Math.floor(10 + Math.random() * 90);
        await db.collection("staff").doc(pin).set({ id: staffId, name: name, pin: pin, role: role });
        document.getElementById("new-s-name").value = ""; document.getElementById("new-s-pin").value = "";
        alert("เพิ่มพนักงานสำเร็จ!");
        renderAdminStaffList();
    } catch(e) { alert("เกิดข้อผิดพลาดในการบันทึก"); }
}

async function deleteStaff(pin) {
    if(confirm("คุณต้องการลบพนักงานคนนี้ออกจากระบบใช่หรือไม่?")) {
        try {
            await db.collection("staff").doc(pin).delete();
            alert("ลบพนักงานสำเร็จ!");
            renderAdminStaffList();
        } catch(e) { alert("เกิดข้อผิดพลาดในการลบพนักงาน"); }
    }
}

// =========================================================
// 7. ชำระเงิน บันทึกข้อมูล และแจ้งเตือน OneSignal
// =========================================================
function openCheckoutModal(tableId, tableName, tableType) {
    const tableData = activeTables[tableId];
    const msPlayed = Math.abs(new Date() - tableData.startTime);
    let hoursPlayed = msPlayed / 36e5;
    if(hoursPlayed < 0.1) hoursPlayed = 1; 
    
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
    
    document.getElementById("rcpt-table").innerText = data.tableName;
    document.getElementById("rcpt-date").innerText = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    document.getElementById("rcpt-staff").innerText = currentStaff.name;
    document.getElementById("rcpt-method").innerText = method;
    document.getElementById("rcpt-items").innerHTML = data.receiptItems.map(item => `
        <tr class="border-b border-gray-100"><td class="py-1">${item.name}</td><td class="py-1 text-center">${item.qty}</td><td class="py-1 text-right">฿${item.total}</td></tr>
    `).join("");
    document.getElementById("rcpt-total").innerText = data.grandTotal;

    const qrSection = document.getElementById("qr-payment-section");
    if (method === 'เงินโอน') {
        qrSection.classList.remove("hidden"); qrSection.classList.add("flex");
        document.getElementById("qr-total-display").innerText = data.grandTotal;
        document.getElementById("qr-image").src = `https://promptpay.io/${PROMPTPAY_NUMBER}/${data.grandTotal}.png`;
    } else {
        qrSection.classList.remove("flex"); qrSection.classList.add("hidden");
    }

    db.collection("transactions").add({
        tableId: data.tableId,
        tableName: data.tableName,
        method: method,
        timeFee: data.timeFee,
        itemsFee: data.itemsFee,
        grandTotal: data.grandTotal,
        staffId: currentStaff.id,
        staffName: currentStaff.name,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        items: data.receiptItems
    }).then(() => {
        fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": "Basic " + ONESIGNAL_REST_KEY
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                included_segments: ["Subscribed Users"],
                headings: { "en": "💰 บิลใหม่ - ดำรัส สนุ๊กเกอร์", "th": "💰 บิลใหม่ - ดำรัส สนุ๊กเกอร์" },
                contents: { "en": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal} | เก็บโดย: ${currentStaff.name} (${method})`, "th": `โต๊ะ ${data.tableName} | ยอด: ฿${data.grandTotal} | เก็บโดย: ${currentStaff.name} (${method})` }
            })
        });
    });

    closeCheckoutModal();
    document.getElementById("receipt-modal").classList.remove("hidden");
    
    delete activeTables[data.tableId];
    saveDataLocally();
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

// =========================================================
// 8. ระบบรายงานยอดขาย (เฉพาะ Admin)
// =========================================================
function openReportModal() {
    document.getElementById("report-modal").classList.remove("hidden");
    document.getElementById("report-content").innerHTML = '<p class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</p>';
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    db.collection("transactions")
      .where("timestamp", ">=", startOfToday)
      .orderBy("timestamp", "desc")
      .get()
      .then((querySnapshot) => {
          let totalGrand = 0, totalCash = 0, totalTransfer = 0;
          let totalTable = 0, totalProduct = 0;
          let billsHtml = '';

          querySnapshot.forEach((doc) => {
              const data = doc.data();
              const gTotal = data.grandTotal || 0;
              
              totalGrand += gTotal;
              
              if(data.method === 'เงินสด') totalCash += gTotal;
              if(data.method === 'เงินโอน') totalTransfer += gTotal;
              
              let tFee = data.timeFee || 0;
              let pFee = data.itemsFee || 0;
              if (tFee === 0 && pFee === 0 && data.items && data.items.length > 0) {
                  tFee = data.items[0].total || 0;
                  pFee = gTotal - tFee;
              }
              
              totalTable += tFee;
              totalProduct += pFee;
              
              const dateTimeString = data.timestamp ? data.timestamp.toDate().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
              
              billsHtml += `
                <div class="border-b border-gray-100 py-3 text-sm">
                    <div class="flex justify-between items-center mb-1">
                        <div class="font-bold text-gray-700">${data.tableName}</div>
                        <div class="font-bold text-gray-800 text-lg">฿${gTotal}</div>
                    </div>
                    <div class="flex justify-between items-center text-xs text-gray-500 mb-2">
                        <div>📅 ${dateTimeString} | 👤 ${data.staffName}</div>
                        <div class="font-bold px-2 py-0.5 rounded-full ${data.method === 'เงินสด' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}">${data.method}</div>
                    </div>
                    <div class="flex gap-4 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                        <span class="flex-1">🎱 ค่าโต๊ะ: <span class="font-bold text-gray-700">฿${tFee}</span></span>
                        <span class="flex-1">🍔 ค่าสินค้า: <span class="font-bold text-gray-700">฿${pFee}</span></span>
                    </div>
                </div>
              `;
          });

          if(querySnapshot.empty) {
              billsHtml = '<p class="text-center text-gray-400 py-6">ยังไม่มีรายการขายในวันนี้</p>';
          }

          document.getElementById("report-content").innerHTML = `
            <div class="bg-gray-800 text-white p-4 rounded-xl text-center mb-4 shadow-md">
                <div class="text-xs text-gray-300 mb-1">💰 ยอดขายรวมทั้งสิ้น (วันนี้)</div>
                <div class="text-4xl font-bold text-yellow-400">฿${totalGrand}</div>
            </div>
            
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-green-50 p-3 rounded-xl border border-green-200 text-center shadow-sm">
                    <div class="text-xs text-green-600 font-bold mb-1">💵 เงินสด</div>
                    <div class="text-lg font-bold text-green-700">฿${totalCash}</div>
                </div>
                <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 text-center shadow-sm">
                    <div class="text-xs text-blue-600 font-bold mb-1">📱 เงินโอน</div>
                    <div class="text-lg font-bold text-blue-700">฿${totalTransfer}</div>
                </div>
                <div class="bg-orange-50 p-3 rounded-xl border border-orange-200 text-center shadow-sm">
                    <div class="text-xs text-orange-600 font-bold mb-1">🎱 รวมค่าโต๊ะ</div>
                    <div class="text-lg font-bold text-orange-700">฿${totalTable}</div>
                </div>
                <div class="bg-purple-50 p-3 rounded-xl border border-purple-200 text-center shadow-sm">
                    <div class="text-xs text-purple-600 font-bold mb-1">🍔 รวมค่าสินค้า</div>
                    <div class="text-lg font-bold text-purple-700">฿${totalProduct}</div>
                </div>
            </div>
            
            <h3 class="font-bold text-gray-700 mb-2 border-b pb-2 mt-4">📋 รายการบิลวันนี้:</h3>
            <div class="space-y-1">${billsHtml}</div>
          `;
      })
      .catch((error) => {
          console.error("Error: ", error);
          document.getElementById("report-content").innerHTML = '<p class="text-center text-red-500 py-10">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
      });
}

function closeReportModal() {
    document.getElementById("report-modal").classList.add("hidden");
}
