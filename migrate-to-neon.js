"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { neon } = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL before importing local customer, order, and newsletter data.");
}

const root = path.join(__dirname, "..");
const sql = neon(process.env.DATABASE_URL);
const readArray = filename => {
  const result = JSON.parse(fs.readFileSync(path.join(root, "data", filename), "utf8"));
  if (!Array.isArray(result)) throw new Error(`data/${filename} must contain a JSON array.`);
  return result;
};

async function migrate() {
  const customers = readArray("customers.json");
  const orders = readArray("orders.json");
  const subscribers = readArray("newsletter-subscribers.json");

  await sql`CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY,
    identifier text NOT NULL UNIQUE,
    data jsonb NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    status text NOT NULL,
    data jsonb NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email text PRIMARY KEY,
    subscribed_at timestamptz NOT NULL
  )`;

  for (const customer of customers) {
    await sql`INSERT INTO customers (id, identifier, data)
      VALUES (${customer.id}, ${customer.identifier}, ${JSON.stringify(customer)}::jsonb)
      ON CONFLICT (identifier) DO NOTHING`;
  }
  for (const order of orders) {
    await sql`INSERT INTO orders (id, created_at, status, data)
      VALUES (${order.id}, ${order.createdAt}, ${order.status}, ${JSON.stringify(order)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  }
  for (const subscriber of subscribers) {
    await sql`INSERT INTO newsletter_subscribers (email, subscribed_at)
      VALUES (${subscriber.email}, ${subscriber.subscribedAt})
      ON CONFLICT (email) DO NOTHING`;
  }

  console.log(`Imported ${customers.length} customer accounts, ${orders.length} orders, and ${subscribers.length} newsletter subscribers.`);
}

migrate().catch(error => {
  console.error("Data import failed:", error.message);
  process.exitCode = 1;
});
