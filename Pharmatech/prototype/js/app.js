const STORAGE_KEY = "poastock-prototype-v1";

function sampleTimestamp(daysAgo, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const initialState = {
  products: [
    { id: "p1", name: "Paracetamol 500mg", sku: "MED-001", unit: "Box of 100", price: 420, stock: 18, reorderAt: 20 },
    { id: "p2", name: "Amoxicillin 500mg", sku: "MED-002", unit: "Pack of 21", price: 680, stock: 8, reorderAt: 15 },
    { id: "p3", name: "ORS sachets", sku: "MED-003", unit: "Box of 100", price: 950, stock: 42, reorderAt: 12 },
    { id: "p4", name: "Cetirizine 10mg", sku: "MED-004", unit: "Box of 100", price: 520, stock: 6, reorderAt: 10 },
    { id: "p5", name: "Vitamin C 500mg", sku: "MED-005", unit: "Bottle of 100", price: 780, stock: 30, reorderAt: 10 },
    { id: "p6", name: "Omeprazole 20mg", sku: "MED-006", unit: "Pack of 28", price: 560, stock: 0, reorderAt: 8 }
  ],
  customers: [
    { id: "c1", name: "Greenview Pharmacy", contact: "Mary Wanjiku", phone: "0712 345 678", location: "Westlands, Nairobi" },
    { id: "c2", name: "CarePoint Chemist", contact: "Peter Otieno", phone: "0722 456 789", location: "Kilimani, Nairobi" },
    { id: "c3", name: "MediPlus Pharmacy", contact: "Sarah Njeri", phone: "0701 234 567", location: "Thika Road, Nairobi" },
    { id: "c4", name: "Afya Bora Chemist", contact: "David Kamau", phone: "0733 567 890", location: "Ngong Road, Nairobi" }
  ],
  orders: [
    { id: "PS-1048", customerId: "c1", items: [{ productId: "p1", quantity: 4 }, { productId: "p3", quantity: 2 }], status: "awaiting", paymentStatus: "Pending", createdAt: sampleTimestamp(0, 9, 35), notes: "" },
    { id: "PS-1047", customerId: "c2", items: [{ productId: "p2", quantity: 3 }, { productId: "p5", quantity: 2 }], status: "paid", paymentStatus: "Paid · QLM82A4K", createdAt: sampleTimestamp(0, 8, 50), notes: "" },
    { id: "PS-1046", customerId: "c3", items: [{ productId: "p1", quantity: 2 }, { productId: "p4", quantity: 1 }], status: "dispatched", paymentStatus: "Paid · QLM71B2N", createdAt: sampleTimestamp(0, 8, 15), notes: "Deliver before noon" },
    { id: "PS-1045", customerId: "c4", items: [{ productId: "p3", quantity: 1 }, { productId: "p5", quantity: 3 }], status: "delivered", paymentStatus: "Paid · QLM66X9P", createdAt: sampleTimestamp(1, 15, 10), notes: "" },
    { id: "PS-1044", customerId: "c1", items: [{ productId: "p2", quantity: 2 }], status: "pending", paymentStatus: "Not requested", createdAt: sampleTimestamp(1, 14, 40), notes: "" }
  ]
};

let state = loadState();
let currentOrderFilter = "all";
let paymentOrderId = null;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.customers) || !Array.isArray(parsed.orders)) {
      throw new Error("Saved prototype data has an invalid shape.");
    }
    return parsed;
  } catch (error) {
    console.error("Unable to load saved PoaStock data:", error);
    return structuredClone(initialState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Unable to save PoaStock data:", error);
    showToast("Could not save changes in this browser.", true);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(amount) {
  return `KSh ${Number(amount || 0).toLocaleString("en-KE")}`;
}

function customerFor(id) {
  return state.customers.find((customer) => customer.id === id);
}

function productFor(id) {
  return state.products.find((product) => product.id === id);
}

function orderTotal(order) {
  return order.items.reduce((total, item) => total + (productFor(item.productId)?.price || 0) * item.quantity, 0);
}

function orderItemCount(order) {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

function statusLabel(status) {
  return ({ pending: "New", awaiting: "Awaiting payment", paid: "Paid", dispatched: "Dispatched", delivered: "Delivered" })[status] || status;
}

function statusBadge(status) {
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

function paymentLabel(order) {
  return escapeHtml(order.paymentStatus || "Not requested");
}

function timestampLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  document.getElementById("toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3300);
}

function renderDashboard() {
  const today = new Date().toDateString();
  const todayOrders = state.orders.filter((order) => new Date(order.createdAt).toDateString() === today);
  const activeOrders = todayOrders.filter((order) => order.status !== "pending");
  document.getElementById("stat-orders").textContent = todayOrders.length;
  document.getElementById("stat-sales").textContent = money(activeOrders.reduce((total, order) => total + orderTotal(order), 0));
  document.getElementById("stat-unpaid").textContent = todayOrders.filter((order) => order.status === "awaiting").length;
  document.getElementById("stat-low-stock").textContent = state.products.filter((product) => product.stock <= product.reorderAt).length;
  document.getElementById("stat-pending").textContent = `${state.orders.filter((order) => order.status === "pending").length} awaiting confirmation`;
  document.getElementById("nav-order-count").textContent = state.orders.filter((order) => order.status === "pending" || order.status === "awaiting").length;
  document.getElementById("workflow-new").textContent = state.orders.filter((order) => order.status === "pending").length;
  document.getElementById("workflow-payment").textContent = state.orders.filter((order) => order.status === "awaiting").length;
  document.getElementById("workflow-paid").textContent = state.orders.filter((order) => order.status === "paid").length;
  document.getElementById("workflow-delivery").textContent = state.orders.filter((order) => order.status === "dispatched").length;
  const recent = [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  document.getElementById("recent-orders-body").innerHTML = recent.length ? recent.map((order) => {
    const customer = customerFor(order.customerId);
    return `<tr><td><span class="order-link">${escapeHtml(order.id)}</span><div class="sub-cell">${timestampLabel(order.createdAt)}</div></td><td class="customer-cell">${escapeHtml(customer?.name || "Unknown pharmacy")}</td><td>${orderItemCount(order)} units</td><td>${money(orderTotal(order))}</td><td>${statusBadge(order.status)}</td><td><button class="row-action" data-order-action="${escapeHtml(order.id)}" aria-label="Order actions">···</button></td></tr>`;
  }).join("") : `<tr><td colspan="6">No orders yet.</td></tr>`;
  const lowStock = state.products.filter((product) => product.stock <= product.reorderAt).sort((a, b) => a.stock - b.stock).slice(0, 5);
  document.getElementById("stock-watch-list").innerHTML = lowStock.length ? lowStock.map((product) => `<div class="stock-row"><div><div class="stock-name">${escapeHtml(product.name)}</div><div class="stock-detail">${escapeHtml(product.sku)} · Reorder at ${product.reorderAt}</div></div><div class="stock-quantity ${product.stock === 0 ? "stock-low" : ""}">${product.stock === 0 ? "Out of stock" : `${product.stock} left`}</div></div>`).join("") : `<div class="stock-row"><div class="stock-name">Stock levels look good</div></div>`;
}

function renderOrders() {
  const query = document.getElementById("order-search").value.trim().toLowerCase();
  const filtered = [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((order) => {
    const customer = customerFor(order.customerId);
    const matchesFilter = currentOrderFilter === "all" || order.status === currentOrderFilter;
    return matchesFilter && (`${order.id} ${customer?.name || ""} ${customer?.phone || ""}`).toLowerCase().includes(query);
  });
  document.getElementById("orders-body").innerHTML = filtered.map((order) => {
    const customer = customerFor(order.customerId);
    return `<tr><td><span class="order-link">${escapeHtml(order.id)}</span><div class="sub-cell">${timestampLabel(order.createdAt)}</div></td><td class="customer-cell">${escapeHtml(customer?.name || "Unknown pharmacy")}<div class="sub-cell">${escapeHtml(customer?.phone || "")}</div></td><td>${orderItemCount(order)} units</td><td>${money(orderTotal(order))}</td><td>${paymentLabel(order)}</td><td>${statusBadge(order.status)}</td><td><button class="row-action" data-order-action="${escapeHtml(order.id)}" aria-label="Order actions">···</button></td></tr>`;
  }).join("");
  document.getElementById("orders-empty").classList.toggle("hidden", filtered.length > 0);
}

function renderInventory() {
  const query = document.getElementById("product-search").value.trim().toLowerCase();
  const products = state.products.filter((product) => `${product.name} ${product.sku} ${product.unit}`.toLowerCase().includes(query));
  document.getElementById("inventory-total").textContent = state.products.length;
  document.getElementById("inventory-low").textContent = state.products.filter((product) => product.stock > 0 && product.stock <= product.reorderAt).length;
  document.getElementById("inventory-out").textContent = state.products.filter((product) => product.stock === 0).length;
  document.getElementById("inventory-body").innerHTML = products.map((product) => {
    const stockStatus = product.stock === 0 ? `<span class="badge badge-awaiting">Out of stock</span>` : product.stock <= product.reorderAt ? `<span class="badge badge-pending">Low stock</span>` : `<span class="badge badge-paid">In stock</span>`;
    return `<tr><td class="product-name">${escapeHtml(product.name)}<div class="product-sku">${escapeHtml(product.sku)}</div></td><td>${escapeHtml(product.sku)}</td><td>${escapeHtml(product.unit)}</td><td>${money(product.price)}</td><td class="${product.stock <= product.reorderAt ? "quantity-alert" : ""}">${product.stock}</td><td>${product.reorderAt}</td><td>${stockStatus}</td></tr>`;
  }).join("");
  document.getElementById("inventory-empty").classList.toggle("hidden", products.length > 0);
}

function renderCustomers() {
  const query = document.getElementById("customer-search").value.trim().toLowerCase();
  const customers = state.customers.filter((customer) => `${customer.name} ${customer.contact} ${customer.phone} ${customer.location}`.toLowerCase().includes(query));
  document.getElementById("customers-body").innerHTML = customers.map((customer) => {
    const orders = state.orders.filter((order) => order.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return `<tr><td class="customer-cell">${escapeHtml(customer.name)}</td><td>${escapeHtml(customer.contact)}</td><td>${escapeHtml(customer.phone)}</td><td>${escapeHtml(customer.location)}</td><td>${orders.length}</td><td>${orders.length ? timestampLabel(orders[0].createdAt) : "—"}</td></tr>`;
  }).join("");
  document.getElementById("customers-empty").classList.toggle("hidden", customers.length > 0);
}

function renderAll() {
  renderDashboard();
  renderOrders();
  renderInventory();
  renderCustomers();
}

function showPage(name) {
  document.querySelectorAll(".page-view").forEach((page) => page.classList.toggle("hidden", page.id !== `${name}-page`));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === name));
  document.getElementById("breadcrumb-current").textContent = name[0].toUpperCase() + name.slice(1);
  document.getElementById("sidebar").classList.remove("open");
}

function openOrderModal() {
  if (!state.customers.length || !state.products.length) {
    showToast("Add at least one pharmacy and product first.", true);
    return;
  }
  document.getElementById("order-customer").innerHTML = state.customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)} · ${escapeHtml(customer.location)}</option>`).join("");
  document.getElementById("order-items").innerHTML = "";
  addOrderItemRow();
  document.getElementById("order-notes").value = "";
  document.getElementById("order-modal").showModal();
}

function addOrderItemRow() {
  const container = document.getElementById("order-items");
  const row = document.createElement("div");
  row.className = "order-item-row";
  row.innerHTML = `<select class="item-select" aria-label="Product">${state.products.map((product) => `<option value="${escapeHtml(product.id)}" ${product.stock === 0 ? "disabled" : ""}>${escapeHtml(product.name)} · ${money(product.price)}${product.stock === 0 ? " · out of stock" : ""}</option>`).join("")}</select><input class="item-qty" aria-label="Quantity" type="number" min="1" step="1" value="1" required><button type="button" class="item-remove" aria-label="Remove item">×</button>`;
  row.querySelector(".item-select").addEventListener("change", updateOrderTotal);
  row.querySelector(".item-qty").addEventListener("input", updateOrderTotal);
  row.querySelector(".item-remove").addEventListener("click", () => {
    if (container.children.length > 1) row.remove();
    updateOrderTotal();
  });
  container.append(row);
  updateOrderTotal();
}

function updateOrderTotal() {
  const total = [...document.querySelectorAll(".order-item-row")].reduce((sum, row) => {
    const product = productFor(row.querySelector(".item-select").value);
    return sum + (product?.price || 0) * Number(row.querySelector(".item-qty").value || 0);
  }, 0);
  document.getElementById("order-total").textContent = money(total);
}

function createOrder(event) {
  event.preventDefault();
  const rows = [...document.querySelectorAll(".order-item-row")];
  const items = rows.map((row) => ({ productId: row.querySelector(".item-select").value, quantity: Number(row.querySelector(".item-qty").value) }));
  if (!items.length || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
    showToast("Enter a valid quantity for each product.", true);
    return;
  }
  const shortage = items.find((item) => productFor(item.productId).stock < item.quantity);
  if (shortage) {
    showToast(`Not enough stock for ${productFor(shortage.productId).name}.`, true);
    return;
  }
  const orderNumber = Math.max(1048, ...state.orders.map((order) => Number(order.id.slice(3)) || 0)) + 1;
  state.orders.unshift({
    id: `PS-${orderNumber}`,
    customerId: document.getElementById("order-customer").value,
    items,
    status: "pending",
    paymentStatus: "Not requested",
    createdAt: new Date().toISOString(),
    notes: document.getElementById("order-notes").value.trim()
  });
  saveState();
  document.getElementById("order-modal").close();
  renderAll();
  showPage("orders");
  showToast(`Order PS-${orderNumber} created. Confirm stock before requesting payment.`);
}

function findOrder(id) {
  return state.orders.find((order) => order.id === id);
}

function orderActions(orderId) {
  const order = findOrder(orderId);
  if (!order) return;
  if (order.status === "pending") {
    if (!window.confirm(`Confirm order ${order.id}? Check availability before confirming.`)) return;
    order.status = "awaiting";
    order.paymentStatus = "Pending";
    saveState();
    renderAll();
    showToast(`${order.id} confirmed. Request payment when the pharmacy is ready.`);
    return;
  }
  if (order.status === "awaiting") {
    const customer = customerFor(order.customerId);
    paymentOrderId = order.id;
    document.getElementById("payment-amount").textContent = money(orderTotal(order));
    document.getElementById("payment-phone").value = customer?.phone.replace(/\s/g, "") || "";
    document.getElementById("payment-modal").showModal();
    return;
  }
  if (order.status === "paid") {
    if (!window.confirm(`Mark ${order.id} as dispatched?`)) return;
    order.status = "dispatched";
    saveState();
    renderAll();
    showToast(`${order.id} marked as dispatched.`);
    return;
  }
  if (order.status === "dispatched") {
    if (!window.confirm(`Confirm ${order.id} was delivered?`)) return;
    order.status = "delivered";
    saveState();
    renderAll();
    showToast(`${order.id} marked as delivered.`);
    return;
  }
  showToast(`${order.id} is complete.`);
}

function simulatePayment(event) {
  event.preventDefault();
  const order = findOrder(paymentOrderId);
  if (!order || order.status !== "awaiting") {
    showToast("This order is no longer awaiting payment.", true);
    document.getElementById("payment-modal").close();
    return;
  }
  const receipt = `DEMO${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  order.status = "paid";
  order.paymentStatus = `Paid · ${receipt}`;
  order.paidPhone = document.getElementById("payment-phone").value.trim();
  order.paidAt = new Date().toISOString();
  saveState();
  document.getElementById("payment-modal").close();
  renderAll();
  showToast(`Demo payment recorded for ${order.id}. No money was moved.`);
  paymentOrderId = null;
}

function createProduct(event) {
  event.preventDefault();
  const sku = document.getElementById("product-sku").value.trim();
  if (state.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) {
    showToast("That SKU is already in the product list.", true);
    return;
  }
  state.products.push({
    id: `p${Date.now()}`,
    name: document.getElementById("product-name").value.trim(),
    sku,
    unit: document.getElementById("product-unit").value.trim(),
    price: Number(document.getElementById("product-price").value),
    stock: Number(document.getElementById("product-stock").value),
    reorderAt: Number(document.getElementById("product-reorder").value)
  });
  saveState();
  document.getElementById("product-modal").close();
  document.getElementById("product-form").reset();
  renderAll();
  showToast("Product added to the catalogue.");
}

function createCustomer(event) {
  event.preventDefault();
  const phone = document.getElementById("customer-phone").value.trim();
  state.customers.push({
    id: `c${Date.now()}`,
    name: document.getElementById("customer-name").value.trim(),
    contact: document.getElementById("customer-contact").value.trim(),
    phone,
    location: document.getElementById("customer-location").value.trim()
  });
  saveState();
  document.getElementById("customer-modal").close();
  document.getElementById("customer-form").reset();
  renderAll();
  showToast("Pharmacy customer added.");
}

document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
document.querySelectorAll("[data-action='new-order']").forEach((button) => button.addEventListener("click", openOrderModal));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("[data-workflow]").forEach((button) => button.addEventListener("click", () => {
  currentOrderFilter = button.dataset.workflow;
  document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.filter === currentOrderFilter));
  showPage("orders");
  renderOrders();
}));
document.getElementById("order-filters").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-filter]");
  if (!tab) return;
  currentOrderFilter = tab.dataset.filter;
  document.querySelectorAll(".filter-tab").forEach((item) => item.classList.toggle("active", item === tab));
  renderOrders();
});
document.getElementById("orders-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-action]");
  if (button) orderActions(button.dataset.orderAction);
});
document.getElementById("recent-orders-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-action]");
  if (button) orderActions(button.dataset.orderAction);
});
document.getElementById("order-search").addEventListener("input", renderOrders);
document.getElementById("product-search").addEventListener("input", renderInventory);
document.getElementById("customer-search").addEventListener("input", renderCustomers);
document.getElementById("order-form").addEventListener("submit", createOrder);
document.getElementById("payment-form").addEventListener("submit", simulatePayment);
document.getElementById("product-form").addEventListener("submit", createProduct);
document.getElementById("customer-form").addEventListener("submit", createCustomer);
document.getElementById("add-order-item").addEventListener("click", addOrderItemRow);
document.getElementById("add-product-button").addEventListener("click", () => document.getElementById("product-modal").showModal());
document.getElementById("add-customer-button").addEventListener("click", () => document.getElementById("customer-modal").showModal());
document.getElementById("mobile-menu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("help-button").addEventListener("click", () => showToast("Create an order, confirm it, simulate an M-Pesa payment, then update delivery status."));
document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
document.getElementById("today-eyebrow").textContent = new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

renderAll();
