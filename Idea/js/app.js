const STORAGE_KEY = "sokokisii-demo-v1";

const categories = [
  { id: "all", label: "Everything", count: "See it all", icon: "✳" },
  { id: "fashion", label: "Fashion", count: "Wear your style", icon: "👕" },
  { id: "electronics", label: "Phones & tech", count: "Everyday tech", icon: "🎧" },
  { id: "beauty", label: "Beauty & care", count: "Feel good finds", icon: "🧴" },
  { id: "home", label: "Home & kitchen", count: "Make it yours", icon: "🏺" },
  { id: "food", label: "Food & produce", count: "Fresh & local", icon: "🍌" }
];

const shops = [
  { id: "all", name: "All local shops", whatsapp: "" },
  { id: "mama-joy", name: "Mama Joy's Shop", whatsapp: "" },
  { id: "simba", name: "Simba Electronics", whatsapp: "" },
  { id: "afya", name: "Afya Beauty Mart", whatsapp: "" },
  { id: "market-fresh", name: "Market Fresh Kisii", whatsapp: "" }
];

const products = [
  { id: "sku-101", name: "Everyday Canvas Tote", description: "Sturdy, roomy & ready to go", price: 850, category: "fashion", shopId: "mama-joy", shop: "Mama Joy's Shop", icon: "👜", color: "color-orange", tag: "LOCAL FAVOURITE", visual: "woven tote" },
  { id: "sku-102", name: "Wireless Earbuds", description: "Clear sound for the commute", price: 1800, category: "electronics", shopId: "simba", shop: "Simba Electronics", icon: "🎧", color: "color-green", tag: "GOOD FIND", visual: "wireless earbuds" },
  { id: "sku-103", name: "Shea Body Butter", description: "Nourishing everyday moisture", price: 650, category: "beauty", shopId: "afya", shop: "Afya Beauty Mart", icon: "🧴", color: "color-pink", tag: "SELLER PICK", visual: "body butter" },
  { id: "sku-104", name: "Glazed Ceramic Mug", description: "Hand-finished, made for slow mornings", price: 500, category: "home", shopId: "mama-joy", shop: "Mama Joy's Shop", icon: "☕", color: "color-blue", tag: "UNIQUE FIND", visual: "ceramic mug" },
  { id: "sku-105", name: "Kisii Market Bananas", description: "A bunch of fresh, ripe bananas", price: 120, category: "food", shopId: "market-fresh", shop: "Market Fresh Kisii", icon: "🍌", color: "color-yellow", tag: "FRESH TODAY", visual: "bananas" },
  { id: "sku-106", name: "Classic Cotton Shirt", description: "Easy fit for everyday wear", price: 1200, category: "fashion", shopId: "mama-joy", shop: "Mama Joy's Shop", icon: "👕", color: "color-purple", tag: "EVERYDAY PICK", visual: "cotton shirt" },
  { id: "sku-107", name: "Fast Charge Power Bank", description: "Stay topped up while out and about", price: 2200, category: "electronics", shopId: "simba", shop: "Simba Electronics", icon: "🔋", color: "color-blue", tag: "USEFUL FIND", visual: "power bank" },
  { id: "sku-108", name: "Gentle Face Cleanser", description: "A fresh start to your routine", price: 780, category: "beauty", shopId: "afya", shop: "Afya Beauty Mart", icon: "🧼", color: "color-green", tag: "SELLER PICK", visual: "face cleanser" },
  { id: "sku-109", name: "Woven Table Basket", description: "A little texture for your home", price: 950, category: "home", shopId: "mama-joy", shop: "Mama Joy's Shop", icon: "🧺", color: "color-orange", tag: "LOCAL CRAFT", visual: "woven basket" },
  { id: "sku-110", name: "Sweet Tree Tomatoes", description: "Locally sourced market produce", price: 100, category: "food", shopId: "market-fresh", shop: "Market Fresh Kisii", icon: "🍅", color: "color-pink", tag: "FRESH TODAY", visual: "tomatoes" },
  { id: "sku-111", name: "Everyday Phone Case", description: "A simple case for daily knocks", price: 450, category: "electronics", shopId: "simba", shop: "Simba Electronics", icon: "📱", color: "color-purple", tag: "GOOD FIND", visual: "phone case" },
  { id: "sku-112", name: "Botanical Hair Oil", description: "Light oil for a care-day ritual", price: 550, category: "beauty", shopId: "afya", shop: "Afya Beauty Mart", icon: "🫙", color: "color-yellow", tag: "SELLER PICK", visual: "hair oil" }
];

