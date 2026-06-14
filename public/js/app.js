// NIBS Pathway Portal — shared frontend utilities
// Exposes window.NIBS for use across pages. No build step.

(function () {
  const NIBS = {
    api: async function (path, opts) {
      opts = opts || {};
      const init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
      if (opts.body && typeof opts.body !== 'string') init.body = JSON.stringify(opts.body);
      else if (opts.body) init.body = opts.body;
      const r = await fetch(path, init);
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      if (!r.ok) {
        const err = new Error((data && data.error) || ('http_' + r.status));
        err.status = r.status; err.data = data;
        throw err;
      }
      return data;
    },
    me: async function () {
      try { return (await this.api('/api/auth/me')).user; } catch { return null; }
    },
    roleHome: function (role) {
      const m = { learner: '/app', admin: '/admin', super_admin: '/admin', course_manager: '/admin/course-builder', facilitator: '/facilitator', assessor: '/assessor', moderator: '/moderator', finance: '/finance', employer: '/supervisor' };
      return m[role] || '/app';
    },
    toast: function (msg, kind) {
      let wrap = document.querySelector('.toast-wrap');
      if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
      const t = document.createElement('div');
      t.className = 'toast' + (kind ? ' ' + kind : '');
      t.textContent = msg;
      wrap.appendChild(t);
      setTimeout(() => t.remove(), 3500);
    },
    fmtDate: function (s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; } },
    fmtDateTime: function (s) { if (!s) return '—'; try { return new Date(s).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; } },
    statusPill: function (status) {
      const colors = { draft: 'grey', submitted: 'blue', feedback: 'gold', needs_correction: 'red', resubmitted: 'blue', accepted: 'blue', competent: 'green', not_yet_competent: 'red', moderation_in_progress: 'gold', moderation_approved: 'green', reassessment_required: 'red', final_approved: 'green', not_started: 'grey', in_progress: 'blue', completed: 'green', approved: 'green', published: 'green', under_review: 'gold', archived: 'grey', active: 'green', pending_payment: 'gold', suspended: 'red' };
      return `<span class="pill ${colors[status] || 'grey'}"><span class="dot"></span>${(status || 'unknown').replace(/_/g, ' ')}</span>`;
    },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  };
  window.NIBS = NIBS;
})();
