"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const CATALOG_PATH = path.join(ROOT, "data", "products.json");
const CUSTOMERS_PATH = path.join(ROOT, "data", "customers.json");
const ORDERS_PATH = path.join(ROOT, "data", "orders.json");
const NEWSLETTER_PATH = path.join(ROOT, "data", "newsletter-subscribers.json");
const ORDER_STATUSES = [
  "Awaiting WhatsApp confirmation",
  "Confirmed",
  "Packed",
  "Shipped",
  "Delivered",
  "Cancelled"
];
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const sessions = new Map();
const customerSessions = new Map();
const loginAttempts = new Map();
const customerAuthAttempts = new Map();
const newsletterAttempts = new Map();

function loadProducts() {
  const products = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  if (!Array.isArray(products)) {
    throw new Error("The product catalog file must contain a JSON array.");
  }
  return products;
}

let products = loadProducts();
let customers = loadCustomers();
let orders = loadOrders();
let newsletterSubscribers = loadNewsletterSubscribers();

function loadCustomers() {
  const loadedCustomers = JSON.parse(fs.readFileSync(CUSTOMERS_PATH, "utf8"));
  if (!Array.isArray(loadedCustomers)) {
    throw new Error("The customer account file must contain a JSON array.");
  }
  return loadedCustomers;
}

function loadOrders() {
  const loadedOrders = JSON.parse(fs.readFileSync(ORDERS_PATH, "utf8"));
  if (!Array.isArray(loadedOrders)) {
    throw new Error("The order file must contain a JSON array.");
  }
  return loadedOrders;
}

function loadNewsletterSubscribers() {
  const loadedSubscribers = JSON.parse(fs.readFileSync(NEWSLETTER_PATH, "utf8"));
  if (!Array.isArray(loadedSubscribers)) {
    throw new Error("The newsletter subscriber file must contain a JSON array.");
  }
  return loadedSubscribers;
}

function saveOrders(nextOrders) {
  const temporaryPath = `${ORDERS_PATH}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(nextOrders, null, 2)}\n`, { flag: "wx" });
  try {
    fs.renameSync(temporaryPath, ORDERS_PATH);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  orders = nextOrders;
}

function saveNewsletterSubscribers(nextSubscribers) {
  const temporaryPath = `${NEWSLETTER_PATH}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(nextSubscribers, null, 2)}\n`, { flag: "wx" });
  try {
    fs.renameSync(temporaryPath, NEWSLETTER_PATH);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  newsletterSubscribers = nextSubscribers;
}

function saveProducts(nextProducts) {
  const temporaryPath = `${CATALOG_PATH}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(nextProducts, null, 2)}\n`, { flag: "wx" });
  try {
    fs.renameSync(temporaryPath, CATALOG_PATH);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  products = nextProducts;
}

function saveCustomers(nextCustomers) {
  const temporaryPath = `${CUSTOMERS_PATH}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(nextCustomers, null, 2)}\n`, { flag: "wx" });
  try {
    fs.renameSync(temporaryPath, CUSTOMERS_PATH);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  customers = nextCustomers;
}

