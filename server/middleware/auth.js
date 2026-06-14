// Role-based permissions matrix + JWT cookie auth
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'nibs_session';
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  COURSE_MANAGER: 'course_manager',
  LEARNER: 'learner',
  FACILITATOR: 'facilitator',
  ASSESSOR: 'assessor',
  MODERATOR: 'moderator',
  FINANCE: 'finance',
  EMPLOYER: 'employer',
};

// Capability matrix — used both server-side and exposed for UI gating hints
const CAPS = {
  super_admin: ['*'],
  admin: [
    'users.read','users.write','users.suspend','users.activate',
    'courses.*','modules.*','lessons.*','resources.*',
    'curriculum.*','poe.*','workbook.*',
    'facilitator.*','assessor.*','moderator.*','finance.*','reports.*',
    'audit.*','pdf.*','cohorts.*',
  ],
  course_manager: [
    'courses.read','courses.write',
    'modules.*','lessons.*','resources.*',
    'curriculum.*','poe.*','workbook.*',
    'reports.read',
  ],
  learner: [
    'courses.read','modules.read','lessons.read',
    'lesson.progress.write','workbook.answer.write',
    'poe.submit','poe.draft','poe.upload','poe.declare',
    'profile.read','profile.write',
  ],
  facilitator: [
    'cohorts.read','learners.read.assigned',
    'workbook.feedback','poe.feedback',
    'attendance.write','class_notes.write','resources.upload',
  ],
  assessor: [
    'assessor.queue','assessor.review','assessor.decision','assessor.signoff',
    'poe.read.assigned','workbook.read.assigned',
    'reports.assessor',
  ],
  moderator: [
    'moderator.queue','moderator.review','moderator.decision','moderator.signoff',
    'poe.read.assigned','assessor.read.assigned',
    'reports.moderator',
  ],
  finance: [
    'payments.*','users.read.finance','reports.finance',
  ],
  employer: [
    'learners.read.assigned','poe.read.assigned','workplace.signoff',
  ],
};

function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, email: user.email, name: user.full_name },
    SECRET,
    { expiresIn: `${TTL_HOURS}h` }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_HOURS * 3600 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

function readToken(req) {
  const t = req.cookies && req.cookies[COOKIE];
  if (!t) return null;
  try { return jwt.verify(t, SECRET); } catch { return null; }
}

function loadUser(uid) {
  return db.prepare('SELECT id,email,full_name,role,status,payment_status,cohort_id,avatar_color FROM users WHERE id = ?').get(uid);
}

function attachUser(req, _res, next) {
  const payload = readToken(req);
  if (payload) {
    const u = loadUser(payload.uid);
    if (u) {
      req.user = u;
      req.user.caps = CAPS[u.role] || [];
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  next();
}

function hasCap(user, cap) {
  if (!user) return false;
  const caps = user.caps || [];
  if (caps.includes('*')) return true;
  if (caps.includes(cap)) return true;
  // wildcard suffix, e.g. 'poe.*'
  const [root] = cap.split('.');
  return caps.includes(`${root}.*`);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

function requireCap(cap) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    if (!hasCap(req.user, cap)) return res.status(403).json({ error: 'forbidden', cap });
    next();
  };
}

function audit({ user_id, role, action, old_status, new_status, comment, related_learner, related_module, related_poe_item, ip }) {
  try {
    db.prepare(`INSERT INTO audit_logs (id,user_id,role,action,old_status,new_status,comment,related_learner,related_module,related_poe_item,ip)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      require('crypto').randomUUID(),
      user_id || null, role || null, action,
      old_status || null, new_status || null,
      comment || null, related_learner || null,
      related_module || null, related_poe_item || null,
      ip || null
    );
  } catch (e) { console.error('audit failed', e); }
}

module.exports = { ROLES, CAPS, signToken, setAuthCookie, clearAuthCookie, attachUser, requireAuth, requireRole, requireCap, hasCap, audit };
