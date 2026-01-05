// ==============================
// NomNom Server (Updated for New Database)
// ==============================

// ===== Core framework (HTTP API) =====
const express = require('express');              // Express: tạo API server
const http = require('http');                    // HTTP server: để gắn Socket.IO chung port
const cors = require('cors');                    // CORS: cho phép app mobile gọi API
const sql = require('mssql');                    // MSSQL: kết nối SQL Server
const bcrypt = require('bcryptjs');              // bcrypt: hash/compare password
const jwt = require('jsonwebtoken');             // JWT: tạo/verify token
const { Server } = require('socket.io');         // Socket.IO: realtime events

// ===== File system + upload =====
const path = require('path');                    // path: xử lý đường dẫn an toàn
const fs = require('fs');                        // fs: tạo thư mục uploads nếu chưa có
const multer = require('multer');                // multer: nhận multipart/form-data (upload ảnh)

const app = express();
const server = http.createServer(app);

// ==============================
// 1. CẤU HÌNH SOCKET.IO
// ==============================
// Socket server chạy chung với HTTP server (cùng PORT)
// CORS mở cho mọi origin để app (emulator/device) kết nối dễ dàng
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Lắng nghe kết nối realtime
io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);

    // Khi user ngắt kết nối
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// ==============================
// 2. CONFIG CHUNG
// ==============================
const PORT = process.env.PORT || 3000;

// JWT_SECRET: nên đưa ra env trong production (không hardcode)
// Ở dev/demo vẫn chạy được như hiện tại
const JWT_SECRET = 'nomnom_secret_change_me';

// Middleware chung
app.use(cors());                                 // Cho phép gọi API từ app
app.use(express.json());                         // Parse JSON body
app.use(express.urlencoded({ extended: true })); // ✅ an toàn cho body text

// ✅ phục vụ ảnh upload
// Khi lưu AvatarUrl dạng /uploads/... thì client load trực tiếp qua API_BASE + AvatarUrl
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==============================
// 3. SQL SERVER CONFIG
// ==============================
// dbConfig: thông tin kết nối SQL Server (user/pass/db)
// options.trustServerCertificate: tiện cho local dev
const dbConfig = {
    user: 'nomnom',
    password: '123456',
    server: 'localhost',
    database: 'NomNomDB',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
};

let poolPromise;

// getPool(): tạo pool một lần và tái sử dụng (tránh connect lại liên tục)
// poolPromise sẽ cache connection pool để các request sau dùng chung
async function getPool() {
    if (!poolPromise) {
        console.log('Connecting to SQL Server...');
        poolPromise = sql
            .connect(dbConfig)
            .then((pool) => {
                console.log('✅ Connected to SQL Server successfully!');
                return pool;
            })
            .catch((err) => {
                console.error('❌ Database Connection Failed!', err);
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

// ==============================
// 4. AUTH MIDDLEWARE
// ==============================
// authRequired:
// - Yêu cầu Authorization: Bearer <token>
// - Verify token -> gán req.user = payload (có userId, role)
function authRequired(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// authOptional:
// - Nếu có token thì decode để dùng (vd: IsLiked trong /recipes)
// - Nếu không có token vẫn cho request chạy bình thường
function authOptional(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = payload;
        } catch { }
    }
    next();
}

// adminOnly:
// - Chặn các API tạo/sửa/xóa recipes nếu role không phải admin
function adminOnly(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
}

// ==============================
// UPLOAD AVATAR CONFIG
// ==============================
// AVATAR_DIR: nơi lưu file avatar (uploads/avatars)
// mkdirSync recursive để đảm bảo folder luôn tồn tại
const AVATAR_DIR = path.join(__dirname, 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

// storage:
// - destination: folder lưu file
// - filename: đặt tên file theo userId + timestamp để tránh trùng
// Lưu ý: filename đang dùng req.user?.userId => yêu cầu authRequired chạy trước upload.single
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '.jpg');
        const userId = req.user?.userId || 'u';
        cb(null, `u${userId}_${Date.now()}${ext}`);
    },
});

// upload:
// - limits: giới hạn dung lượng ảnh 3MB
// - fileFilter: chỉ nhận jpeg/jpg/png/webp
const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
    fileFilter: (req, file, cb) => {
        const ok = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype);
        cb(ok ? null : new Error('File không phải ảnh hợp lệ'), ok);
    },
});