function validateProduct(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Product data must be a JSON object." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const primaryImage = typeof input.image === "string" ? input.image.trim() : "";
  const images = Array.isArray(input.images)
    ? [...new Set(input.images.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))]
    : [primaryImage];
  const image = primaryImage || images[0] || "";
  const variants = Array.isArray(input.variants)
    ? [...new Set(input.variants.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))]
    : [];
  const price = input.price;
  const mrp = input.mrp === undefined ? price : input.mrp;
  const quantity = input.quantity === null || input.quantity === undefined ? null : input.quantity;
  const stock = quantity === null
    ? (input.stock === undefined ? "In Stock" : input.stock)
    : quantity > 0 ? "In Stock" : "Out of Stock";

  if (!name || name.length > 160) return { error: "Product name is required and must be 160 characters or fewer." };
  if (!category || category.length > 80) return { error: "Category is required and must be 80 characters or fewer." };
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 10000000) {
    return { error: "Price must be a non-negative number." };
  }
  if (typeof mrp !== "number" || !Number.isFinite(mrp) || mrp < price || mrp > 10000000) {
    return { error: "MRP must be a number equal to or greater than the selling price." };
  }
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000)) {
    return { error: "Quantity must be a whole number between 0 and 1,000,000." };
  }
  if (!description || description.length > 1000) return { error: "Description is required and must be 1000 characters or fewer." };
  if (!image || image.length > 2048 || images.length === 0 || images.length > 8 || images.some(value => value.length > 2048)) {
    return { error: "Provide between 1 and 8 product images, each no more than 2048 characters." };
  }
  if (variants.length === 0 || variants.length > 20 || variants.some(value => value.length > 80)) {
    return { error: "Provide between 1 and 20 variants, each 80 characters or fewer." };
  }
  if (stock !== "In Stock" && stock !== "Out of Stock") return { error: "Stock must be In Stock or Out of Stock." };

  for (const imageUrlValue of images) {
    try {
      const imageUrl = new URL(imageUrlValue, "http://localhost");
      if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
        return { error: "Image URL must use HTTP or HTTPS." };
      }
    } catch {
      return { error: "Enter valid image URLs." };
    }
  }

  return {
    product: {
      name,
      category,
      price,
      mrp,
      variants,
      image: images[0],
      images,
      description,
      stock,
      ...(quantity === null ? {} : { quantity })
    }
  };
}

function sendJson(res, status, payload, headers = {}) {
  send(res, status, JSON.stringify(payload), "application/json; charset=utf-8", headers);
}

function requireAdmin(req, res) {
  if (getSession(req)) return true;
  sendJson(res, 401, { error: "Admin authentication required." });
  return false;
}

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

if (!ADMIN_ID || !ADMIN_PASSWORD) {
  throw new Error("Set ADMIN_ID and ADMIN_PASSWORD in environment variables or .env before starting the server.");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer from 1 through 65535.");
}

function send(res, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > 8192) {
        tooLarge = true;
        body = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new Error("Request body too large."));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function safeEqual(received, expected) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length
    && crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

function clientAddress(req) {
  return req.socket.remoteAddress || "unknown";
}

function rateLimitAttempts(req, res, attempts, message = "Too many attempts.") {
  const now = Date.now();
  const key = clientAddress(req);
  let state = attempts.get(key);
  if (!state || state.resetAt <= now) {
    state = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    attempts.set(key, state);
  }
  if (state.count >= MAX_LOGIN_ATTEMPTS) {
    const retrySeconds = Math.ceil((state.resetAt - now) / 1000);
    send(res, 429, JSON.stringify({ error: message }), "application/json; charset=utf-8", {
      "Retry-After": String(retrySeconds)
    });
    return null;
  }
  state.count += 1;
  return key;
}

function loginRateLimit(req, res) {
  return rateLimitAttempts(req, res, loginAttempts, "Too many login attempts.");
}

function getSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith("zohd_admin="));
  if (!cookie) return null;
  const token = cookie.slice("zohd_admin=".length);
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, session };
}

function getCustomerSession(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith("zohd_customer="));
  if (!cookie) return null;
  const token = cookie.slice("zohd_customer=".length);
  const session = customerSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    customerSessions.delete(token);
    return null;
  }
  return { token, session };
}

function normalizeCustomerIdentifier(value) {
  const identifier = value.trim();
  return identifier.includes("@")
    ? identifier.toLowerCase()
    : identifier.replace(/[\s()-]/g, "");
}

function validateCustomerRegistration(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Enter valid account details." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const rawIdentifier = typeof input.identifier === "string" ? input.identifier : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const identifier = normalizeCustomerIdentifier(rawIdentifier);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isPhone = /^\+?\d{10,15}$/.test(identifier);

  if (name.length < 2 || name.length > 100) return { error: "Name must be between 2 and 100 characters." };
  if (identifier.length > 254 || (!isEmail && !isPhone)) {
    return { error: "Enter a valid email address or phone number." };
  }
  if (!address || address.length > 500) return { error: "Delivery address is required and must be 500 characters or fewer." };
  if (!location || location.length > 200) return { error: "Delivery location is required and must be 200 characters or fewer." };
  if (password.length < 8 || password.length > 1024) {
    return { error: "Password must be between 8 and 1024 characters." };
  }
  return { customer: { name, identifier, address, location, password } };
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    identifier: customer.identifier,
    address: customer.address,
    location: customer.location,
    createdAt: customer.createdAt
  };
}

