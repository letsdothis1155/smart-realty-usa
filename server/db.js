/**
 * Simple JSON file user store.
 * Swap for Neon Postgres later without changing the auth routes much.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

function readUsers() {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.users) ? data.users : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureStore();
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ users, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

function findByEmail(email) {
  const norm = String(email || "").trim().toLowerCase();
  return readUsers().find((u) => u.email === norm) || null;
}

function findById(id) {
  return readUsers().find((u) => u.id === id) || null;
}

function createUser({ name, email, passwordHash }) {
  const users = readUsers();
  const norm = String(email).trim().toLowerCase();
  if (users.some((u) => u.email === norm)) {
    const err = new Error("Email already registered");
    err.code = "EMAIL_TAKEN";
    throw err;
  }
  const user = {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || "").trim().slice(0, 80),
    email: norm,
    passwordHash,
    createdAt: new Date().toISOString(),
    role: "member",
  };
  users.push(user);
  writeUsers(users);
  return publicUser(user);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "member",
    createdAt: user.createdAt,
  };
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  publicUser,
  readUsers,
};
