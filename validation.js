"use strict";

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

module.exports = { normalizeCustomerIdentifier, validateCustomerRegistration, validateProduct };