function hashCustomerPassword(password, salt = crypto.randomBytes(16)) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ salt: salt.toString("hex"), passwordHash: derivedKey.toString("hex") });
    });
  });
}

function setCustomerSession(res, customerId, status, body) {
  const now = Date.now();
  for (const [token, session] of customerSessions) {
    if (session.expiresAt <= now) customerSessions.delete(token);
  }
  const token = crypto.randomBytes(32).toString("hex");
  customerSessions.set(token, { customerId, expiresAt: now + CUSTOMER_SESSION_TTL_MS });
  const cookieParts = [
    `zohd_customer=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(CUSTOMER_SESSION_TTL_MS / 1000)}`
  ];
  if (COOKIE_SECURE) cookieParts.push("Secure");
  sendJson(res, status, body, { "Set-Cookie": cookieParts.join("; ") });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 500, "Unable to read requested page.");
      return;
    }
    send(res, 200, data, contentType);
  });
}

const publicFiles = new Map([
  ["/", ["public/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["public/index.html", "text/html; charset=utf-8"]],
  ["/shop.html", ["public/shop.html", "text/html; charset=utf-8"]],
  ["/recycling.html", ["public/recycling.html", "text/html; charset=utf-8"]],
  ["/app.js", ["public/js/app.js", "text/javascript; charset=utf-8"]],
  ["/js/app.js", ["public/js/app.js", "text/javascript; charset=utf-8"]],
  ["/js/index.js", ["public/js/index.js", "text/javascript; charset=utf-8"]],
  ["/css/styles.css", ["public/css/styles.css", "text/css; charset=utf-8"]],
  ["/css/index.css", ["public/css/index.css", "text/css; charset=utf-8"]],
  ["/images/zohd-mark.png", ["public/images/zohd-mark.png", "image/png"]],
  ["/public/images/zohd-mark.png", ["public/images/zohd-mark.png", "image/png"]],
  ["/public/images/zohd-logo.png", ["public/images/zohd-logo.png", "image/png"]],
  ["/images/products/kids-bamboo-toothbrush-lifestyle.png", ["public/images/products/kids-bamboo-toothbrush-lifestyle.png", "image/png"]],
  ["/images/products/kids-bamboo-toothbrush-set.png", ["public/images/products/kids-bamboo-toothbrush-set.png", "image/png"]],
  ["/images/products/kids-bamboo-toothbrush-front.png", ["public/images/products/kids-bamboo-toothbrush-front.png", "image/png"]],
  ["/images/products/kids-bamboo-toothbrush-size-guide.png", ["public/images/products/kids-bamboo-toothbrush-size-guide.png", "image/png"]],
  ["/images/products/zohd-oral-care-kit.png", ["public/images/products/zohd-oral-care-kit.png", "image/png"]],
  ["/images/products/family-bamboo-toothbrush-lifestyle.png", ["public/images/products/family-bamboo-toothbrush-lifestyle.png", "image/png"]],
  ["/images/products/family-bamboo-toothbrush-set.png", ["public/images/products/family-bamboo-toothbrush-set.png", "image/png"]],
  ["/images/products/family-bamboo-toothbrush-tray.png", ["public/images/products/family-bamboo-toothbrush-tray.png", "image/png"]],
  ["/images/products/family-bamboo-toothbrush-size-guide.png", ["public/images/products/family-bamboo-toothbrush-size-guide.png", "image/png"]],
  ["/images/products/family-bamboo-toothbrush-kit.png", ["public/images/products/family-bamboo-toothbrush-kit.png", "image/png"]],
  ["/images/adult-toothbrush.jpg", ["public/images/adult-toothbrush.jpg", "image/jpeg"]],
  ["/images/kids-toothbrush.jpg", ["public/images/kids-toothbrush.jpg", "image/jpeg"]],
  ["/images/neem-combo.jpg", ["public/images/neem-combo.jpg", "image/jpeg"]],
  ["/images/eco-notebook.jpg", ["public/images/eco-notebook.jpg", "image/jpeg"]]
]);

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    send(res, 400, "Bad request.");
    return;
  }

  if (req.method === "GET" && pathname === "/admin") {
    if (getSession(req)) {
      res.writeHead(303, { Location: "/admin/dashboard", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    serveFile(res, path.join(ROOT, "private", "admin-login.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.method === "POST" && pathname === "/admin/login") {
    const address = loginRateLimit(req, res);
    if (address === null) return;

    let credentials;
    try {
      credentials = await readJson(req);
    } catch (error) {
      send(res, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
      return;
    }

    const hasValidShape = credentials && typeof credentials.adminId === "string" && typeof credentials.password === "string";
    const adminIdMatches = safeEqual(hasValidShape ? credentials.adminId : "", ADMIN_ID);
    const passwordMatches = safeEqual(hasValidShape ? credentials.password : "", ADMIN_PASSWORD);
    if (!hasValidShape || !adminIdMatches || !passwordMatches) {
      send(res, 401, JSON.stringify({ error: "Invalid credentials." }), "application/json; charset=utf-8");
      return;
    }

    loginAttempts.delete(address);
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { expiresAt: now + SESSION_TTL_MS });
    const cookieParts = [
      `zohd_admin=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    ];
    if (COOKIE_SECURE) cookieParts.push("Secure");
    send(res, 204, "", "text/plain; charset=utf-8", { "Set-Cookie": cookieParts.join("; ") });
    return;
  }

  if (req.method === "POST" && pathname === "/admin/logout") {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    const clearCookie = `zohd_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
    send(res, 204, "", "text/plain; charset=utf-8", { "Set-Cookie": clearCookie });
    return;
  }

  if (req.method === "POST" && pathname === "/api/newsletter/subscribe") {
    const address = rateLimitAttempts(req, res, newsletterAttempts, "Too many subscription attempts. Please try again later.");
    if (address === null) return;

    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    const email = input && typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: "Enter a valid email address." });
      return;
    }
    if (!input || input.consent !== true) {
      sendJson(res, 400, { error: "Please confirm you agree to receive product updates." });
      return;
    }
    if (newsletterSubscribers.some(subscriber => subscriber.email === email)) {
      sendJson(res, 200, { message: "Subscription saved." });
      return;
    }

    try {
      saveNewsletterSubscribers([...newsletterSubscribers, {
        email,
        subscribedAt: new Date().toISOString()
      }]);
      newsletterAttempts.delete(address);
      sendJson(res, 201, { message: "Subscription saved." });
    } catch (error) {
      console.error("Failed to save newsletter subscription:", error);
      sendJson(res, 500, { error: "Unable to save your subscription. Please try again." });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/customer/register") {
    const address = rateLimitAttempts(req, res, customerAuthAttempts, "Too many account attempts. Please try again later.");
    if (address === null) return;

    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    const validation = validateCustomerRegistration(input);
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }
    if (customers.some(customer => customer.identifier === validation.customer.identifier)) {
      sendJson(res, 409, { error: "An account with that email or phone number already exists." });
      return;
    }

    try {
      const credentials = await hashCustomerPassword(validation.customer.password);
      if (customers.some(customer => customer.identifier === validation.customer.identifier)) {
        sendJson(res, 409, { error: "An account with that email or phone number already exists." });
        return;
      }
      const customer = {
        id: crypto.randomUUID(),
        name: validation.customer.name,
        identifier: validation.customer.identifier,
        address: validation.customer.address,
        location: validation.customer.location,
        salt: credentials.salt,
        passwordHash: credentials.passwordHash,
        createdAt: new Date().toISOString()
      };
      saveCustomers([...customers, customer]);
      customerAuthAttempts.delete(address);
      setCustomerSession(res, customer.id, 201, { customer: publicCustomer(customer) });
    } catch (error) {
      console.error("Failed to create customer account:", error);
      sendJson(res, 500, { error: "Unable to create the account. Please try again." });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/customer/login") {
    const address = rateLimitAttempts(req, res, customerAuthAttempts, "Too many account attempts. Please try again later.");
    if (address === null) return;

    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    const identifierInput = input && typeof input.identifier === "string" ? input.identifier : "";
    const password = input && typeof input.password === "string" ? input.password : "";
    const identifier = normalizeCustomerIdentifier(identifierInput);
    const customer = customers.find(account => account.identifier === identifier);
    let passwordMatches = false;
    if (customer && password.length <= 1024) {
      try {
        const credentials = await hashCustomerPassword(password, Buffer.from(customer.salt, "hex"));
        const storedHash = Buffer.from(customer.passwordHash, "hex");
        const suppliedHash = Buffer.from(credentials.passwordHash, "hex");
        passwordMatches = storedHash.length === suppliedHash.length && crypto.timingSafeEqual(storedHash, suppliedHash);
      } catch (error) {
        console.error("Failed to verify customer password:", error);
        sendJson(res, 500, { error: "Unable to sign in. Please try again." });
        return;
      }
    }
    if (!customer || !passwordMatches) {
      sendJson(res, 401, { error: "Email/phone or password is incorrect." });
      return;
    }

    customerAuthAttempts.delete(address);
    setCustomerSession(res, customer.id, 200, { customer: publicCustomer(customer) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/customer/me") {
    const session = getCustomerSession(req);
    const customer = session && customers.find(account => account.id === session.session.customerId);
    if (!customer) {
      sendJson(res, 401, { error: "Customer authentication required." });
      return;
    }
    sendJson(res, 200, { customer: publicCustomer(customer) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/customer/logout") {
    const session = getCustomerSession(req);
    if (session) customerSessions.delete(session.token);
    const clearCookie = `zohd_customer=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
    send(res, 204, "", "text/plain; charset=utf-8", { "Set-Cookie": clearCookie });
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    const session = getCustomerSession(req);
    const customer = session && customers.find(account => account.id === session.session.customerId);
    if (!customer) {
      sendJson(res, 401, { error: "Sign in to your customer account before placing an order." });
      return;
    }

    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    if (!input || typeof input !== "object" || Array.isArray(input)
      || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 20) {
      sendJson(res, 400, { error: "An order must contain between 1 and 20 cart items." });
      return;
    }

    const orderItems = [];
    const requestedQuantities = new Map();
    for (const item of input.items) {
      if (!item || typeof item !== "object" || !Number.isInteger(item.productId)
        || typeof item.variant !== "string" || !Number.isInteger(item.quantity)
        || item.quantity < 1 || item.quantity > 99) {
        sendJson(res, 400, { error: "Each order item needs a valid product, variant, and quantity from 1 to 99." });
        return;
      }

      const product = products.find(entry => entry.id === item.productId);
      if (!product || !product.variants.includes(item.variant)) {
        sendJson(res, 400, { error: "A product or variant in your bag is no longer available. Refresh the catalog and try again." });
        return;
      }
      if (product.stock !== "In Stock") {
        sendJson(res, 409, { error: `${product.name} is currently out of stock.` });
        return;
      }
      requestedQuantities.set(product.id, (requestedQuantities.get(product.id) || 0) + item.quantity);

      const lineTotal = Number((product.price * item.quantity).toFixed(2));
      if (!Number.isFinite(lineTotal) || lineTotal > 10000000) {
        sendJson(res, 400, { error: "The order total is outside the supported range." });
        return;
      }
      orderItems.push({
        productId: product.id,
        name: product.name,
        variant: item.variant,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal
      });
    }

    for (const [productId, requestedQuantity] of requestedQuantities) {
      const product = products.find(entry => entry.id === productId);
      if (Number.isInteger(product.quantity) && requestedQuantity > product.quantity) {
        sendJson(res, 409, { error: `Only ${product.quantity} ${product.name} item(s) are currently available.` });
        return;
      }
    }

    const subtotal = Number(orderItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
    if (!Number.isFinite(subtotal) || subtotal > 10000000) {
      sendJson(res, 400, { error: "The order total is outside the supported range." });
      return;
    }

    const order = {
      id: crypto.randomUUID(),
      orderNumber: `ZOHD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      customer: {
        id: customer.id,
        name: customer.name,
        identifier: customer.identifier,
        address: customer.address,
        location: customer.location
      },
      items: orderItems,
      subtotal,
      status: ORDER_STATUSES[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      saveOrders([order, ...orders]);
      sendJson(res, 201, { order });
    } catch (error) {
      console.error("Failed to save customer order:", error);
      sendJson(res, 500, { error: "Unable to save your order. Please try again." });
    }
    return;
  }

  if (pathname === "/api/admin/orders") {
    if (!requireAdmin(req, res)) return;
    if (req.method === "GET") {
      sendJson(res, 200, orders);
      return;
    }
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const orderStatusRoute = pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]+)\/status$/i);
  if (orderStatusRoute) {
    if (!requireAdmin(req, res)) return;
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    if (!input || typeof input.status !== "string" || !ORDER_STATUSES.includes(input.status)) {
      sendJson(res, 400, { error: "Choose a valid order status." });
      return;
    }

    const orderIndex = orders.findIndex(order => order.id === orderStatusRoute[1]);
    if (orderIndex === -1) {
      sendJson(res, 404, { error: "Order not found." });
      return;
    }

    const updatedOrder = {
      ...orders[orderIndex],
      status: input.status,
      updatedAt: new Date().toISOString()
    };
    try {
      const nextOrders = [...orders];
      nextOrders[orderIndex] = updatedOrder;
      saveOrders(nextOrders);
      sendJson(res, 200, updatedOrder);
    } catch (error) {
      console.error("Failed to update order status:", error);
      sendJson(res, 500, { error: "Unable to update the order status." });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/products") {
    sendJson(res, 200, products.map(({ quantity, ...product }) => product));
    return;
  }

  if (pathname === "/api/admin/products") {
    if (!requireAdmin(req, res)) return;

    if (req.method === "GET") {
      sendJson(res, 200, products);
      return;
    }

    if (req.method === "POST") {
      let input;
      try {
        input = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      const validation = validateProduct(input);
      if (validation.error) {
        sendJson(res, 400, { error: validation.error });
        return;
      }

      const product = {
        id: products.reduce((maxId, item) => Math.max(maxId, item.id), 0) + 1,
        ...validation.product
      };
      try {
        const nextProducts = [...products, product];
        saveProducts(nextProducts);
        sendJson(res, 201, product);
      } catch (error) {
        console.error("Failed to save product catalog:", error);
        sendJson(res, 500, { error: "Unable to save the product catalog." });
      }
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const productRoute = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productRoute) {
    if (!requireAdmin(req, res)) return;
    const productId = Number(productRoute[1]);
    const productIndex = products.findIndex(product => product.id === productId);
    if (productIndex === -1) {
      sendJson(res, 404, { error: "Product not found." });
      return;
    }

    if (req.method === "PUT") {
      let input;
      try {
        input = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      const validation = validateProduct(input);
      if (validation.error) {
        sendJson(res, 400, { error: validation.error });
        return;
      }

      const updatedProduct = { id: productId, ...validation.product };
      try {
        const nextProducts = [...products];
        nextProducts[productIndex] = updatedProduct;
        saveProducts(nextProducts);
        sendJson(res, 200, updatedProduct);
      } catch (error) {
        console.error("Failed to save product catalog:", error);
        sendJson(res, 500, { error: "Unable to save the product catalog." });
      }
      return;
    }

    if (req.method === "DELETE") {
      try {
        const nextProducts = products.filter(product => product.id !== productId);
        saveProducts(nextProducts);
        send(res, 204, "");
      } catch (error) {
        console.error("Failed to save product catalog:", error);
        sendJson(res, 500, { error: "Unable to save the product catalog." });
      }
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (req.method === "GET" && pathname === "/admin/dashboard") {
    if (!getSession(req)) {
      res.writeHead(303, { Location: "/admin", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    serveFile(res, path.join(ROOT, "private", "admin.html"), "text/html; charset=utf-8");
    return;
  }

  if (pathname === "/public/admin.html" || pathname === "/admin.html" || pathname === "/admin-login.html") {
    send(res, 404, "Not found.");
    return;
  }

  if (req.method !== "GET" || !publicFiles.has(pathname)) {
    send(res, 404, "Not found.");
    return;
  }

  const [relativePath, contentType] = publicFiles.get(pathname);
  serveFile(res, path.join(ROOT, relativePath), contentType);
});

server.listen(PORT, HOST, () => {
  console.log(`ZOHD storefront running at http://${HOST}:${PORT}`);
});
