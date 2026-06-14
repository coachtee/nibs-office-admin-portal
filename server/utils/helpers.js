// Common helpers
const crypto = require('crypto');

function uid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function asJson(v) { try { return JSON.parse(v || '{}'); } catch { return {}; } }
function safe(v, d='') { return (v === undefined || v === null) ? d : v; }
function pick(obj, fields) { const o = {}; fields.forEach(f => o[f] = obj[f]); return o; }

// Status -> pill class map (for UI)
const STATUS_PILL = {
  draft: 'grey', submitted: 'blue', feedback: 'gold', needs_correction: 'red',
  resubmitted: 'blue', accepted: 'blue', competent: 'green', not_yet_competent: 'red',
  moderation_in_progress: 'gold', moderation_approved: 'green', reassessment_required: 'red',
  final_approved: 'green', not_started: 'grey', in_progress: 'blue', completed: 'green',
  approved: 'green', published: 'green', under_review: 'gold', archived: 'grey',
  active: 'green', pending_payment: 'gold', suspended: 'red', withdrawn: 'grey',
  needs_review: 'gold', ready: 'green',
};

module.exports = { uid, now, asJson, safe, pick, STATUS_PILL };
