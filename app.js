/* ==========================================================================
   ZOHD - HOUSE OF SUSTAINABLES (STATE & SHOPPING BAG LOGIC)
   ========================================================================== */

let products = [];
let productDetailsTrigger = null;

// INITIALIZE CART FROM LOCAL STORAGE
let cart = JSON.parse(localStorage.getItem("zohd_cart")) || [];
let currentUser = JSON.parse(localStorage.getItem("zohd_user")) || null;

document.addEventListener("DOMContentLoaded", () => {
  updateCartUI();
  updateUserUI();

  loadProducts();
  const catalogContainer = document.getElementById("shop-catalog-container");
  if (catalogContainer) {
    catalogContainer.addEventListener("click", event => {
      const thumbnail = event.target.closest("[data-product-id][data-image-index]");
      if (thumbnail) {
        const product = products.find(item => item.id === Number(thumbnail.dataset.productId));
        const image = product && (product.images || [product.image])[Number(thumbnail.dataset.imageIndex)];
        if (image) {
          thumbnail.closest(".product-gallery").querySelector(".product-img").src = image;
          thumbnail.closest(".product-thumbnails").querySelectorAll(".product-thumbnail").forEach(button => {
            const selected = button === thumbnail;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-pressed", String(selected));
          });
        }
        return;
      }

      if (event.target.closest("button, select, a")) return;
      const card = event.target.closest("[data-product-card]");
      if (card) openProductDetails(Number(card.dataset.productId));
    });
  }

  // Show Auth Modal on first visit
  if (!localStorage.getItem("zohd_visited")) {
    setTimeout(() => {
      openAuthModal();
      localStorage.setItem("zohd_visited", "true");
    }, 1200);
  }
});

async function loadProducts() {
  const container = document.getElementById("shop-catalog-container");
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Unable to load the product catalog.");
    const catalog = await response.json();
    if (!Array.isArray(catalog)) throw new Error("The product catalog response is invalid.");
    products = catalog;
    cart = cart.flatMap(item => {
      const product = products.find(entry =>
        entry.id === item.id
        && entry.name === item.name
        && entry.variants.includes(item.variant)
      );
      return product ? [{ ...item, ...product, variant: item.variant }] : [];
    });
    saveCart();
    if (container) renderShopCatalog();
  } catch (error) {
    console.error(error);
    if (container) {
      container.innerHTML = `<p role="alert">We couldn't load products. Please refresh the page or try again later.</p>`;
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// CART OPERATIONS
function saveCart() {
  localStorage.setItem("zohd_cart", JSON.stringify(cart));
  updateCartUI();
}

function addToCart(productId, selectedVariantOverride) {
  const product = products.find(p => p.id === productId);
  if (!product) {
    alert("This product is no longer available. Refresh the catalog and try again.");
    return;
  }
  const variantSelect = document.getElementById(`variant-${productId}`);
  const selectedVariant = selectedVariantOverride
    || (variantSelect ? variantSelect.value : product.variants[0]);

  const existingIndex = cart.findIndex(item => item.id === productId && item.variant === selectedVariant);

  if (existingIndex > -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({ ...product, variant: selectedVariant, quantity: 1 });
  }

  saveCart();
  toggleCart(true);
}

function updateCartQty(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
}

function updateCartUI() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Update Badge
  const badge = document.getElementById("cart-count");
  if (badge) badge.innerText = totalCount;

  // Update Subtotal
  const subtotalEl = document.getElementById("cart-subtotal");
  if (subtotalEl) subtotalEl.innerText = `₹${subtotal}`;

  // Render Items inside Drawer
  const container = document.getElementById("cart-items-container");
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-cart-view">
        <i class="fa-solid fa-bag-shopping"></i>
        <p>Your shopping bag is empty.</p>
      </div>
    `;
  } else {
    container.innerHTML = cart.map((item, index) => `
      <div class="cart-item-card">
        <button class="remove-item-btn" onclick="removeFromCart(${index})" title="Remove Item">&times;</button>
        <img src="${item.image}" class="cart-item-img" alt="${item.name}" />
        <div class="cart-item-details">
          <div>
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-variant">Variant: ${item.variant}</div>
          </div>
          <div class="cart-item-bottom">
            <span class="cart-item-price">₹${item.price * item.quantity}</span>
            <div class="qty-control">
              <button class="qty-btn" onclick="updateCartQty(${index}, -1)">-</button>
              <span class="qty-number">${item.quantity}</span>
              <button class="qty-btn" onclick="updateCartQty(${index}, 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function toggleCart(open = null) {
  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("cart-overlay");
  
  if (open === true) {
    drawer.classList.add("active");
    overlay.classList.add("active");
  } else if (open === false) {
    drawer.classList.remove("active");
    overlay.classList.remove("active");
  } else {
    drawer.classList.toggle("active");
    overlay.classList.toggle("active");
  }
}

// REDIRECT CHECKOUT TO WHATSAPP
function checkoutViaWhatsApp() {
  if (cart.length === 0) return alert("Your shopping bag is empty!");

  let msg = "Hi ZOHD Team! I would like to place an order:\n\n";
  let total = 0;

  cart.forEach((item, i) => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    msg += `${i + 1}. *${item.name}*\n   • Variant: ${item.variant}\n   • Qty: ${item.quantity}\n   • Price: ₹${itemTotal}\n\n`;
  });

  msg += `*Subtotal:* ₹${total}\n\nPlease confirm payment options and delivery timeframe. Thank you!`;
  window.open(`https://wa.me/918655903153?text=${encodeURIComponent(msg)}`, "_blank");
}

