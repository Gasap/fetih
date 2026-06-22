import crypto from "crypto";
import dotenv from "dotenv";
import express from "express";
import fs from "fs/promises";
import * as jose from "jose";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

const DOMAIN = process.env.DOMAIN || "localhost";
const JWT_ISSUER =
  DOMAIN === "localhost"
    ? "http://localhost:4000"
    : `https://${DOMAIN}/api-backend`;
const JWT_AUDIENCE = DOMAIN === "localhost" ? "localhost" : DOMAIN;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple cookie parser helper
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie || "";
  req.cookies = {};
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    if (parts.length === 2) {
      req.cookies[parts[0].trim()] = parts[1].trim();
    }
  });
  next();
});

// CORS headers
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Database helpers
const dbPath = path.join(__dirname, "db.json");
async function readDB() {
  try {
    const data = await fs.readFile(dbPath, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    const initial = { users: [], players: [] };
    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function writeDB(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

// Token helpers
function uuidToBase64url(uuid) {
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return jose.base64url.encode(bytes);
}

// Load or generate Ed25519 keys
let privateKey, publicKey;
const keysPath = path.join(__dirname, "keys.json");
async function loadKeys() {
  try {
    const keysData = JSON.parse(await fs.readFile(keysPath, "utf-8"));
    privateKey = await jose.importPKCS8(keysData.privateKey, "EdDSA");
    publicKey = await jose.importSPKI(keysData.publicKey, "EdDSA");
    console.log("Keys loaded successfully");
  } catch (e) {
    console.log("Generating new Ed25519 keypair...");
    const { privateKey: priv, publicKey: pub } = await jose.generateKeyPair(
      "Ed25519",
      { extractable: true },
    );
    privateKey = priv;
    publicKey = pub;
    const privatePem = await jose.exportPKCS8(privateKey);
    const publicPem = await jose.exportSPKI(publicKey);
    await fs.writeFile(
      keysPath,
      JSON.stringify({ privateKey: privatePem, publicKey: publicPem }, null, 2),
    );
  }
}
await loadKeys();

// Temporary login tokens map
const loginTokens = new Map();

// Helper to hash password
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Helper to authenticate admin
async function isAdminSession(req) {
  const userId = req.cookies["refresh_token"];
  if (!userId) return false;
  const db = await readDB();
  const user = db.users.find((u) => u.id === userId);
  return user && (user.role === "admin" || user.role === "root");
}

// Routes
app.get("/auth/login/discord", (req, res) => {
  const redirectUri = req.query.redirect_uri;
  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>İmparatorluk - Giriş Yap / Kayıt Ol</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1a1a22;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background-color: #242430;
            padding: 40px 30px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            width: 350px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.05);
          }
          h2 { margin-bottom: 25px; color: #ffcc00; font-size: 24px; font-weight: 800; }
          input {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border: 1px solid #3a3a4a;
            border-radius: 8px;
            background-color: #13131a;
            color: #fff;
            box-sizing: border-box;
            font-size: 15px;
            transition: border-color 0.3s;
          }
          input:focus {
            border-color: #ffcc00;
            outline: none;
          }
          button {
            width: 100%;
            padding: 14px;
            background-color: #ffcc00;
            color: #000;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 20px;
            font-size: 16px;
            transition: background-color 0.3s, transform 0.1s;
          }
          button:hover { background-color: #e5b800; }
          button:active { transform: scale(0.98); }
          .switch {
            margin-top: 25px;
            font-size: 14px;
            color: #ffcc00;
            cursor: pointer;
            text-decoration: none;
            font-weight: 600;
          }
          .switch:hover {
            text-decoration: underline;
          }
          .error { color: #ff4d4d; margin-top: 15px; font-size: 14px; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2 id="title">Giriş Yap</h2>
          <form id="form" method="POST" action="/api-backend/auth/login/submit">
            <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirectUri)}">
            <input type="hidden" id="action-type" name="action" value="login">
            <input type="text" name="username" placeholder="Kullanıcı Adı" required minlength="3" maxlength="20">
            <input type="password" name="password" placeholder="Şifre" required minlength="4">
            <button type="submit" id="btn">Giriş Yap</button>
          </form>
          <div class="switch" id="switch-btn" onclick="toggleForm()">Hesabın yok mu? Kayıt Ol</div>
          <div class="error" id="error-msg"></div>
        </div>
        <script>
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('error') === 'exists') {
            document.getElementById('error-msg').innerText = 'Bu kullanıcı adı zaten alınmış!';
          } else if (urlParams.get('error') === 'invalid') {
            document.getElementById('error-msg').innerText = 'Kullanıcı adı veya şifre hatalı!';
          }
          
          function toggleForm() {
            const title = document.getElementById('title');
            const action = document.getElementById('action-type');
            const btn = document.getElementById('btn');
            const switchBtn = document.getElementById('switch-btn');
            const errorMsg = document.getElementById('error-msg');
            errorMsg.innerText = '';
            
            if (action.value === 'login') {
              title.innerText = 'Kayıt Ol';
              action.value = 'register';
              btn.innerText = 'Kayıt Ol';
              switchBtn.innerText = 'Zaten hesabın var mı? Giriş Yap';
            } else {
              title.innerText = 'Giriş Yap';
              action.value = 'login';
              btn.innerText = 'Giriş Yap';
              switchBtn.innerText = 'Hesabın yok mu? Kayıt Ol';
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Alias for Google login
app.get("/auth/login/google", (req, res) => {
  res.redirect(
    `/api-backend/auth/login/discord?redirect_uri=${req.query.redirect_uri}`,
  );
});

app.post("/auth/login/submit", async (req, res) => {
  const { action, username, password, redirect_uri } = req.body;
  const decodedRedirectUri = decodeURIComponent(redirect_uri);
  const db = await readDB();

  if (action === "register") {
    const existing = db.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (existing) {
      return res.redirect(
        `/api-backend/auth/login/discord?error=exists&redirect_uri=${redirect_uri}`,
      );
    }

    const userId = crypto.randomUUID();
    const publicId = crypto.randomUUID();

    // Default to admin role if username is admin
    let role = null;
    if (username.toLowerCase() === "admin") {
      role = "admin";
    }

    const newUser = {
      id: userId,
      username,
      passwordHash: hashPassword(password),
      email: `${username.toLowerCase()}@imparatorluk.online`,
      publicId,
      role,
    };

    const newPlayer = {
      publicId,
      adfree: false,
      flares: [],
      achievements: { singleplayerMap: [] },
      friends: [],
      subscription: null,
      currency: { soft: 1000, hard: 100 },
    };

    db.users.push(newUser);
    db.players.push(newPlayer);
    await writeDB(db);

    // Create login token and redirect
    const loginToken = crypto.randomUUID();
    loginTokens.set(loginToken, newUser);
    return res.redirect(
      `${decodedRedirectUri}#token-login?token-login=${loginToken}`,
    );
  } else {
    // Login
    const user = db.users.find(
      (u) =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.passwordHash === hashPassword(password),
    );
    if (!user) {
      return res.redirect(
        `/api-backend/auth/login/discord?error=invalid&redirect_uri=${redirect_uri}`,
      );
    }

    const loginToken = crypto.randomUUID();
    loginTokens.set(loginToken, user);
    return res.redirect(
      `${decodedRedirectUri}#token-login?token-login=${loginToken}`,
    );
  }
});

app.get("/auth/login/token", async (req, res) => {
  const loginToken = req.query["login-token"];
  const user = loginTokens.get(loginToken);
  if (!user) {
    return res.status(401).json({ error: "Invalid login token" });
  }

  loginTokens.delete(loginToken);

  res.setHeader(
    "Set-Cookie",
    `refresh_token=${user.id}; Path=/api-backend; HttpOnly; Max-Age=2592000; SameSite=Lax`,
  );
  res.json({ email: user.email });
});

app.post("/auth/refresh", async (req, res) => {
  const userId = req.cookies["refresh_token"];
  if (!userId) {
    return res.status(401).json({ error: "No refresh token" });
  }

  const db = await readDB();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  // Issue new short-lived JWT (15 mins) signed with Ed25519
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    jti: crypto.randomUUID(),
    sub: uuidToBase64url(user.publicId),
    role: user.role,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  })
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt(now)
    .setExpirationTime(now + 900) // 15 mins
    .sign(privateKey);

  res.json({ jwt, expiresIn: 900 });
});

app.post("/auth/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `refresh_token=; Path=/api-backend; HttpOnly; Max-Age=0; SameSite=Lax`,
  );
  res.json({ success: true });
});

app.get("/.well-known/jwks.json", async (req, res) => {
  const jwk = await jose.exportJWK(publicKey);
  jwk.kid = "key-1";
  jwk.alg = "EdDSA";
  res.json({ keys: [jwk] });
});

app.get("/users/@me", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const hex = jose.base64url.decode(payload.sub);
    const bytesHex = Array.from(hex)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const uuid = [
      bytesHex.slice(0, 8),
      bytesHex.slice(8, 12),
      bytesHex.slice(12, 16),
      bytesHex.slice(16, 20),
      bytesHex.slice(20),
    ].join("-");

    const db = await readDB();
    const user = db.users.find((u) => u.publicId === uuid);
    const player = db.players.find((p) => p.publicId === uuid);

    if (!user || !player) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        email: user.email,
      },
      player: {
        publicId: player.publicId,
        adfree: player.adfree || false,
        flares: player.flares || [],
        achievements: player.achievements || { singleplayerMap: [] },
        friends: player.friends || [],
        subscription: player.subscription || null,
        currency: player.currency || { soft: 1000, hard: 100 },
        clans: [],
        clanRequests: [],
      },
    });
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

