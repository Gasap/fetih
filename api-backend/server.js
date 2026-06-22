import express from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import * as jose from "jose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3003;

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
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
    const { privateKey: priv, publicKey: pub } = await jose.generateKeyPair("Ed25519");
    privateKey = priv;
    publicKey = pub;
    const privatePem = await jose.exportPKCS8(privateKey);
    const publicPem = await jose.exportSPKI(publicKey);
    await fs.writeFile(keysPath, JSON.stringify({ privateKey: privatePem, publicKey: publicPem }, null, 2));
  }
}
await loadKeys();

// Temporary login tokens map
const loginTokens = new Map();

// Helper to hash password
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
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
            background-color: #1e1e24;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background-color: #2d2d38;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            width: 320px;
            text-align: center;
          }
          h2 { margin-bottom: 20px; color: #ffcc00; }
          input {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
            border: 1px solid #444;
            border-radius: 6px;
            background-color: #1a1a22;
            color: #fff;
            box-sizing: border-box;
          }
          button {
            width: 100%;
            padding: 12px;
            background-color: #ffcc00;
            color: #000;
            border: none;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 15px;
            font-size: 16px;
          }
          button:hover { background-color: #e5b800; }
          .switch {
            margin-top: 20px;
            font-size: 14px;
            color: #aaa;
            cursor: pointer;
            text-decoration: underline;
          }
          .error { color: #ff3333; margin-top: 10px; font-size: 14px; }
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

// Alias for Google login as well
app.get("/auth/login/google", (req, res) => {
  res.redirect(`/api-backend/auth/login/discord?redirect_uri=${req.query.redirect_uri}`);
});

app.post("/auth/login/submit", async (req, res) => {
  const { action, username, password, redirect_uri } = req.body;
  const decodedRedirectUri = decodeURIComponent(redirect_uri);
  const db = await readDB();

  if (action === "register") {
    const existing = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (existing) {
      return res.redirect(`/api-backend/auth/login/discord?error=exists&redirect_uri=${redirect_uri}`);
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
      role
    };

    const newPlayer = {
      publicId,
      adfree: false,
      flares: [],
      achievements: { singleplayerMap: [] },
      friends: [],
      subscription: null
    };

    db.users.push(newUser);
    db.players.push(newPlayer);
    await writeDB(db);

    // Create login token and redirect
    const loginToken = crypto.randomUUID();
    loginTokens.set(loginToken, newUser);
    return res.redirect(`${decodedRedirectUri}#token-login?token-login=${loginToken}`);
  } else {
    // Login
    const user = db.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.passwordHash === hashPassword(password)
    );
    if (!user) {
      return res.redirect(`/api-backend/auth/login/discord?error=invalid&redirect_uri=${redirect_uri}`);
    }

    const loginToken = crypto.randomUUID();
    loginTokens.set(loginToken, user);
    return res.redirect(`${decodedRedirectUri}#token-login?token-login=${loginToken}`);
  }
});

app.get("/auth/login/token", async (req, res) => {
  const loginToken = req.query["login-token"];
  const user = loginTokens.get(loginToken);
  if (!user) {
    return res.status(401).json({ error: "Invalid login token" });
  }

  // Delete single-use login token
  loginTokens.delete(loginToken);

  // Set HTTP-only cookie with refresh token
  const refreshToken = crypto.randomUUID();
  // Save refresh token in database or memory (we will save in memory simple Map for simplicity)
  // Store session mapping
  res.setHeader(
    "Set-Cookie",
    `refresh_token=${user.id}; Path=/api-backend; HttpOnly; Max-Age=2592000; SameSite=Lax`
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
    iss: `https://imparatorluk.online/api-backend`,
    aud: `imparatorluk.online`,
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
    `refresh_token=; Path=/api-backend; HttpOnly; Max-Age=0; SameSite=Lax`
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
      issuer: `https://imparatorluk.online/api-backend`,
      audience: `imparatorluk.online`,
    });

    const publicId = uuidToBase64url(payload.sub); // Wait, sub is already parsed or is it in base64url?
    // Let's resolve the UUID from sub.
    // In our TokenPayloadSchema: sub gets transformed back to UUID.
    // So payload.sub is actually the raw UUID or the base64url.
    // jose.jwtVerify will return payload as-is. So sub is the base64url string.
    // Let's convert it back to UUID to lookup in our DB.
    const hex = jose.base64url.decode(payload.sub);
    const bytesHex = Array.from(hex).map((b) => b.toString(16).padStart(2, "0")).join("");
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
        username: user.username
      },
      player: {
        publicId: player.publicId,
        adfree: player.adfree,
        flares: player.flares || [],
        achievements: player.achievements || { singleplayerMap: [] },
        friends: player.friends || [],
        subscription: player.subscription
      }
    });
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// Fallback profile endpoint
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
      discriminator: "0000"
    },
    games: [],
    stats: {}
  });
});

app.get("/news.json", (req, res) => {
  res.json([
    {
      id: "news-1",
      title: "İmparatorluk Online Başladı!",
      description: "Sunucumuz başarıyla aktif edildi. Keyifli oyunlar!",
      type: "announcement"
    }
  ]);
});

app.get("/leaderboard/ranked", (req, res) => {
  res.json({
    oneVone: []
  });
});

app.listen(PORT, () => {
  console.log(`API Backend Server running on port ${PORT}`);
});
