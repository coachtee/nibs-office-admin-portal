// Shared app shell — renders the sidebar based on role
(function () {
  const NAV = {
    learner: [
      { group: 'LEARN' },
      { href: '/app', label: 'Dashboard', icon: '🏠' },
      { href: '/app/pathway', label: 'Pathway', icon: '🧭' },
      { href: '/app/workbook', label: 'Workbook', icon: '📒' },
      { href: '/app/poe', label: 'Portfolio of Evidence', icon: '📂' },
    ],
    admin: [
      { group: 'ADMIN' },
      { href: '/admin', label: 'Overview', icon: '🏠' },
      { href: '/admin/users', label: 'Users', icon: '👥' },
      { href: '/admin/course-builder', label: 'Course Builder', icon: '🛠' },
      { href: '/admin/curriculum-mapping', label: 'Curriculum Mapping', icon: '🗺' },
      { href: '/admin/poe-templates', label: 'POE Templates', icon: '📋' },
      { href: '/admin/reports', label: 'Reports', icon: '📊' },
      { href: '/admin/audit', label: 'Audit Trail', icon: '🔍' },
    ],
    super_admin: [
      { group: 'SUPER ADMIN' },
      { href: '/admin', label: 'Overview', icon: '🏠' },
      { href: '/admin/users', label: 'Users', icon: '👥' },
      { href: '/admin/course-builder', label: 'Course Builder', icon: '🛠' },
      { href: '/admin/curriculum-mapping', label: 'Curriculum Mapping', icon: '🗺' },
      { href: '/admin/poe-templates', label: 'POE Templates', icon: '📋' },
      { href: '/admin/reports', label: 'Reports', icon: '📊' },
      { href: '/admin/audit', label: 'Audit Trail', icon: '🔍' },
      { group: 'STAFF' },
      { href: '/facilitator', label: 'Facilitator view', icon: '👨‍🏫' },
      { href: '/assessor', label: 'Assessor view', icon: '⚖️' },
      { href: '/moderator', label: 'Moderator view', icon: '🛡' },
      { href: '/finance', label: 'Finance view', icon: '💳' },
      { href: '/supervisor', label: 'Supervisor view', icon: '🏢' },
    ],
    course_manager: [
      { group: 'COURSE' },
      { href: '/admin/course-builder', label: 'Course Builder', icon: '🛠' },
      { href: '/admin/curriculum-mapping', label: 'Curriculum Mapping', icon: '🗺' },
      { href: '/admin/poe-templates', label: 'POE Templates', icon: '📋' },
      { href: '/admin/reports', label: 'Reports', icon: '📊' },
    ],
    facilitator: [
      { group: 'FACILITATE' },
      { href: '/facilitator', label: 'My Cohorts', icon: '👨‍🏫' },
    ],
    assessor: [
      { group: 'ASSESS' },
      { href: '/assessor', label: 'Assessment Queue', icon: '⚖️' },
    ],
    moderator: [
      { group: 'MODERATE' },
      { href: '/moderator', label: 'Moderation Queue', icon: '🛡' },
    ],
    finance: [
      { group: 'FINANCE' },
      { href: '/finance', label: 'Payments & Access', icon: '💳' },
    ],
    employer: [
      { group: 'WORKPLACE' },
      { href: '/supervisor', label: 'My Learners', icon: '🏢' },
    ],
  };

  function renderShell(activePath) {
    const me = window.__NIBS_USER__;
    if (!me) return '';
    const items = NAV[me.role] || NAV.learner;
    const initials = (me.full_name || me.email || '?').split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase();
    const navHtml = items.map(it => {
      if (it.group) return `<div class="group-label">${it.group}</div>`;
      const active = activePath === it.href || (activePath && activePath.startsWith(it.href) && it.href !== '/app' && it.href !== '/admin' && it.href !== '/facilitator' && it.href !== '/assessor' && it.href !== '/moderator' && it.href !== '/supervisor' && it.href !== '/finance');
      return `<a href="${it.href}" class="${active ? 'active' : ''}"><span class="ic">${it.icon || '•'}</span>${it.label}</a>`;
    }).join('');
    return `
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">N</div>
          <div class="name">NIBS Pathway<small>Office Administrator</small></div>
        </div>
        <nav>${navHtml}</nav>
        <div class="user">
          <div class="avatar">${initials}</div>
          <div class="meta"><b>${NIBS.esc(me.full_name)}</b><span>${me.role.replace(/_/g, ' ')}</span></div>
          <a class="logout" href="/logout">Logout</a>
        </div>
      </aside>`;
  }

  window.renderShell = renderShell;
})();