let selectedCategory = "all";
let selectedShop = "all";
let searchText = "";
let favourites = new Set();
let cart = loadCart();

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Array.isArray(value.cart) ? value.cart.filter((line) =>
      products.some((product) => product.id === line.productId) &&
      Number.isInteger(line.quantity) && line.quantity > 0
    ) : [];
  } catch (error) {
    console.error("Could not read saved demo basket:", error);
    return [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart }));
  } catch (error) {
    console.error("Could not save demo basket:", error);
    toast("Could not save your basket in this browser.");
  }
}

function safe(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(value) {
  return `KSh ${Number(value).toLocaleString("en-KE")}`;
}

function cartQuantity() {
  return cart.reduce((total, line) => total + line.quantity, 0);
}

function cartSubtotal() {
  return cart.reduce((total, line) => {
    const product = products.find((item) => item.id === line.productId);
    return total + (product ? product.price * line.quantity : 0);
  }, 0);
}

function matchingProducts() {
  const query = searchText.toLocaleLowerCase();
  return products.filter((product) => {
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    const matchesShop = selectedShop === "all" || product.shopId === selectedShop;
    const matchesQuery = !query || `${product.name} ${product.description} ${product.shop} ${product.category}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesShop && matchesQuery;
  });
}

function renderCategories() {
  document.getElementById("category-list").innerHTML = categories.map((category) =>
    `<button class="category-card${selectedCategory === category.id ? " active" : ""}" data-category="${safe(category.id)}"><span class="category-illustration">${category.icon}</span><strong>${safe(category.label)}</strong><small>${safe(category.count)}</small></button>`
  ).join("");
}

function renderShops() {
  document.getElementById("shop-chips").innerHTML = shops.map((shop) =>
    `<button class="shop-chip${selectedShop === shop.id ? " active" : ""}" data-shop="${safe(shop.id)}">${safe(shop.name)}</button>`
  ).join("");
}

function renderProducts() {
  const results = matchingProducts();
  document.getElementById("product-grid").innerHTML = results.map((product) => `
    <article class="product-card">
      <div class="product-image" role="img" aria-label="${safe(product.visual)}">
        <span class="product-tag">${safe(product.tag)}</span>
        <button class="favorite-button${favourites.has(product.id) ? " active" : ""}" data-favourite="${safe(product.id)}" aria-label="${favourites.has(product.id) ? "Remove from" : "Add to"} favourites">${favourites.has(product.id) ? "♥" : "♡"}</button>
        <div class="product-visual ${safe(product.color)}">${product.icon}</div>
      </div>
      <div class="product-info">
        <div class="product-shop"><span class="shop-dot">${safe(product.shop.charAt(0))}</span>${safe(product.shop)}</div>
        <h3 title="${safe(product.name)}">${safe(product.name)}</h3>
        <div class="product-description">${safe(product.description)}</div>
        <button class="product-review-link" data-reviews="${safe(product.id)}" aria-label="View verified reviews for ${safe(product.name)}"><span>☆</span><span>No verified reviews yet</span></button>
        <div class="availability-note"><span></span>Sample listing · confirm price and stock</div>
        <div class="product-buy-row"><span class="product-price">${money(product.price)} <small>/ item</small></span></div>
        <div class="product-actions"><button class="whatsapp-button" data-ask-shop="${safe(product.id)}">Ask shop on WhatsApp</button><button class="add-button" data-add="${safe(product.id)}" aria-label="Add ${safe(product.name)} to sample basket">＋</button></div>
      </div>
    </article>`).join("");
  document.getElementById("result-count").textContent = `${results.length} sample ${results.length === 1 ? "find" : "finds"}`;
  document.getElementById("no-results").classList.toggle("hidden", results.length > 0);
  document.getElementById("product-grid").classList.toggle("hidden", results.length === 0);
  document.getElementById("clear-filter").classList.toggle("hidden", selectedCategory === "all" && selectedShop === "all" && !searchText);
}

function renderCart() {
  const count = cartQuantity();
  const subtotal = cartSubtotal();
  document.getElementById("cart-count").textContent = count;
  document.getElementById("drawer-count").textContent = `(${count})`;
  document.getElementById("cart-footer").classList.toggle("hidden", count === 0);
  document.getElementById("cart-content").innerHTML = count === 0
    ? `<div class="empty-cart"><span>▱</span><h3>Your basket is waiting</h3><p>Add a few local finds and they’ll show up here.<br>This is a sample basket.</p></div>`
    : cartGroupsHtml();
  document.getElementById("cart-total").textContent = money(subtotal);
  document.getElementById("checkout-total").textContent = money(subtotal);
}

function cartGroupsHtml() {
  const groups = new Map();
  cart.forEach((line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return;
    if (!groups.has(product.shopId)) groups.set(product.shopId, { name: product.shop, items: [] });
    groups.get(product.shopId).items.push({ product, quantity: line.quantity });
  });
  return [...groups.values()].map((group) => `
    <section class="cart-shop-group"><div class="cart-shop-name">✳ &nbsp;${safe(group.name)}</div>
      ${group.items.map(({ product, quantity }) => `
        <div class="cart-line">
          <div class="cart-thumb ${safe(product.color)}">${product.icon}</div>
          <div class="cart-line-info"><strong>${safe(product.name)}</strong><small>${money(product.price)} each</small><div class="quantity-control"><button data-quantity="${safe(product.id)}" data-change="-1" aria-label="Decrease quantity">−</button><span>${quantity}</span><button data-quantity="${safe(product.id)}" data-change="1" aria-label="Increase quantity">＋</button></div></div>
          <div class="cart-line-price">${money(product.price * quantity)}</div>
        </div>`).join("")}
    </section>`).join("");
}

function render() {
  renderCategories();
  renderShops();
  renderProducts();
  renderCart();
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  document.getElementById("toast-region").append(item);
  setTimeout(() => item.remove(), 3200);
}

function addToCart(productId) {
  const line = cart.find((item) => item.productId === productId);
  if (line) line.quantity += 1;
  else cart.push({ productId, quantity: 1 });
  saveCart();
  renderCart();
  const button = document.querySelector(`[data-add="${CSS.escape(productId)}"]`);
  if (button) {
    button.classList.add("added");
    button.textContent = "✓ Added";
    setTimeout(() => {
      if (button.isConnected) {
        button.classList.remove("added");
        button.textContent = "＋ Add";
      }
    }, 950);
  }
}

function normalizeWhatsAppNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return "";
}

function askShop(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const shop = shops.find((item) => item.id === product.shopId);
  const phone = normalizeWhatsAppNumber(shop?.whatsapp);
  const message = `Hi ${product.shop}, I found ${product.name} (${money(product.price)}) on SokoKisii. Is it available today? Please confirm the current price and let me know the pickup or delivery options.`;

  document.getElementById("contact-title").textContent = product.name;
  document.getElementById("contact-shop").textContent = `${product.shop} · ${money(product.price)} shown · sample listing`;
  document.getElementById("contact-message").value = message;
  const link = document.getElementById("whatsapp-link");
  const warning = document.getElementById("contact-demo-warning");
  if (phone) {
    link.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    link.classList.remove("hidden");
    warning.classList.add("hidden");
  } else {
    link.removeAttribute("href");
    link.classList.add("hidden");
    warning.classList.remove("hidden");
  }
  document.getElementById("shop-contact-modal").showModal();
}

function showProductReviews(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  document.getElementById("reviews-title").textContent = product.name;
  document.getElementById("reviews-shop").textContent = `${product.shop} · ${money(product.price)} shown · sample listing`;
  document.getElementById("reviews-modal").showModal();
}

function changeQuantity(productId, change) {
  const line = cart.find((item) => item.productId === productId);
  if (!line) return;
  line.quantity += change;
  cart = cart.filter((item) => item.quantity > 0);
  saveCart();
  renderCart();
}

function openCart() {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("cart-drawer").classList.add("open");
  document.getElementById("cart-drawer").setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
}

function closeCart() {
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("cart-drawer").classList.remove("open");
  document.getElementById("cart-drawer").setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

function applySearch(value) {
  searchText = value.trim();
  renderProducts();
}

document.getElementById("category-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category;
  render();
});

document.getElementById("shop-chips").addEventListener("click", (event) => {
  const button = event.target.closest("[data-shop]");
  if (!button) return;
  selectedShop = button.dataset.shop;
  render();
});

document.getElementById("product-grid").addEventListener("click", (event) => {
  const reviews = event.target.closest("[data-reviews]");
  if (reviews) {
    showProductReviews(reviews.dataset.reviews);
    return;
  }
  const ask = event.target.closest("[data-ask-shop]");
  if (ask) {
    askShop(ask.dataset.askShop);
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    addToCart(add.dataset.add);
    return;
  }
  const favourite = event.target.closest("[data-favourite]");
  if (!favourite) return;
  const id = favourite.dataset.favourite;
  if (favourites.has(id)) favourites.delete(id);
  else favourites.add(id);
  renderProducts();
});

document.getElementById("cart-content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quantity]");
  if (button) changeQuantity(button.dataset.quantity, Number(button.dataset.change));
});

document.getElementById("search-input").addEventListener("input", (event) => applySearch(event.target.value));
document.getElementById("clear-filter").addEventListener("click", () => {
  selectedCategory = "all";
  selectedShop = "all";
  searchText = "";
  document.getElementById("search-input").value = "";
  render();
});
document.getElementById("reset-search").addEventListener("click", () => {
  selectedCategory = "all";
  selectedShop = "all";
  searchText = "";
  document.getElementById("search-input").value = "";
  render();
});
document.getElementById("explore-button").addEventListener("click", () => document.getElementById("shop-section").scrollIntoView({ behavior: "smooth" }));
document.getElementById("cart-button").addEventListener("click", openCart);
document.getElementById("close-cart").addEventListener("click", closeCart);
document.getElementById("overlay").addEventListener("click", closeCart);
document.getElementById("checkout-button").addEventListener("click", () => {
  closeCart();
  document.getElementById("checkout-modal").showModal();
});
document.getElementById("seller-button").addEventListener("click", () => document.getElementById("seller-modal").showModal());
document.getElementById("ask-from-reviews").addEventListener("click", () => {
  const title = document.getElementById("reviews-title").textContent;
  const product = products.find((item) => item.name === title);
  document.getElementById("reviews-modal").close();
  if (product) askShop(product.id);
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));
document.getElementById("checkout-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("buyer-name").value.trim();
  document.getElementById("checkout-modal").close();
  toast(`Thanks, ${name}. This was a demo—no order was sent to a shop.`);
});
document.getElementById("seller-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const shopName = document.getElementById("seller-name").value.trim();
  document.getElementById("seller-modal").close();
  toast(`${shopName} noted for this demo. Please share your feedback in person.`);
});
document.getElementById("location-button").addEventListener("click", () => toast("Kisii Town is the sample shopping area for this preview."));
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.getElementById("search-input").focus();
  }
  if (event.key === "Escape") closeCart();
});

render();