// ==============================
// 5. ROUTES (API)
// ==============================
// Root check: verify server up
app.get('/', (req, res) => res.send('NomNom API Updated & Running! 🚀'));

// --- AUTH ---
// Register:
// - Check email tồn tại
// - Hash password
// - Insert user
// - Trả token + user tối giản
app.post('/auth/register', async (req, res) => {
    const { email, password, fullName } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email/Pass required' });

    try {
        const pool = await getPool();

        const exists = await pool
            .request()
            .input('email', sql.NVarChar, email)
            .query('SELECT Id FROM Users WHERE Email = @email');

        if (exists.recordset.length > 0) return res.status(409).json({ error: 'Email exists' });

        const hash = await bcrypt.hash(password, 10);

        const result = await pool
            .request()
            .input('email', sql.NVarChar, email)
            .input('hash', sql.NVarChar, hash)
            .input('fullName', sql.NVarChar, fullName || null)
            .query(
                `INSERT INTO Users (Email, PasswordHash, FullName)
         OUTPUT INSERTED.Id, INSERTED.Role
         VALUES (@email, @hash, @fullName)`
            );

        const u = result.recordset[0];
        const token = jwt.sign({ userId: u.Id, role: u.Role }, JWT_SECRET, { expiresIn: '7d' });

        // ✅ giữ nguyên theo yêu cầu: không cần trả thêm các cột khác
        res.json({ token, user: { id: u.Id, email, role: u.Role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login:
// - Tìm user theo email
// - Compare password
// - Trả token + user (kèm fullName/phone/address/avatarUrl)
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const pool = await getPool();
        const result = await pool
            .request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Users WHERE Email = @email');

        if (result.recordset.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = result.recordset[0];
        const ok = await bcrypt.compare(password, user.PasswordHash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.Id, role: user.Role }, JWT_SECRET, { expiresIn: '7d' });

        // ✅ giữ nguyên theo yêu cầu
        res.json({
            token,
            user: {
                id: user.Id,
                email: user.Email,
                role: user.Role,
                fullName: user.FullName,
                phone: user.Phone,          // ✅ Thêm cái này
                address: user.Address,      // ✅ Thêm cái này
                avatarUrl: user.AvatarUrl   // ✅ Thêm cái này
            },
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// --- UPDATE PROFILE (me) ---
// Nhận JSON hoặc multipart/form-data (có file avatar)
// Middleware order quan trọng:
// - authRequired: gắn req.user để multer filename dùng được userId
// - upload.single('avatar'): parse file (nếu có) + body fields
app.put('/auth/me', authRequired, upload.single('avatar'), async (req, res) => {
    try {
        const pool = await getPool();
        const userId = req.user.userId;

        const fullName = (req.body?.fullName || '').trim();
        const phone = (req.body?.phone || '').trim();
        const address = (req.body?.address || '').trim();

        // fullName bắt buộc (theo logic client InforUser)
        if (!fullName) return res.status(400).json({ error: 'fullName is required' });

        // Lưu dạng relative path: /uploads/avatars/xxx.jpg
        // Client sẽ ghép API_BASE + avatarUrl để load ảnh
        let avatarUrl = null;
        if (req.file?.filename) {
            avatarUrl = `/uploads/avatars/${req.file.filename}`;
        }

        // COALESCE(@AvatarUrl, AvatarUrl):
        // - Nếu không upload ảnh -> giữ avatar cũ
        // - Nếu có ảnh mới -> cập nhật AvatarUrl
        await pool
            .request()
            .input('Id', sql.Int, userId)
            .input('FullName', sql.NVarChar, fullName)
            .input('Phone', sql.NVarChar, phone || null)
            .input('Address', sql.NVarChar, address || null)
            .input('AvatarUrl', sql.NVarChar, avatarUrl)
            .query(`
        UPDATE Users
        SET
          FullName = @FullName,
          Phone = @Phone,
          Address = @Address,
          AvatarUrl = COALESCE(@AvatarUrl, AvatarUrl),
          UpdatedAt = SYSDATETIME()
        WHERE Id = @Id
      `);

        // Trả về user mới nhất để client updateUserLocal() + refresh avatar ngay
        const result = await pool
            .request()
            .input('Id', sql.Int, userId)
            .query(`
        SELECT
          Id as id,
          Email as email,
          Role as role,
          FullName as fullName,
          Phone as phone,
          Address as address,
          AvatarUrl as avatarUrl
        FROM Users
        WHERE Id = @Id
      `);

        return res.json({ user: result.recordset[0] });
    } catch (err) {
        console.error('PUT /auth/me error:', err);
        return res.status(500).json({ error: err.message || 'Server error' });
    }
});

// --- RECIPES: GET ALL ---
// authOptional: nếu có token thì join Favorites để trả IsLiked đúng theo user
app.get('/recipes', authOptional, async (req, res) => {
    try {
        const pool = await getPool();
        const currentUserId = req.user ? req.user.userId : 0;

        // Query:
        // - Lấy list recipe
        // - OUTER APPLY: lấy 1 ảnh đầu tiên (TOP 1) làm cover ImageUrl
        // - LEFT JOIN Favorites theo UserId: set IsLiked = 1/0
        const query = `
      SELECT 
        r.RecipeId, r.Name, r.Category, r.SubCategory,
        r.Description, r.TimeMinutes, r.Calories, 
        r.Servings, r.AverageRating, r.TotalLikes,
        r.VideoUrl,
        img.ImageUrl,
        CASE WHEN f.UserId IS NOT NULL THEN 1 ELSE 0 END AS IsLiked
      FROM Recipes r
      OUTER APPLY (
        SELECT TOP 1 ImageUrl 
        FROM RecipeImages 
        WHERE RecipeId = r.RecipeId 
        ORDER BY ImageId ASC
      ) img
      LEFT JOIN Favorites f ON r.RecipeId = f.RecipeId AND f.UserId = @UserId
      ORDER BY r.RecipeId DESC
    `;

        const result = await pool.request().input('UserId', sql.Int, currentUserId).query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('GET /recipes ERROR:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// --- RECIPES: GET DETAIL (UPDATED) ---
// Trả chi tiết:
// - Recipes row
// - images: RecipeImages
// - ingredients: RecipeIngredients
// - steps: RecipeSteps (order theo StepNumber)
app.get('/recipes/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const pool = await getPool();

        const recipe = await pool.request().input('id', sql.Int, id).query('SELECT * FROM Recipes WHERE RecipeId = @id');
        if (!recipe.recordset.length) return res.status(404).json({ error: 'Not found' });

        const images = await pool.request().input('id', sql.Int, id).query('SELECT ImageId, ImageUrl FROM RecipeImages WHERE RecipeId=@id');
        const ingredients = await pool.request().input('id', sql.Int, id).query('SELECT IngredientId, Ingredient FROM RecipeIngredients WHERE RecipeId=@id');
        const steps = await pool.request().input('id', sql.Int, id).query('SELECT StepId, StepNumber, Instruction FROM RecipeSteps WHERE RecipeId=@id ORDER BY StepNumber');

        res.json({
            ...recipe.recordset[0],
            images: images.recordset,
            ingredients: ingredients.recordset,
            steps: steps.recordset,
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// --- FAVORITES: TOGGLE LIKE (NEW) ---
// Toggle logic:
// - Nếu đã tồn tại Favorites row: DELETE + TotalLikes - 1
// - Nếu chưa tồn tại: INSERT + TotalLikes + 1
// Lưu ý: TotalLikes tăng/giảm trực tiếp trong DB (client có thể optimistic UI)
app.post('/favorites', authRequired, async (req, res) => {
    const { recipeId } = req.body;
    const userId = req.user.userId;

    try {
        const pool = await getPool();

        const check = await pool
            .request()
            .input('UserId', sql.Int, userId)
            .input('RecipeId', sql.Int, recipeId)
            .query('SELECT * FROM Favorites WHERE UserId = @UserId AND RecipeId = @RecipeId');

        if (check.recordset.length > 0) {
            await pool
                .request()
                .input('UserId', sql.Int, userId)
                .input('RecipeId', sql.Int, recipeId)
                .query('DELETE FROM Favorites WHERE UserId = @UserId AND RecipeId = @RecipeId');

            await pool.request().input('Id', sql.Int, recipeId).query('UPDATE Recipes SET TotalLikes = TotalLikes - 1 WHERE RecipeId = @Id');

            res.json({ status: 'unliked', message: 'Đã bỏ thích' });
        } else {
            await pool
                .request()
                .input('UserId', sql.Int, userId)
                .input('RecipeId', sql.Int, recipeId)
                .query('INSERT INTO Favorites (UserId, RecipeId) VALUES (@UserId, @RecipeId)');

            await pool.request().input('Id', sql.Int, recipeId).query('UPDATE Recipes SET TotalLikes = TotalLikes + 1 WHERE RecipeId = @Id');

            res.json({ status: 'liked', message: 'Đã thích' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN ROUTES (CREATE/UPDATE/DELETE) ---
// Các route dưới đây yêu cầu:
// - authRequired: có token
// - adminOnly: role admin
// Đồng thời bắn socket event để client cập nhật realtime
app.post('/recipes', authRequired, adminOnly, async (req, res) => {
    const { name, category, subCategory, description, timeMinutes, calories, servings, videoUrl, imageUrl } = req.body;
    try {
        const pool = await getPool();
        const result = await pool
            .request()
            .input('Name', sql.NVarChar, name)
            .input('Category', sql.NVarChar, category)
            .input('SubCategory', sql.NVarChar, subCategory)
            .input('Description', sql.NVarChar, description)
            .input('TimeMinutes', sql.Int, timeMinutes)
            .input('Calories', sql.Int, calories)
            .input('Servings', sql.Int, servings || 2)
            .input('VideoUrl', sql.NVarChar, videoUrl)
            .input('ImageUrl', sql.NVarChar, imageUrl)
            .query(
                `INSERT INTO Recipes (Name, Category, SubCategory, Description, TimeMinutes, Calories, Servings, VideoUrl, ImageUrl)
         OUTPUT INSERTED.RecipeId
         VALUES (@Name, @Category, @SubCategory, @Description, @TimeMinutes, @Calories, @Servings, @VideoUrl, @ImageUrl)`
            );

        // Socket event: báo client có món mới
        io.emit('new_recipe', { message: `Món mới: ${name}`, id: result.recordset[0].RecipeId });
        res.json({ id: result.recordset[0].RecipeId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/recipes/:id', authRequired, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    const { name, category, subCategory, description, timeMinutes, calories, servings, videoUrl, imageUrl } = req.body;

    try {
        const pool = await getPool();
        await pool
            .request()
            .input('id', sql.Int, id)
            .input('Name', sql.NVarChar, name)
            .input('Category', sql.NVarChar, category)
            .input('SubCategory', sql.NVarChar, subCategory)
            .input('Description', sql.NVarChar, description)
            .input('TimeMinutes', sql.Int, timeMinutes)
            .input('Calories', sql.Int, calories)
            .input('Servings', sql.Int, servings)
            .input('VideoUrl', sql.NVarChar, videoUrl)
            .input('ImageUrl', sql.NVarChar, imageUrl)
            .query(
                `UPDATE Recipes
         SET Name=COALESCE(@Name,Name),
             Category=COALESCE(@Category,Category),
             SubCategory=COALESCE(@SubCategory,SubCategory),
             Description=COALESCE(@Description,Description),
             TimeMinutes=COALESCE(@TimeMinutes,TimeMinutes),
             Calories=COALESCE(@Calories,Calories),
             Servings=COALESCE(@Servings,Servings),
             VideoUrl=COALESCE(@VideoUrl,VideoUrl),
             ImageUrl=COALESCE(@ImageUrl,ImageUrl)
         WHERE RecipeId=@id`
            );

        // Socket event: báo client recipe vừa được update
        io.emit('recipe_updated', { message: 'Món ăn đã cập nhật', recipeId: id });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/recipes/:id', authRequired, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const pool = await getPool();
        await pool.request().input('id', sql.Int, id).query('DELETE FROM Recipes WHERE RecipeId=@id');

        // Socket event: báo client recipe đã bị xóa
        io.emit('recipe_deleted', { recipeId: id });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==============================
// 5.5 MULTER ERROR HANDLER (QUAN TRỌNG)
// ==============================
// Handler này phải đặt SAU routes dùng multer
// - Bắt MulterError (vd: file quá lớn)
// - Bắt Error thường (vd: sai mimetype do fileFilter throw)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
    }
    if (err) {
        return res.status(400).json({ error: err.message || 'Upload error' });
    }
    next();
});

// ==============================
// 6. START SERVER
// ==============================
// Start HTTP server (kèm Socket.IO)
server.listen(PORT, () => {
    console.log(`✅ NomNom API running on http://localhost:${PORT}`);
});
