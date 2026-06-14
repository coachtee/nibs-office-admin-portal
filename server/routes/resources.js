const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth, requireCap, audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB || 15)) * 1024 * 1024 },
});

router.post('/upload', requireCap('resources.*'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const { lesson_id, module_id, title, kind } = req.body || {};
  const id = uid();
  db.prepare(`INSERT INTO resources (id,lesson_id,module_id,title,kind,file_path,mime_type)
              VALUES (?,?,?,?,?,?,?)`).run(
    id, lesson_id || null, module_id || null,
    title || req.file.originalname, kind || 'file',
    `/uploads/${req.file.filename}`, req.file.mimetype
  );
  audit({ user_id: req.user.id, role: req.user.role, action: 'resource_uploaded', related_module: module_id || null, ip: req.ip, comment: req.file.originalname });
  res.json({ ok: true, id, file_path: `/uploads/${req.file.filename}` });
});

module.exports = router;
