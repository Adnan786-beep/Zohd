let products = [];
    let cart = [];
    let savedCart = loadSavedCart();
        let currentUser = null;
    let productDetailsTrigger = null;
    let productSearchQuery = "";

        document.addEventListener("DOMContentLoaded", () => {
          loadProducts();
          restoreCustomerSession();

          if (!localStorage.getItem("zohd_visited")) {
            setTimeout(() => {
              openAuthModal();
              localStorage.setItem("zohd_visited", "true");
            }, 1200);
          }
        });

    async function loadProducts() {
      const container = document.getElementById("product-grid-container");
      try {
        const response = await fetch("/api/products");
        if (!response.ok) {
          let message = "Unable to load the product catalog.";
          try {
            const result = await response.json();
            if (result.error) message = result.error;
          } catch {
            message = `Unable to load the product catalog (HTTP ${response.status}).`;
          }
          throw new Error(message);
        }
        const catalog = await response.json();
        if (!Array.isArray(catalog)) throw new Error("The product catalog response is invalid.");
        products = catalog.map(product => ({
          ...product,
          selectedVariant: product.variants[0]
        }));
        cart = savedCart.flatMap(item => {
          const product = products.find(entry =>
            entry.id === item.id && entry.variants.includes(item.variant)
          );
          return product ? [{ ...product, variant: item.variant, quantity: item.quantity }] : [];
        });
        savedCart = [];
        saveCart();
        renderProducts("product-grid-container");
        renderProducts("home-product-grid", 4);
        updateProductSearchStatus();
      } catch (error) {
        console.error(error);
        document.querySelectorAll("#product-grid-container, #home-product-grid").forEach(productContainer => {
          productContainer.innerHTML = `<p class="catalog-message" role="alert">${escapeHtml(error.message)} Please refresh the page or try again later.</p>`;
        });
      }
    }

    function showSection(sectionId) {
      document.querySelectorAll(".page-section").forEach(s => s.classList.remove("active"));
      document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
      
      const targetNav = document.getElementById(`nav-${sectionId.replace('-section', '')}`);
      if (targetNav) targetNav.classList.add("active");

      document.getElementById(sectionId).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function showMaterialsComparison() {
      showSection("home-section");
      requestAnimationFrame(() => {
        document.getElementById("materials-comparison").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    function openProductSearch(query = "") {
      showSection("shop-section");
      const input = document.getElementById("product-search");
      input.value = query;
      filterProducts(query);
      input.focus();
    }

    function filterProducts(query) {
      productSearchQuery = query.trim().toLocaleLowerCase();
      document.querySelectorAll("#product-grid-container, #home-product-grid").forEach(container => {
        renderProducts(container.id, container.id === "home-product-grid" ? 4 : products.length);
      });
      updateProductSearchStatus();
    }

    function clearProductSearch() {
      const input = document.getElementById("product-search");
      input.value = "";
      filterProducts("");
      input.focus();
    }

    function updateProductSearchStatus() {
      const status = document.getElementById("product-search-status");
      if (!status) return;
      const matchingCount = products.filter(product => productMatchesSearch(product)).length;
      status.textContent = productSearchQuery
        ? `${matchingCount} ${matchingCount === 1 ? "product" : "products"} found`
        : `${products.length} products`;
    }

    function productMatchesSearch(product) {
      if (!productSearchQuery) return true;
      const searchableText = [product.name, product.category, product.description, ...(product.variants || [])]
        .join(" ")
        .toLocaleLowerCase();
      return searchableText.includes(productSearchQuery);
    }

    function selectVariant(productId, variant) {
      const p = products.find(x => x.id === productId);
      if (!p) return;
      p.selectedVariant = variant;
      document.querySelectorAll(`[data-product-id="${productId}"][data-variant]`).forEach(button => {
        const selected = button.dataset.variant === variant;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
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

    function renderProducts(containerId, limit = products.length) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const matchingProducts = products.filter(productMatchesSearch);
      if (matchingProducts.length === 0) {
        container.innerHTML = `<p>No products are currently available.</p>`;
        if (productSearchQuery) container.innerHTML = `<p>No products match “${escapeHtml(productSearchQuery)}”. Try another search.</p>`;
        return;
      }
      container.innerHTML = matchingProducts.slice(0, limit).map(p => `
        <div class="product-card" data-product-card data-product-id="${p.id}" role="group" aria-label="${escapeHtml(p.name)}">
          <div class="product-gallery">
            <img src="${escapeHtml(p.image)}" class="product-img" alt="${escapeHtml(p.name)}" />
            ${(p.images || [p.image]).length > 1 ? `
              <div class="product-thumbnails" aria-label="Product images">
                ${(p.images || [p.image]).map((image, index) => `
                  <button type="button" class="product-thumbnail ${index === 0 ? "active" : ""}" data-product-id="${p.id}" data-image-index="${index}" aria-label="View product image ${index + 1}" aria-pressed="${index === 0}">
                    <img src="${escapeHtml(image)}" alt="" />
                  </button>
                `).join("")}
              </div>
            ` : ""}
          </div>
          <div class="product-info">
            <div class="product-title">${escapeHtml(p.name)}</div>
            <div class="product-desc">${escapeHtml(p.description.slice(0, 150))}${p.description.length > 150 ? "…" : ""}</div>
            <button type="button" class="product-details-hint" data-product-detail-trigger="${p.id}" onclick="openProductDetails(${p.id}, this)">View full product details</button>
            
            <div class="variant-pills">
              ${p.variants.map(v => `
                <button type="button" class="variant-pill ${p.selectedVariant === v ? 'active' : ''}" data-product-id="${p.id}" data-variant="${escapeHtml(v)}">${escapeHtml(v)}</button>
              `).join('')}
            </div>

            <div class="product-price">
              ₹${p.price}
              ${p.mrp > p.price ? `<del class="product-mrp">₹${p.mrp}</del>` : ""}
            </div>

            <button class="btn btn-primary full-width" onclick="addToCart(${p.id})" ${p.stock === "Out of Stock" ? "disabled" : ""}>
              <i class="fa-solid fa-bag-shopping"></i> Add to Bag
            </button>
          </div>
        </div>
      `).join('');
    }

    async function subscribeToNewsletter(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("newsletter-status");
      const submitButton = form.querySelector('button[type="submit"]');
      status.textContent = "";
      status.classList.remove("error");
      submitButton.disabled = true;

      try {
        const response = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: document.getElementById("newsletter-email").value,
            consent: document.getElementById("newsletter-consent").checked
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to subscribe right now. Please try again.");
        form.reset();
        status.textContent = "Thanks for subscribing. Your email has been added to the ZOHD updates list.";
      } catch (error) {
        console.error("Newsletter subscription failed:", error);
        status.classList.add("error");
        status.textContent = error.message || "Unable to subscribe right now. Please try again.";
      } finally {
        submitButton.disabled = false;
      }
    }

    document.querySelectorAll("#product-grid-container, #home-product-grid").forEach(container => {
      container.addEventListener("click", event => {
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
        const pill = event.target.closest("[data-product-id][data-variant]");
        if (pill) {
          selectVariant(Number(pill.dataset.productId), pill.dataset.variant);
          return;
        }
        if (event.target.closest("button, select, a")) return;
        const card = event.target.closest("[data-product-card]");
        if (card) openProductDetails(Number(card.dataset.productId));
      });
    });

    function openProductDetails(productId, trigger = null) {
      const product = products.find(item => item.id === productId);
      const modal = document.getElementById("product-detail-modal");
      if (!product || !modal) return;

      const images = product.images || [product.image];
      const isFamilyPack = /family/i.test(product.category);
      const isToothbrush = /toothbrush/i.test(product.name);
      const materialDetails = /neem/i.test(`${product.name} ${product.category}`)
        ? "Neem wood"
        : /notebook/i.test(product.name)
          ? "Seed notebook"
          : "Natural bamboo";
      const bristleDetails = isFamilyPack
        ? "Soft bristles for adults and extra-soft bristles for kids"
        : /neem/i.test(`${product.name} ${product.category}`)
          ? (/kids/i.test(product.category) ? "Softer design for kids" : "Soft, biodegradable bristles")
          : (/kids/i.test(product.category) ? "Ultra-soft for kids" : "Soft for adults");
      productDetailsTrigger = trigger || document.querySelector(`[data-product-detail-trigger="${productId}"]:not([hidden])`);
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
          <span class="product-detail-category">${escapeHtml(product.category)}</span>
          <h2 id="product-detail-heading">${escapeHtml(product.name)}</h2>
          <p class="product-detail-price">₹${product.price} ${product.mrp > product.price ? `<del class="product-mrp">₹${product.mrp}</del>` : ""}</p>
          <div class="product-detail-highlights">
            <div class="product-detail-highlight"><i class="fa-solid fa-box-open" aria-hidden="true"></i><span><strong>In this pack</strong><span id="product-detail-pack-summary">${escapeHtml(product.selectedVariant || product.variants[0] || "See selected option")}</span></span></div>
            <div class="product-detail-highlight"><i class="fa-solid fa-leaf" aria-hidden="true"></i><span><strong>Material</strong><span>${escapeHtml(materialDetails)}</span></span></div>
            ${isToothbrush ? `<div class="product-detail-highlight"><i class="fa-solid fa-tooth" aria-hidden="true"></i><span><strong>Bristles</strong><span>${escapeHtml(bristleDetails)}</span></span></div>` : ""}
          </div>
          <div class="product-detail-description">${product.description.split(/\r?\n+/).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
          <div class="form-group">
            <label for="product-detail-variant">Choose Variant</label>
            <select id="product-detail-variant">${product.variants.map(variant => `<option value="${escapeHtml(variant)}" ${variant === product.selectedVariant ? "selected" : ""}>${escapeHtml(variant)}</option>`).join("")}</select>
          </div>
          <button type="button" class="btn btn-primary full-width product-detail-add" ${product.stock === "Out of Stock" ? "disabled" : ""}>Add to Bag</button>
        </div>`;

      modal.querySelector("#product-detail-variant").addEventListener("change", event => {
        modal.querySelector("#product-detail-pack-summary").textContent = event.currentTarget.value;
      });
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

    function addToCart(productId, selectedVariant = null) {
      const p = products.find(x => x.id === productId);
      if (!p || p.stock === "Out of Stock") {
        alert("This product is unavailable. Refresh the catalog and try again.");
        return;
      }

      const variant = selectedVariant || p.selectedVariant;
      const existing = cart.find(x => x.id === productId && x.variant === variant);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({ ...p, variant, quantity: 1 });
      }

      saveCart();
      toggleCart(true);
    }

    function updateCartQty(index, delta) {
      cart[index].quantity += delta;
      if (cart[index].quantity <= 0) cart.splice(index, 1);
      saveCart();
    }

    function loadSavedCart() {
      try {
        const storedCart = localStorage.getItem("zohd_cart");
        if (!storedCart) return [];
        const parsedCart = JSON.parse(storedCart);
        if (!Array.isArray(parsedCart)) throw new Error("Saved shopping bag data is invalid.");
        return parsedCart.filter(item =>
          item
          && Number.isInteger(item.id)
          && typeof item.variant === "string"
          && Number.isInteger(item.quantity)
          && item.quantity > 0
          && item.quantity <= 99
        ).map(item => ({ id: item.id, variant: item.variant, quantity: item.quantity }));
      } catch (error) {
        console.error("Unable to restore the saved shopping bag:", error);
        return [];
      }
    }

    function saveCart() {
      try {
        localStorage.setItem("zohd_cart", JSON.stringify(cart.map(item => ({
          id: item.id,
          variant: item.variant,
          quantity: item.quantity
        }))));
      } catch (error) {
        console.error("Unable to save the shopping bag on this device:", error);
      }
      updateCartUI();
    }

    function updateCartUI() {
      const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
      const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);

      document.getElementById("cart-count").innerText = totalCount;
      document.getElementById("cart-subtotal").innerText = `₹${subtotal}`;

      const container = document.getElementById("cart-items-container");
      if (cart.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-light); margin-top:3rem;">Your shopping bag is empty.</p>`;
      } else {
        container.innerHTML = cart.map((item, idx) => `
          <div class="cart-item-card">
            <img src="${item.image}" class="cart-item-img" />
            <div style="flex:1;">
              <strong style="font-size:0.92rem; color:var(--text-dark);">${escapeHtml(item.name)}</strong>
              <p style="font-size:0.78rem; color:var(--text-light); margin:0.2rem 0 0.6rem;">Variant: ${escapeHtml(item.variant)}</p>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:800; color:var(--primary-green);">₹${item.price * item.quantity}</span>
                <div class="qty-control">
                  <button class="qty-btn" onclick="updateCartQty(${idx}, -1)">-</button>
                  <span class="qty-number">${item.quantity}</span>
                  <button class="qty-btn" onclick="updateCartQty(${idx}, 1)">+</button>
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

    async function checkoutViaWhatsApp() {
      if (cart.length === 0) return alert("Your shopping bag is empty!");

      const whatsappWindow = window.open("about:blank", "_blank");
      let customer;
      try {
        const response = await fetch("/api/customer/me", { credentials: "same-origin" });
        if (response.status === 401) {
          if (whatsappWindow) whatsappWindow.close();
          currentUser = null;
          alert("Please sign in to your account before checkout so we can include your delivery address and location.");
          openAuthModal();
          return;
        }
        if (!response.ok) throw new Error("Unable to load your delivery details. Please try again.");
        const result = await response.json();
        customer = result.customer;
      } catch (error) {
        if (whatsappWindow) whatsappWindow.close();
        console.error("Unable to load customer delivery details for checkout:", error);
        alert(error.message || "Unable to load your delivery details. Please try again.");
        return;
      }

      if (!customer || typeof customer.address !== "string" || !customer.address.trim()
        || typeof customer.location !== "string" || !customer.location.trim()) {
        if (whatsappWindow) whatsappWindow.close();
        alert("Your account is missing a delivery address or location. Please create an account with your delivery details before checkout.");
        return;
      }

      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            items: cart.map(item => ({
              productId: item.id,
              variant: item.variant,
              quantity: item.quantity
            }))
          })
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            if (whatsappWindow) whatsappWindow.close();
            currentUser = null;
            alert("Please sign in to your customer account before placing an order.");
            openAuthModal();
            return;
          }
          throw new Error(result.error || "Unable to save your order. Please try again.");
        }
        if (!result.order || !Array.isArray(result.order.items)) {
          throw new Error("The order service returned an invalid confirmation.");
        }

        const order = result.order;
        currentUser = customer;
        let msg = `Hi ZOHD Team! I would like to place an order:\n\n*Order reference:* ${order.orderNumber}\n*Customer:* ${order.customer.name}\n*Contact:* ${order.customer.identifier}\n*Delivery address:* ${order.customer.address}\n*Location:* ${order.customer.location}\n\n`;
        order.items.forEach((item, index) => {
          msg += `${index + 1}. *${item.name}*\n   • Variant: ${item.variant}\n   • Qty: ${item.quantity}\n   • Price: ₹${item.lineTotal}\n\n`;
        });
        msg += `*Subtotal:* ₹${order.subtotal}\n\nPlease confirm payment details. Thank you!`;

        cart = [];
        saveCart();
        const whatsappUrl = `https://wa.me/918655903153?text=${encodeURIComponent(msg)}`;
        if (whatsappWindow) {
          whatsappWindow.location.href = whatsappUrl;
        } else {
          window.location.assign(whatsappUrl);
        }
      } catch (error) {
        if (whatsappWindow) whatsappWindow.close();
        console.error("Unable to submit customer order:", error);
        alert(error.message || "Unable to save your order. Please try again.");
      }
    }

    function openAuthModal() {
      const isSignedIn = currentUser && currentUser.id;
      document.getElementById("customer-account-summary").classList.toggle("hidden", !isSignedIn);
      document.querySelector(".auth-tabs").classList.toggle("hidden", Boolean(isSignedIn));
      document.getElementById("login-form-container").classList.toggle("hidden", Boolean(isSignedIn));
      document.getElementById("register-form-container").classList.add("hidden");
      document.getElementById("admin-login-container").classList.add("hidden");
      document.querySelector(".guest-divider-wrapper").classList.toggle("hidden", Boolean(isSignedIn));
      document.getElementById("customer-admin-signin").classList.toggle("hidden", Boolean(isSignedIn));
      if (isSignedIn) {
        document.getElementById("customer-account-name").textContent = `Welcome, ${currentUser.name}`;
        document.getElementById("customer-account-identifier").textContent = currentUser.identifier;
        document.getElementById("customer-logout-error").textContent = "";
      } else {
        switchAuthMode("login");
      }
      document.getElementById("auth-modal").classList.add("active");
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove("active");
    }

    function switchAuthMode(mode) {
      document.getElementById("customer-account-summary").classList.add("hidden");
      document.querySelector(".auth-tabs").classList.remove("hidden");
      document.getElementById("admin-login-container").classList.add("hidden");
      document.getElementById("customer-admin-signin").classList.toggle("hidden", mode !== "login");
      document.getElementById("tab-login-btn").classList.toggle("active", mode === 'login');
      document.getElementById("tab-register-btn").classList.toggle("active", mode === 'register');
      document.getElementById("login-form-container").classList.toggle("hidden", mode !== 'login');
      document.getElementById("register-form-container").classList.toggle("hidden", mode !== 'register');
      document.querySelector(".guest-divider-wrapper").classList.toggle("hidden", mode !== "login");
      document.querySelector(".login-divider-label").classList.toggle("hidden", mode !== "login");
      document.getElementById("customer-admin-signin").classList.toggle("hidden", mode !== "login");
    }

    function showAdminSignIn() {
      document.getElementById("customer-account-summary").classList.add("hidden");
      document.querySelector(".auth-tabs").classList.add("hidden");
      document.getElementById("login-form-container").classList.add("hidden");
      document.getElementById("register-form-container").classList.add("hidden");
      document.querySelector(".guest-divider-wrapper").classList.add("hidden");
      document.getElementById("customer-admin-signin").classList.add("hidden");
      document.getElementById("admin-login-container").classList.remove("hidden");
      document.getElementById("main-admin-error").textContent = "";
    }

    function showCustomerSignIn() {
      switchAuthMode("login");
    }

    document.getElementById("main-admin-login-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = document.getElementById("main-admin-submit");
      const error = document.getElementById("main-admin-error");
      button.disabled = true;
      error.textContent = "";

      try {
        const response = await fetch("/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            adminId: document.getElementById("main-admin-id").value,
            password: document.getElementById("main-admin-password").value
          })
        });
        if (response.ok) {
          window.location.assign("/admin/dashboard");
          return;
        }
        if (response.status === 401) {
          error.textContent = "Invalid admin ID or password.";
        } else if (response.status === 429) {
          error.textContent = "Too many attempts. Please wait before trying again.";
        } else {
          let result;
          try {
            result = await response.json();
          } catch {
            result = null;
          }
          error.textContent = result && typeof result.error === "string"
            ? result.error
            : `Admin sign-in service unavailable (HTTP ${response.status}). Check the Vercel deployment configuration.`;
        }
      } catch {
        error.textContent = window.location.protocol === "file:"
          ? "Open the storefront through the app server and sign in at http://127.0.0.1:3000."
          : "Unable to contact the login service. Make sure the app server is running.";
      } finally {
        button.disabled = false;
      }
    });

    async function handleCustomerAuth(e, mode) {
      e.preventDefault();
      const isRegistration = mode === "register";
      const form = e.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const error = document.getElementById(isRegistration ? "customer-register-error" : "customer-login-error");
      if (isRegistration
        && document.getElementById("reg-password").value !== document.getElementById("reg-confirm-password").value) {
        error.textContent = "Passwords do not match.";
        return;
      }
      const payload = isRegistration
        ? {
            name: document.getElementById("reg-name").value,
            identifier: document.getElementById("reg-identifier").value,
            address: document.getElementById("reg-address").value,
            location: document.getElementById("reg-location").value,
            password: document.getElementById("reg-password").value
          }
        : {
            identifier: document.getElementById("login-id").value,
            password: document.getElementById("login-password").value
          };
      submitButton.disabled = true;
      error.textContent = "";

      try {
        const response = await fetch(isRegistration ? "/api/customer/register" : "/api/customer/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
          error.textContent = result.error || "Unable to sign in. Please try again.";
          return;
        }
        currentUser = result.customer;
        document.getElementById("user-display-name").textContent = currentUser.name;
        form.reset();
        if (isRegistration) document.getElementById("reg-confirm-password").value = "";
        closeModal("auth-modal");
      } catch (requestError) {
        console.error("Customer authentication request failed:", requestError);
        error.textContent = "Unable to contact the account service. Please try again.";
      } finally {
        submitButton.disabled = false;
      }
    }

    async function restoreCustomerSession() {
      try {
        const response = await fetch("/api/customer/me", { credentials: "same-origin" });
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Unable to restore the customer session.");
        const result = await response.json();
        currentUser = result.customer;
        document.getElementById("user-display-name").textContent = currentUser.name;
      } catch (error) {
        console.error(error);
      }
    }

    async function logoutCustomer() {
      const error = document.getElementById("customer-logout-error");
      error.textContent = "";
      try {
        const response = await fetch("/api/customer/logout", {
          method: "POST",
          credentials: "same-origin"
        });
        if (!response.ok) throw new Error("Unable to sign out. Please try again.");
        currentUser = null;
        document.getElementById("user-display-name").textContent = "Login / Register";
        switchAuthMode("login");
      } catch (requestError) {
        console.error("Customer logout request failed:", requestError);
        error.textContent = requestError.message;
      }
    }

    function continueAsGuest() {
      currentUser = { name: "Guest" };
      document.getElementById("user-display-name").innerText = "Guest";
      closeModal("auth-modal");
    }

    window.addEventListener('load', () => {
      const loader = document.getElementById('page-loader');
      if (!loader) return;
      setTimeout(() => loader.classList.add('hidden'), 600);
    });