// RENDER CATALOG ON SHOP PAGE
function renderShopCatalog() {
  const container = document.getElementById("shop-catalog-container");
  if (!container) return;
  if (products.length === 0) {
    container.innerHTML = `<p>No products are currently available.</p>`;
    return;
  }
  container.innerHTML = products.map(product => `
    <div class="product-card" data-product-card data-product-id="${product.id}" role="group" aria-label="${escapeHtml(product.name)}">
      <div class="product-gallery">
        <img src="${escapeHtml(product.image)}" class="product-img" alt="${escapeHtml(product.name)}" />
        ${(product.images || [product.image]).length > 1 ? `
          <div class="product-thumbnails" aria-label="Product images">
            ${(product.images || [product.image]).map((image, index) => `
              <button type="button" class="product-thumbnail ${index === 0 ? "active" : ""}" data-product-id="${product.id}" data-image-index="${index}" aria-label="View product image ${index + 1}" aria-pressed="${index === 0}">
                <img src="${escapeHtml(image)}" alt="" />
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
      <div class="product-info">
        <h3 style="font-size:1.1rem; margin-bottom:0.4rem;">${escapeHtml(product.name)}</h3>
        <p style="color:var(--text-light); margin-bottom:0.8rem;">${escapeHtml(product.description.slice(0, 150))}${product.description.length > 150 ? "…" : ""}</p>
        <button type="button" class="product-details-hint" data-product-detail-trigger="${product.id}" onclick="openProductDetails(${product.id})">View full product details</button>
        <p style="font-weight:700; color:var(--primary-green); font-size:1.2rem; margin-bottom:0.8rem;">
          ₹${product.price}
          ${product.mrp > product.price ? `<del class="product-mrp">₹${product.mrp}</del>` : ""}
        </p>
        
        <div class="form-group">
          <label style="font-size:0.8rem;">Choose Variant:</label>
          <select id="variant-${product.id}">
            ${product.variants.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
          </select>
        </div>

        <button class="btn btn-primary full-width" onclick="addToCart(${product.id})" style="margin-top:auto;" ${product.stock === "Out of Stock" ? "disabled" : ""}>
          <i class="fa-solid fa-bag-shopping"></i> Add to Shopping Bag
        </button>
      </div>
    </div>
  `).join('');
}

function openProductDetails(productId) {
  const product = products.find(item => item.id === productId);
  const modal = document.getElementById("product-detail-modal");
  if (!product || !modal) return;

  const images = product.images || [product.image];
  productDetailsTrigger = document.querySelector(`[data-product-detail-trigger="${productId}"]`);
  const selectedVariant = document.getElementById(`variant-${productId}`)?.value || product.variants[0];
  modal.querySelector(".product-detail-content").innerHTML = `
    <div class="product-detail-gallery">
      <img class="product-detail-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" />
      ${images.length > 1 ? `<div class="product-thumbnails" aria-label="Product images">
        ${images.map((image, index) => `<button type="button" class="product-thumbnail ${index === 0 ? "active" : ""}" data-detail-image-index="${index}" aria-label="View product image ${index + 1}" aria-pressed="${index === 0}">
          <img src="${escapeHtml(image)}" alt="" />
        </button>`).join("")}
      </div>` : ""}
    </div>
    <div class="product-detail-info">
      <h2 id="product-detail-heading">${escapeHtml(product.name)}</h2>
      <p class="product-detail-price">₹${product.price} ${product.mrp > product.price ? `<del class="product-mrp">₹${product.mrp}</del>` : ""}</p>
      <div class="product-detail-description">${product.description.split(/\r?\n+/).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
      <div class="form-group">
        <label for="product-detail-variant">Choose Variant</label>
        <select id="product-detail-variant">${product.variants.map(variant => `<option value="${escapeHtml(variant)}" ${variant === selectedVariant ? "selected" : ""}>${escapeHtml(variant)}</option>`).join("")}</select>
      </div>
      <button type="button" class="btn btn-primary full-width product-detail-add" ${product.stock === "Out of Stock" ? "disabled" : ""}>Add to Shopping Bag</button>
    </div>`;

  modal.querySelector(".product-detail-content").onclick = event => {
    const thumbnail = event.target.closest("[data-detail-image-index]");
    if (!thumbnail) return;
    const image = images[Number(thumbnail.dataset.detailImageIndex)];
    if (!image) return;
    modal.querySelector(".product-detail-image").src = image;
    modal.querySelectorAll("[data-detail-image-index]").forEach(button => {
      const selected = button === thumbnail;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  modal.querySelector(".product-detail-add").onclick = () => {
    const variant = modal.querySelector("#product-detail-variant").value;
    closeProductDetails();
    addToCart(productId, variant);
  };
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("product-detail-open");
  modal.querySelector(".product-detail-close").focus();
}

function closeProductDetails() {
  const modal = document.getElementById("product-detail-modal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("product-detail-open");
  modal.querySelector(".product-detail-content").replaceChildren();
  if (productDetailsTrigger) productDetailsTrigger.focus();
  productDetailsTrigger = null;
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeProductDetails();
});

// AUTHENTICATION MODAL & GUEST LOGIN
function openAuthModal() {
  document.getElementById("auth-modal").classList.add("active");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

function switchAuthMode(mode) {
  document.getElementById("tab-login-btn").classList.toggle("active", mode === 'login');
  document.getElementById("tab-register-btn").classList.toggle("active", mode === 'register');
  document.getElementById("login-form-container").classList.toggle("hidden", mode !== 'login');
  document.getElementById("register-form-container").classList.toggle("hidden", mode !== 'register');
}

function handleCustomerAuth(e, mode) {
  e.preventDefault();
  const name = mode === 'register' ? document.getElementById("reg-name").value : "Customer";
  currentUser = { name: name };
  localStorage.setItem("zohd_user", JSON.stringify(currentUser));
  updateUserUI();
  closeModal("auth-modal");
}

function continueAsGuest() {
  currentUser = { name: "Guest" };
  localStorage.setItem("zohd_user", JSON.stringify(currentUser));
  updateUserUI();
  closeModal("auth-modal");
}

function updateUserUI() {
  const userEl = document.getElementById("user-display-name");
  if (userEl && currentUser) {
    userEl.innerText = currentUser.name;
  }
}