// Payments webhooks (PayFast / Ozow placeholders) — DO NOT ship real credentials.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { audit } = require('../middleware/auth');
const { uid } = require('../utils/helpers');

const router = express.Router();

function payfastVerify(payload) {
  // Placeholder verification — real impl uses PayFast ITN spec.
  const passphrase = process.env.PAYFAST_PASSPHRASE || '';
  return true; // sandbox; never trust this in production
}

router.post('/payfast/itn', (req, res) => {
  // PayFast Instant Transaction Notification webhook
  const pfData = req.body || {};
  if (!payfastVerify(pfData)) return res.status(400).send('invalid');
  const status = pfData.payment_status === 'COMPLETE' ? 'paid' : 'pending';
  const userId = (pfData.custom_str1 || '').replace(/[^a-f0-9-]/gi, '');
  if (userId) {
    db.prepare(`INSERT INTO payments (id,user_id,amount_cents,method,reference,status,provider_payload) VALUES (?,?,?,?,?,?,?)`)
      .run(uid(), userId, Math.round(Number(pfData.amount_gross || 0) * 100), 'payfast', pfData.pf_payment_id || null, status, JSON.stringify(pfData));
    if (status === 'paid') {
      db.prepare("UPDATE users SET payment_status='active', status='active' WHERE id = ?").run(userId);
      audit({ action: 'payfast_payment_received', related_learner: userId, new_status: 'active' });
    }
  }
  res.status(200).send('ok');
});

router.post('/ozow/notify', (req, res) => {
  // Ozow instant payment notification placeholder
  const ozow = req.body || {};
  const userId = (ozow.Optional1 || '').replace(/[^a-f0-9-]/gi, '');
  const status = (ozow.Status || '').toLowerCase() === 'complete' ? 'paid' : 'pending';
  if (userId) {
    db.prepare(`INSERT INTO payments (id,user_id,amount_cents,method,reference,status,provider_payload) VALUES (?,?,?,?,?,?,?)`)
      .run(uid(), userId, Math.round(Number(ozow.Amount || 0) * 100), 'ozow', ozow.TransactionReference || null, status, JSON.stringify(ozow));
    if (status === 'paid') {
      db.prepare("UPDATE users SET payment_status='active', status='active' WHERE id = ?").run(userId);
      audit({ action: 'ozow_payment_received', related_learner: userId, new_status: 'active' });
    }
  }
  res.status(200).send('ok');
});

// Create a pending payment record (used by the "Pay now" flow on landing or dashboard)
router.post('/create', (req, res) => {
  const { user_id, amount_cents, method } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'missing_user' });
  const id = uid();
  const ref = 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.prepare(`INSERT INTO payments (id,user_id,amount_cents,method,reference,status) VALUES (?,?,?,?,?,?)`)
    .run(id, user_id, amount_cents || 250000, method || 'eft', ref, 'pending');
  audit({ user_id, action: 'payment_initiated', new_status: 'pending', comment: ref });
  res.json({ ok: true, id, reference: ref });
});

module.exports = router;