app.get("/player/:playerId", async (req, res) => {
  const db = await readDB();
  const player = db.players.find((p) => p.publicId === req.params.playerId);
  const user = db.users.find((u) => u.publicId === req.params.playerId);

  if (!player || !user) {
    return res.status(404).json({ error: "Player not found" });
  }

  res.json({
    createdAt: new Date().toISOString(),
    user: {
      id: user.id,
      username: user.username,
      avatar: null,
      discriminator: "0000",
    },
    games: [],
    stats: {},
  });
});

app.get("/news.json", (req, res) => {
  res.json([
    {
      id: "news-1",
      title: "İmparatorluk Online Başladı!",
      description: "Sunucumuz başarıyla aktif edildi. Keyifli oyunlar!",
      type: "announcement",
    },
  ]);
});

app.get("/leaderboard/ranked", (req, res) => {
  res.json({
    oneVone: [],
  });
});

// Admin Panel Dashboard Route
app.get("/admin", async (req, res) => {
  const isAuthorized = await isAdminSession(req);
  if (!isAuthorized) {
    return res
      .status(403)
      .send(
        "<h1>403 Forbidden - Bu panele yalnizca admin yetkisi olan hesaplar girebilir.</h1>",
      );
  }

  const db = await readDB();

  let userRows = "";
  for (const user of db.users) {
    const player = db.players.find((p) => p.publicId === user.publicId) || {};
    const soft = player.currency?.soft ?? 0;
    const hard = player.currency?.hard ?? 0;
    userRows += `
      <tr>
        <td>${user.username}</td>
        <td>${user.role || "user"}</td>
        <td>${soft} Altın / ${hard} Elmas</td>
        <td>
          <form style="display:inline" method="POST" action="/api-backend/admin/update">
            <input type="hidden" name="userId" value="${user.id}">
            <select name="role">
              <option value="user" ${user.role !== "admin" ? "selected" : ""}>Kullanıcı</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
            </select>
            <input type="number" name="soft" placeholder="Altın" style="width:70px; padding:4px;" value="${soft}">
            <input type="number" name="hard" placeholder="Elmas" style="width:70px; padding:4px;" value="${hard}">
            <button type="submit" class="btn btn-save">Güncelle</button>
          </form>
          <form style="display:inline" method="POST" action="/api-backend/admin/delete" onsubmit="return confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')">
            <input type="hidden" name="userId" value="${user.id}">
            <button type="submit" class="btn btn-delete">Sil</button>
          </form>
        </td>
      </tr>
    `;
  }

  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <title>İmparatorluk - Yönetim Paneli</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #141419;
            color: #e2e2e7;
            margin: 0;
            padding: 40px;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background-color: #1e1e24;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.05);
          }
          h1 { color: #ffcc00; font-weight: 800; font-size: 28px; margin-bottom: 20px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #2e2e38;
          }
          th {
            background-color: #24242e;
            color: #ffcc00;
            font-weight: 700;
          }
          tr:hover { background-color: rgba(255,255,255,0.02); }
          .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            font-size: 13px;
          }
          .btn-save { background-color: #ffcc00; color: #000; margin-left: 5px; }
          .btn-save:hover { background-color: #e5b800; }
          .btn-delete { background-color: #ff4d4d; color: #fff; margin-left: 5px; }
          .btn-delete:hover { background-color: #e60000; }
          select, input {
            background-color: #141419;
            color: #fff;
            border: 1px solid #3e3e4a;
            border-radius: 4px;
            padding: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>İmparatorluk Yönetim Paneli</h1>
          <p>Sitenizdeki kayıtlı kullanıcıları buradan yönetebilir, yetki verebilir veya market paralarını güncelleyebilirsiniz.</p>
          <table>
            <thead>
              <tr>
                <th>Kullanıcı Adı</th>
                <th>Rolü</th>
                <th>Bakiye</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              ${userRows}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `);
});

// Update user details
app.post("/admin/update", async (req, res) => {
  const isAuthorized = await isAdminSession(req);
  if (!isAuthorized) return res.status(403).send("Unauthorized");

  const { userId, role, soft, hard } = req.body;
  const db = await readDB();

  const user = db.users.find((u) => u.id === userId);
  if (user) {
    user.role = role === "admin" ? "admin" : null;
    const player = db.players.find((p) => p.publicId === user.publicId);
    if (player) {
      player.currency = {
        soft: parseInt(soft) || 0,
        hard: parseInt(hard) || 0,
      };
    }
    await writeDB(db);
  }

  res.redirect("/api-backend/admin");
});

// Delete/Ban user
app.post("/admin/delete", async (req, res) => {
  const isAuthorized = await isAdminSession(req);
  if (!isAuthorized) return res.status(403).send("Unauthorized");

  const { userId } = req.body;
  const db = await readDB();

  const userIndex = db.users.findIndex((u) => u.id === userId);
  if (userIndex !== -1) {
    const user = db.users[userIndex];
    db.users.splice(userIndex, 1);

    const playerIndex = db.players.findIndex(
      (p) => p.publicId === user.publicId,
    );
    if (playerIndex !== -1) {
      db.players.splice(playerIndex, 1);
    }

    await writeDB(db);
  }

  res.redirect("/api-backend/admin");
});

app.listen(PORT, () => {
  console.log(`API Backend Server running on port ${PORT}`);
});
