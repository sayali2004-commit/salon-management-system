/* ============================================================
   Salon Management System · Application
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Store ---------------- */
  const DB_KEY = 'solun_db_v1';

  const defaultDB = {
    employees: [],
    customers: [],
    visits: [],
    services: [],
    counters: { emp: 0, cus: 0, visit: 0, svc: 0 },
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return structuredClone(defaultDB);
      const parsed = JSON.parse(raw);
      const merged = Object.assign(structuredClone(defaultDB), parsed, {
        counters: Object.assign({}, defaultDB.counters, parsed.counters || {}),
      });

      // Migrate old leads → visits (lead section replaced by visits)
      if (Array.isArray(parsed.leads) && parsed.leads.length && !(Array.isArray(parsed.visits) && parsed.visits.length)) {
        merged.visits = parsed.leads.map((l) => ({
          id: l.id,
          visitDateTime: l.dueDateTime || '',
          customerId: l.customerId || '',
          employeeId: l.employeeId || '',
          serviceId: '',
          serviceName: l.taskTitle || '',
          amount: '',
          paymentMethod: '',
          paymentStatus: '',
          status: l.status === 'Pending' ? 'Scheduled' : l.status || 'Scheduled',
          notes: l.notes || l.description || '',
          createdAt: l.createdAt || '',
        }));
      }
      if (!Array.isArray(merged.visits)) merged.visits = [];
      delete merged.leads;
      return merged;
    } catch {
      return structuredClone(defaultDB);
    }
  }

  function save() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function nextId(type) {
    db.counters[type] = (db.counters[type] || 0) + 1;
    const n = String(db.counters[type]).padStart(4, '0');
    const prefix = { emp: 'EMP', cus: 'CUS', visit: 'VIS', svc: 'SVC' }[type];
    return `${prefix}-${n}`;
  }

  function peekId(type) {
    const n = String((db.counters[type] || 0) + 1).padStart(4, '0');
    const prefix = { emp: 'EMP', cus: 'CUS', visit: 'VIS', svc: 'SVC' }[type];
    return `${prefix}-${n}`;
  }

  /* ---------------- Utilities ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');
  }

  function fmtDate(iso) {
    if (!iso) return '·';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '·';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return (
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' Â· ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  }

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function daysUntilBirthday(dobISO) {
    if (!dobISO) return null;
    const dob = new Date(dobISO + 'T00:00:00');
    if (isNaN(dob)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < today) next = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
    return Math.round((next - today) / 86400000);
  }

  function isTodayBirthday(dobISO) {
    return daysUntilBirthday(dobISO) === 0;
  }

  function avatarHTML(person, size = '') {
    const cls = size ? `avatar ${size}` : 'avatar';
    if (person.photo) {
      return `<div class="${cls}"><img src="${esc(person.photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" /></div>`;
    }
    return `<div class="${cls}">${esc(initials(person.fullName))}</div>`;
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, type = 'success') {
    const wrap = $('#toastWrap');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  /* ---------------- Modal ---------------- */
  let modalStack = [];

  function openModal({ title, subtitle = '', body, footer, size = '', onOpen }) {
    const root = $('#modalRoot');
    root.classList.add('open');
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal ${size ? 'modal-' + size : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>${esc(title)}</h2>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
          </div>
          <button class="modal-close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    root.appendChild(wrap);

    const close = () => {
      wrap.remove();
      modalStack = modalStack.filter((m) => m !== wrap);
      if (!root.children.length) root.classList.remove('open');
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    wrap.querySelector('.modal-backdrop').addEventListener('click', close);
    wrap.querySelector('.modal-close').addEventListener('click', close);
    modalStack.push({ wrap, close });

    if (onOpen) onOpen(wrap, close);
    return { wrap, close };
  }

  function confirmDialog({ title = 'Are you sure?', message, confirmText = 'Delete', danger = true }) {
    return new Promise((resolve) => {
      const { close } = openModal({
        title,
        size: 'sm',
        body: `<p class="confirm-text">${message}</p>`,
        footer: `
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger-soft' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>`,
        onOpen: (wrap, cl) => {
          wrap.querySelector('[data-act="cancel"]').addEventListener('click', () => {
            cl();
            resolve(false);
          });
          wrap.querySelector('[data-act="ok"]').addEventListener('click', () => {
            cl();
            resolve(true);
          });
        },
      });
    });
  }

  /* ---------------- Navigation ---------------- */
  const SECTIONS = {
    dashboard: { title: 'Dashboard', sub: 'Overview of your management system' },
    employees: { title: 'Employees', sub: 'Create and manage your employee directory' },
    customers: { title: 'Customers', sub: 'Manage your customer records' },
    visits: { title: 'Visits', sub: 'Customer visits with assigned staff & payments' },
    birthdays: { title: 'Birthdays', sub: 'Upcoming birthdays · employees & customers' },
    services: { title: 'Services', sub: 'Services offered by your business' },
  };

  let currentSection = 'dashboard';

  function goto(section) {
    currentSection = section;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
    $$('.section').forEach((s) => s.classList.toggle('active', s.id === `section-${section}`));
    $('#pageTitle').textContent = SECTIONS[section].title;
    $('#pageSubtitle').textContent = SECTIONS[section].sub;
    render(section);
  }

  /* ---------------- Render dispatch ---------------- */
  function render(section) {
    switch (section) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'employees':
        renderEmployees();
        break;
      case 'customers':
        renderCustomers();
        break;
      case 'visits':
        renderVisits();
        break;
      case 'birthdays':
        renderBirthdays();
        break;
      case 'services':
        renderServices();
        break;
    }
  }

  function renderAll() {
    render(currentSection);
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    const empCount = db.employees.length;
    const cusCount = db.customers.length;
    const visitCount = db.visits.length;
    const openVisits = db.visits.filter((v) => v.status !== 'Completed').length;
    const todayB = db.employees.filter((e) => isTodayBirthday(e.dob)).length + db.customers.filter((c) => isTodayBirthday(c.dob)).length;
    const activeServices = db.services.filter((s) => s.status === 'Active').length;

    const stats = [
      { label: 'Total Employees', value: empCount, sub: `${db.employees.filter((e) => e.employmentStatus === 'Active').length} active`, icon: 'users', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Total Customers', value: cusCount, sub: `${db.customers.length} records`, icon: 'user', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'Open Visits', value: openVisits, sub: `${visitCount} total visits`, icon: 'calendar', accent: 'var(--violet)', bg: 'var(--violet-50)' },
      { label: "Today's Birthdays", value: todayB, sub: todayB ? 'Celebrate today!' : 'None today', icon: 'cake', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Active Services', value: activeServices, sub: `${db.services.length} total services`, icon: 'tool', accent: 'var(--green)', bg: 'var(--green-50)' },
    ];

    const icons = {
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/></svg>',
      tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    };

    $('#statGrid').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top">
          <div class="stat-icon">${icons[s.icon]}</div>
        </div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    // Upcoming birthdays (next 5)
    const bdays = getUpcomingBirthdays().slice(0, 5);
    $('#dashBirthdays').innerHTML = bdays.length
      ? bdays
          .map((b) => {
            const pill = b.days === 0 ? 'Today' : b.days === 1 ? 'Tomorrow' : `${b.days} days`;
            return `
          <div class="mini-row">
            ${avatarHTML(b.person)}
            <div class="info">
              <div class="t">${esc(b.person.fullName)}</div>
              <div class="s">${b.type === 'employee' ? 'Employee' : 'Customer'} Â· ${fmtDate(b.person.dob)}</div>
            </div>
            <span class="badge ${b.days === 0 ? 'badge-amber' : b.days <= 7 ? 'badge-brand' : 'badge-gray'}">${pill}</span>
          </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No upcoming birthdays in the next 30 days.</p></div>`;

    // Recent visits
    const recent = [...db.visits].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);
    $('#dashVisits').innerHTML = recent.length
      ? recent
          .map((v) => {
            const emp = db.employees.find((e) => e.id === v.employeeId);
            const cus = db.customers.find((c) => c.id === v.customerId);
            return `
          <div class="mini-row">
            <div class="info">
              <div class="t">${esc(v.serviceName || 'Salon Visit')}</div>
              <div class="s">${esc(cus?.fullName || v.customerId)} · ${esc(emp?.fullName || v.employeeId)}</div>
            </div>
            ${statusBadge(v.status)}
          </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No visits recorded yet.</p></div>`;
  }

  function statusBadge(status) {
    const map = {
      Scheduled: 'badge-amber',
      'In Progress': 'badge-sky',
      Completed: 'badge-green',
    };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status)}</span>`;
  }

  function payStatusBadge(status) {
    const map = { Paid: 'badge-green', Partial: 'badge-amber', Pending: 'badge-red' };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || '·')}</span>`;
  }

  /* ================= EMPLOYEES ================= */
  let employeeSearch = '';

  function renderEmployees() {
    const q = employeeSearch.toLowerCase();
    const list = db.employees.filter(
      (e) =>
        !q ||
        e.fullName.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.staffRole || '').toLowerCase().includes(q) ||
        (e.specialties || '').toLowerCase().includes(q)
    );

    const tbody = $('#employeeTable tbody');
    const empty = $('#employeeEmpty');
    const tableWrap = $('#employeeTable').closest('.table-wrap');

    if (!db.employees.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching employees';
      empty.querySelector('.empty-text').textContent = 'Try a different search term.';
      tbody.innerHTML = '';
      return;
    }
    empty.querySelector('.empty-title').textContent = 'No employees found';
    empty.querySelector('.empty-text').textContent = 'No results for your search.';

    tbody.innerHTML = list
      .map(
        (e) => `
      <tr data-id="${esc(e.id)}">
        <td>
          <div class="person-cell">
            ${avatarHTML(e)}
            <div>
              <div class="person-name">${esc(e.fullName)}</div>
              <div class="person-meta">${esc(e.staffRole || '')}</div>
            </div>
          </div>
        </td>
        <td><strong style="color:var(--brand)">${esc(e.id)}</strong></td>
        <td>${esc(e.staffRole || '·')}</td>
        <td>${esc(e.specialties || '·')}</td>
        <td>${esc(e.mobile || '·')}</td>
        <td>${empStatusBadge(e.employmentStatus)}</td>
        <td>${fmtDate(e.joiningDate)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="icon-action" data-act="view" title="View details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-action" data-act="edit" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-action danger" data-act="delete" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`
      )
      .join('');

    $$('#employeeTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewEmployee(tr.dataset.id);
      });
    });

    $$('#employeeTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'view') viewEmployee(id);
        else if (act === 'edit') openEmployeeForm(id);
        else if (act === 'delete') deleteEmployee(id);
      });
    });
  }

  function empStatusBadge(status) {
    const map = {
      Active: 'badge-green',
      'On Leave': 'badge-amber',
      Probation: 'badge-sky',
      Resigned: 'badge-red',
      Terminated: 'badge-red',
    };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || '·')}</span>`;
  }

  function openEmployeeForm(id = null) {
    const emp = id ? db.employees.find((e) => e.id === id) : null;

    const staffRoles = ['Salon Manager', 'Receptionist', 'Hair Stylist', 'Barber', 'Beautician', 'Makeup Artist', 'Nail Technician', 'Esthetician', 'Spa Therapist', 'Apprentice'];
    const shifts = ['Morning', 'Afternoon', 'Evening', 'Full Day'];
    const statuses = ['Active', 'Probation', 'On Leave', 'Resigned', 'Terminated'];

    const body = `
      <form id="empForm" class="form-grid" autocomplete="off">
        <div class="field">
          <label>Employee ID</label>
          <div class="auto-id-box"><span>Auto-generated</span><span>${emp ? esc(emp.id) : peekId('emp')}</span></div>
        </div>
        <div class="field">
          <label>Full Name <span class="req">*</span></label>
          <input name="fullName" required placeholder="e.g. Ayesha Rahman" value="${esc(emp?.fullName || '')}" />
        </div>

        <div class="field">
          <label>Date of Birth <span class="req">*</span></label>
          <input type="date" name="dob" required value="${esc(emp?.dob || '')}" />
        </div>
        <div class="field">
          <label>Gender <span class="req">*</span></label>
          <select name="gender" required>
            <option value="">Select gender</option>
            ${['Male', 'Female', 'Other'].map((g) => `<option ${emp?.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Mobile Number <span class="req">*</span></label>
          <input name="mobile" required placeholder="e.g. +91 98765 43210" value="${esc(emp?.mobile || '')}" />
        </div>
        <div class="field">
          <label>Staff Role <span class="req">*</span></label>
          <select name="staffRole" required>
            <option value="">Select staff role</option>
            ${staffRoles.map((r) => `<option ${emp?.staffRole === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Specialties / Services</label>
          <input name="specialties" placeholder="e.g. Haircut, Hair Color, Bridal Makeup" value="${esc(emp?.specialties || '')}" />
        </div>

        <div class="field span-2">
          <label>Address</label>
          <textarea name="address" placeholder="Full address...">${esc(emp?.address || '')}</textarea>
        </div>

        <div class="field">
          <label>Experience (Years)</label>
          <input type="number" name="experienceYears" min="0" max="60" placeholder="e.g. 5" value="${esc(emp?.experienceYears || '')}" />
        </div>
        <div class="field">
          <label>Commission Rate (%)</label>
          <input type="number" name="commissionRate" min="0" max="100" step="0.5" placeholder="e.g. 30" value="${esc(emp?.commissionRate || '')}" />
        </div>

        <div class="field">
          <label>Shift</label>
          <select name="shift">
            <option value="">Select shift</option>
            ${shifts.map((s) => `<option ${emp?.shift === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Joining Date <span class="req">*</span></label>
          <input type="date" name="joiningDate" required value="${esc(emp?.joiningDate || '')}" />
        </div>
        <div class="field">
          <label>Employment Status <span class="req">*</span></label>
          <select name="employmentStatus" required>
            ${statuses.map((s) => `<option ${(emp?.employmentStatus || 'Active') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional notes...">${esc(emp?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: emp ? 'Edit Employee' : 'Create Employee',
      subtitle: emp ? `Updating ${emp.id}` : 'Fill in the employee details below',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${emp ? 'Save Changes' : 'Create Employee'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#empForm', wrap);

        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());

          if (emp) {
            Object.assign(emp, data);
            toast('Employee updated successfully');
          } else {
            data.id = nextId('emp');
            data.createdAt = new Date().toISOString();
            db.employees.push(data);
            toast(`Employee created · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  function viewEmployee(id) {
    const e = db.employees.find((x) => x.id === id);
    if (!e) return;

    const visits = db.visits.filter((v) => v.employeeId === id);
    const openVisits = visits.filter((v) => v.status !== 'Completed').length;

    const body = `
      <div class="profile-hero">
        ${avatarHTML(e, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(e.fullName)}</h2>
          <div class="role">${esc(e.staffRole || '·')} · ${esc(e.specialties || '·')}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(e.id)}</span>
            ${empStatusBadge(e.employmentStatus)}
            <span class="badge badge-gray">${visits.length} visit${visits.length === 1 ? '' : 's'} · ${openVisits} open</span>
          </div>
        </div>
      </div>

      <div class="detail-section-title">Personal Information</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Date of Birth</div><div class="value">${fmtDate(e.dob)}${isTodayBirthday(e.dob) ? ' Â· ðŸŽ‚ Today!' : ''}</div></div>
        <div class="detail-item"><div class="label">Gender</div><div class="value">${esc(e.gender || '·')}</div></div>
        <div class="detail-item"><div class="label">Mobile Number</div><div class="value">${esc(e.mobile || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Address</div><div class="value">${esc(e.address || '·')}</div></div>
      </div>

      <div class="detail-section-title">Employment</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(e.staffRole || '·')}</div></div>
        <div class="detail-item"><div class="label">Specialties / Services</div><div class="value">${esc(e.specialties || '·')}</div></div>
        <div class="detail-item"><div class="label">Experience (Years)</div><div class="value">${esc(e.experienceYears || '·')}</div></div>
        <div class="detail-item"><div class="label">Commission Rate</div><div class="value">${e.commissionRate ? esc(e.commissionRate) + '%' : '·'}</div></div>
        <div class="detail-item"><div class="label">Shift</div><div class="value">${esc(e.shift || '·')}</div></div>
        <div class="detail-item"><div class="label">Joining Date</div><div class="value">${fmtDate(e.joiningDate)}</div></div>
        <div class="detail-item"><div class="label">Employment Status</div><div class="value">${esc(e.employmentStatus || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Notes</div><div class="value">${esc(e.notes || '·')}</div></div>
      </div>`;

    openModal({
      title: 'Employee Details',
      subtitle: e.id,
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="close">Close</button>
        <button class="btn btn-primary" data-act="edit">Edit Employee</button>`,
      onOpen: (wrap, close) => {
        wrap.querySelector('[data-act="close"]').addEventListener('click', close);
        wrap.querySelector('[data-act="edit"]').addEventListener('click', () => {
          close();
          openEmployeeForm(id);
        });
      },
    });
  }

  async function deleteEmployee(id) {
    const e = db.employees.find((x) => x.id === id);
    if (!e) return;
    const related = db.visits.filter((v) => v.employeeId === id).length;
    const ok = await confirmDialog({
      title: 'Delete Employee',
      message: `Are you sure you want to delete <strong>${esc(e.fullName)}</strong> (${esc(e.id)})?${related ? ` This will also remove <strong>${related}</strong> related visit${related === 1 ? '' : 's'}.` : ''} This action cannot be undone.`,
    });
    if (!ok) return;
    db.employees = db.employees.filter((x) => x.id !== id);
    db.visits = db.visits.filter((v) => v.employeeId !== id);
    save();
    renderAll();
    toast('Employee deleted');
  }

  /* ================= CUSTOMERS ================= */
  let customerSearch = '';

  function renderCustomers() {
    const q = customerSearch.toLowerCase();
    const list = db.customers.filter((c) => {
      if (!q) return true;
      const emp = db.employees.find((e) => e.id === c.employeeId);
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.mobile || '').toLowerCase().includes(q) ||
        (emp?.fullName || '').toLowerCase().includes(q)
      );
    });

    const tbody = $('#customerTable tbody');
    const empty = $('#customerEmpty');
    const tableWrap = $('#customerTable').closest('.table-wrap');

    if (!db.customers.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No customers yet';
      empty.querySelector('.empty-text').textContent = 'Add your first customer to get started.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching customers';
      empty.querySelector('.empty-text').textContent = 'Try a different search term.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map(
        (c) => `
      <tr data-id="${esc(c.id)}">
        <td>
          <div class="person-cell">
            ${avatarHTML(c)}
            <div>
              <div class="person-name">${esc(c.fullName)}</div>
              <div class="person-meta">${esc(c.address ? c.address.slice(0, 40) : '')}</div>
            </div>
          </div>
        </td>
        <td><strong style="color:var(--brand)">${esc(c.id)}</strong></td>
        <td>${esc(c.mobile || '·')}</td>
        <td>${esc(c.email || '·')}</td>
        <td>${esc(db.employees.find((e) => e.id === c.employeeId)?.fullName || '·')}</td>
        <td>${c.totalAmount ? `<strong>₹${esc(c.totalAmount)}</strong>` : '·'} ${c.paymentStatus ? payStatusBadge(c.paymentStatus) : ''}</td>
        <td>${fmtDate(c.dob)}${isTodayBirthday(c.dob) ? ' ðŸŽ‚' : ''}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="icon-action" data-act="view" title="View details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-action" data-act="visit" title="Record visit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
            </button>
            <button class="icon-action" data-act="edit" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-action danger" data-act="delete" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`
      )
      .join('');

    $$('#customerTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewCustomer(tr.dataset.id);
      });
    });

    $$('#customerTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'view') viewCustomer(id);
        else if (act === 'edit') openCustomerForm(id);
        else if (act === 'delete') deleteCustomer(id);
        else if (act === 'visit') {
          const c = db.customers.find((x) => x.id === id);
          openVisitForm(null, { customerId: id, employeeId: c?.employeeId || '', serviceId: c?.serviceId || '', amount: c?.totalAmount || '' });
        }
      });
    });
  }

  function openCustomerForm(id = null) {
    const cus = id ? db.customers.find((c) => c.id === id) : null;

    if (!id && (!db.employees.length || !db.services.length)) {
      toast('Please add at least one employee and one service first.', 'error');
      return;
    }

    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${cus?.employeeId === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.specialties || e.id)}</option>`)
      .join('');
    const svcOptions = db.services
      .map((s) => `<option value="${esc(s.id)}" ${cus?.serviceId === s.id ? 'selected' : ''}>${esc(s.name)}${s.price ? ` (₹${esc(s.price)})` : ''}</option>`)
      .join('');

    const body = `
      <form id="cusForm" class="form-grid" autocomplete="off">
        <div class="field">
          <label>Customer ID</label>
          <div class="auto-id-box"><span>Auto-generated</span><span>${cus ? esc(cus.id) : peekId('cus')}</span></div>
        </div>
        <div class="field">
          <label>Full Name <span class="req">*</span></label>
          <input name="fullName" required placeholder="e.g. Farhan Ahmed" value="${esc(cus?.fullName || '')}" />
        </div>

        <div class="field">
          <label>Date of Birth <span class="req">*</span></label>
          <input type="date" name="dob" required value="${esc(cus?.dob || '')}" />
        </div>
        <div class="field">
          <label>Mobile Number <span class="req">*</span></label>
          <input name="mobile" required placeholder="e.g. +91 91234 56789" value="${esc(cus?.mobile || '')}" />
        </div>

        <div class="field">
          <label>Email Address <span class="req">*</span></label>
          <input type="email" name="email" required placeholder="e.g. customer@email.com" value="${esc(cus?.email || '')}" />
        </div>
        <div class="field"></div>

        <div class="field">
          <label>Assigned Employee <span class="req">*</span></label>
          <select name="employeeId" required>
            <option value="">Select employee</option>
            ${empOptions}
          </select>
        </div>
        <div class="field">
          <label>Service <span class="req">*</span></label>
          <select name="serviceId" required>
            <option value="">Select service</option>
            ${svcOptions}
          </select>
        </div>

        <div class="field">
          <label>Total Amount (₹)</label>
          <input type="number" name="totalAmount" min="0" step="0.01" placeholder="e.g. 2000" value="${esc(cus?.totalAmount || '')}" />
        </div>
        <div class="field">
          <label>Paid Amount (₹)</label>
          <input type="number" name="paidAmount" min="0" step="0.01" placeholder="e.g. 2000" value="${esc(cus?.paidAmount || '')}" />
        </div>

        <div class="field">
          <label>Payment Method <span class="req">*</span></label>
          <select name="paymentMethod" required>
            ${['Cash', 'Card', 'UPI', 'Bank Transfer'].map((m) => `<option ${(cus?.paymentMethod || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Payment Status <span class="req">*</span></label>
          <select name="paymentStatus" required>
            ${['Paid', 'Partial', 'Pending'].map((p) => `<option ${(cus?.paymentStatus || 'Pending') === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Address</label>
          <textarea name="address" placeholder="Full address...">${esc(cus?.address || '')}</textarea>
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional notes...">${esc(cus?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: cus ? 'Edit Customer' : 'Add Customer',
      subtitle: cus ? `Updating ${cus.id}` : 'Fill in the customer details below',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${cus ? 'Save Changes' : 'Add Customer'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#cusForm', wrap);

        form.serviceId.addEventListener('change', () => {
          const svc = db.services.find((s) => s.id === form.serviceId.value);
          if (svc && svc.price != null && svc.price !== '') form.totalAmount.value = svc.price;
        });

        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());

          if (cus) {
            Object.assign(cus, data);
            toast('Customer updated successfully');
          } else {
            data.id = nextId('cus');
            data.createdAt = new Date().toISOString();
            db.customers.push(data);

            // Store the service given to this customer in the Visits section
            if (data.serviceId) {
              const svc = db.services.find((s) => s.id === data.serviceId);
              const now = new Date();
              db.visits.push({
                id: nextId('visit'),
                visitDateTime: new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
                customerId: data.id,
                employeeId: data.employeeId || '',
                serviceId: data.serviceId,
                serviceName: svc?.name || '',
                amount: data.totalAmount || svc?.price || '',
                paymentMethod: data.paymentMethod || 'Cash',
                paymentStatus: data.paymentStatus || 'Pending',
                status: 'Completed',
                notes: 'Service given on customer registration',
                createdAt: now.toISOString(),
              });
              toast(`Customer added · ${data.id} · visit recorded`);
            } else {
              toast(`Customer added · ${data.id}`);
            }
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  function viewCustomer(id) {
    const c = db.customers.find((x) => x.id === id);
    if (!c) return;

    const visits = db.visits.filter((v) => v.customerId === id);
    const empCus = db.employees.find((e) => e.id === c.employeeId);
    const svcCus = db.services.find((s) => s.id === c.serviceId);

    const body = `
      <div class="profile-hero">
        ${avatarHTML(c, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(c.fullName)}</h2>
          <div class="role">Customer · ${esc(c.id)}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(c.id)}</span>
            <span class="badge badge-gray">${visits.length} visit${visits.length === 1 ? '' : 's'}</span>
            ${c.paymentStatus ? payStatusBadge(c.paymentStatus) : ''}
          </div>
        </div>
      </div>

      <div class="detail-section-title">Personal Information</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Date of Birth</div><div class="value">${fmtDate(c.dob)}${isTodayBirthday(c.dob) ? ' · ðŸŽ‚ Today!' : ''}</div></div>
        <div class="detail-item"><div class="label">Mobile Number</div><div class="value">${esc(c.mobile || '·')}</div></div>
        <div class="detail-item"><div class="label">Email Address</div><div class="value">${esc(c.email || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Address</div><div class="value">${esc(c.address || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Notes</div><div class="value">${esc(c.notes || '·')}</div></div>
      </div>

      <div class="detail-section-title">Assigned Employee &amp; Service</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Assigned Employee</div><div class="value">${esc(empCus?.fullName || '·')}</div></div>
        <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(empCus?.staffRole || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Service</div><div class="value">${esc(svcCus?.name || '·')}</div></div>
      </div>

      <div class="detail-section-title">Payment Details</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Total Amount</div><div class="value">${c.totalAmount ? `₹${esc(c.totalAmount)}` : '·'}</div></div>
        <div class="detail-item"><div class="label">Paid Amount</div><div class="value">${c.paidAmount ? `₹${esc(c.paidAmount)}` : '·'}</div></div>
        <div class="detail-item"><div class="label">Payment Method</div><div class="value">${esc(c.paymentMethod || '·')}</div></div>
        <div class="detail-item"><div class="label">Payment Status</div><div class="value">${c.paymentStatus ? payStatusBadge(c.paymentStatus) : '·'}</div></div>
      </div>

      ${visits.length
        ? `<div class="detail-section-title">Visit History (${visits.length})</div>
           <div class="detail-grid">
             ${visits
               .map((v) => {
                 const vEmp = db.employees.find((e) => e.id === v.employeeId);
                 return `<div class="detail-item span-2">
                   <div class="label">${esc(v.id)} · ${fmtDateTime(v.visitDateTime)}</div>
                   <div class="value">${esc(v.serviceName || 'Salon Visit')}${v.amount ? ` · ₹${esc(v.amount)}` : ''}</div>
                   <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
                     <span class="badge badge-gray">${esc(vEmp?.fullName || v.employeeId)}</span>
                     ${statusBadge(v.status)}
                     ${v.paymentStatus ? payStatusBadge(v.paymentStatus) : ''}
                   </div>
                 </div>`;
               })
               .join('')}
           </div>`
        : ''}`;

    openModal({
      title: 'Customer Details',
      subtitle: c.id,
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="close">Close</button>
        <button class="btn btn-ghost" data-act="visit">Record Visit</button>
        <button class="btn btn-primary" data-act="edit">Edit Customer</button>`,
      onOpen: (wrap, close) => {
        wrap.querySelector('[data-act="close"]').addEventListener('click', close);
        wrap.querySelector('[data-act="edit"]').addEventListener('click', () => {
          close();
          openCustomerForm(id);
        });
        wrap.querySelector('[data-act="visit"]').addEventListener('click', () => {
          close();
          openVisitForm(null, { customerId: id, employeeId: c.employeeId || '', serviceId: c.serviceId || '', amount: c.totalAmount || '' });
        });
      },
    });
  }

  async function deleteCustomer(id) {
    const c = db.customers.find((x) => x.id === id);
    if (!c) return;
    const related = db.visits.filter((v) => v.customerId === id).length;
    const ok = await confirmDialog({
      title: 'Delete Customer',
      message: `Are you sure you want to delete <strong>${esc(c.fullName)}</strong> (${esc(c.id)})?${related ? ` This will also remove <strong>${related}</strong> related visit${related === 1 ? '' : 's'}.` : ''} This action cannot be undone.`,
    });
    if (!ok) return;
    db.customers = db.customers.filter((x) => x.id !== id);
    db.visits = db.visits.filter((v) => v.customerId !== id);
    save();
    renderAll();
    toast('Customer deleted');
  }

  /* ================= VISITS ================= */
  let visitSearch = '';
  let visitFilterStatus = 'all';

  function renderVisits() {
    const q = visitSearch.toLowerCase();
    let list = [...db.visits].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (visitFilterStatus !== 'all') list = list.filter((v) => v.status === visitFilterStatus);
    if (q) {
      list = list.filter((v) => {
        const emp = db.employees.find((e) => e.id === v.employeeId);
        const cus = db.customers.find((c) => c.id === v.customerId);
        return (
          v.id.toLowerCase().includes(q) ||
          (v.serviceName || '').toLowerCase().includes(q) ||
          (emp?.fullName || '').toLowerCase().includes(q) ||
          (cus?.fullName || '').toLowerCase().includes(q)
        );
      });
    }

    const tbody = $('#visitTable tbody');
    const empty = $('#visitEmpty');
    const tableWrap = $('#visitTable').closest('.table-wrap');

    if (!db.visits.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No visits yet';
      empty.querySelector('.empty-text').textContent = 'Record a customer visit with an assigned employee.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching visits';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map((v) => {
        const emp = db.employees.find((e) => e.id === v.employeeId);
        const cus = db.customers.find((c) => c.id === v.customerId);
        return `
      <tr data-id="${esc(v.id)}">
        <td><strong style="color:var(--brand)">${esc(v.id)}</strong></td>
        <td>
          <div class="person-cell">
            ${avatarHTML(cus || { fullName: v.customerId })}
            <div>
              <div class="person-name">${esc(cus?.fullName || v.customerId)}</div>
              <div class="person-meta">${esc(cus?.mobile || '')}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="person-cell">
            ${avatarHTML(emp || { fullName: v.employeeId })}
            <div>
              <div class="person-name">${esc(emp?.fullName || v.employeeId)}</div>
              <div class="person-meta">${esc(emp?.staffRole || '')}</div>
            </div>
          </div>
        </td>
        <td>${esc(v.serviceName || '·')}</td>
        <td>${fmtDateTime(v.visitDateTime)}</td>
        <td>${v.amount ? `<strong>₹${esc(v.amount)}</strong>` : '·'} ${v.paymentStatus ? payStatusBadge(v.paymentStatus) : ''}</td>
        <td>${statusBadge(v.status)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="icon-action" data-act="view" title="View">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-action" data-act="edit" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-action danger" data-act="delete" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
      })
      .join('');

    $$('#visitTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewVisit(tr.dataset.id);
      });
    });

    $$('#visitTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'view') viewVisit(id);
        else if (act === 'edit') openVisitForm(id);
        else if (act === 'delete') deleteVisit(id);
      });
    });
  }

  function openVisitForm(id = null, prefill = {}) {
    const visit = id ? db.visits.find((v) => v.id === id) : null;

    if (!db.employees.length || !db.customers.length) {
      toast('Please add at least one employee and one customer first.', 'error');
      return;
    }

    const preCus = visit?.customerId || prefill.customerId || '';
    const preEmp = visit?.employeeId || prefill.employeeId || '';
    const preSvc = visit?.serviceId || prefill.serviceId || '';

    let amountVal = visit?.amount || '';
    if (!visit) {
      if (prefill.amount !== undefined && prefill.amount !== null && prefill.amount !== '') amountVal = prefill.amount;
      else if (preSvc) amountVal = db.services.find((s) => s.id === preSvc)?.price ?? '';
    }

    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${preEmp === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.specialties || e.id)}</option>`)
      .join('');
    const cusOptions = db.customers
      .map((c) => `<option value="${esc(c.id)}" ${preCus === c.id ? 'selected' : ''}>${esc(c.fullName)} (${esc(c.id)})</option>`)
      .join('');
    const svcOptions = db.services
      .map((s) => `<option value="${esc(s.id)}" ${preSvc === s.id ? 'selected' : ''}>${esc(s.name)}${s.price ? ` (₹${esc(s.price)})` : ''}</option>`)
      .join('');

    let localDT = visit?.visitDateTime ? visit.visitDateTime.slice(0, 16) : '';
    if (!localDT && !visit) {
      const now = new Date();
      localDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }

    const body = `
      <form id="visitForm" class="form-grid" autocomplete="off">
        <div class="field">
          <label>Visit ID</label>
          <div class="auto-id-box"><span>Auto-generated</span><span>${visit ? esc(visit.id) : peekId('visit')}</span></div>
        </div>
        <div class="field">
          <label>Visit Date &amp; Time <span class="req">*</span></label>
          <input type="datetime-local" name="visitDateTime" required value="${esc(localDT)}" />
        </div>

        <div class="field">
          <label>Customer <span class="req">*</span></label>
          <select name="customerId" required>
            <option value="">Select customer</option>
            ${cusOptions}
          </select>
        </div>
        <div class="field">
          <label>Assign To (Employee) <span class="req">*</span></label>
          <select name="employeeId" required>
            <option value="">Select employee</option>
            ${empOptions}
          </select>
        </div>

        <div class="field">
          <label>Service <span class="req">*</span></label>
          <select name="serviceId" required>
            <option value="">Select service</option>
            ${svcOptions}
          </select>
        </div>
        <div class="field">
          <label>Amount (₹)</label>
          <input type="number" name="amount" min="0" step="0.01" placeholder="e.g. 1500" value="${esc(amountVal)}" />
        </div>

        <div class="field">
          <label>Payment Method <span class="req">*</span></label>
          <select name="paymentMethod" required>
            ${['Cash', 'Card', 'UPI', 'Bank Transfer'].map((m) => `<option ${(visit?.paymentMethod || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Payment Status <span class="req">*</span></label>
          <select name="paymentStatus" required>
            ${['Paid', 'Partial', 'Pending'].map((p) => `<option ${(visit?.paymentStatus || 'Pending') === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Scheduled', 'In Progress', 'Completed'].map((s) => `<option ${(visit?.status || 'Scheduled') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"></div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Internal notes...">${esc(visit?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: visit ? 'Edit Visit' : 'New Visit',
      subtitle: visit ? `Updating ${visit.id}` : 'Record a customer visit & payment',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${visit ? 'Save Changes' : 'Save Visit'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#visitForm', wrap);

        // When picking a customer, pull their assigned employee, service & amount from the customer record
        if (!visit) {
          form.customerId.addEventListener('change', () => {
            const c = db.customers.find((x) => x.id === form.customerId.value);
            if (!c) return;
            if (c.employeeId && db.employees.some((e) => e.id === c.employeeId)) form.employeeId.value = c.employeeId;
            if (c.serviceId && db.services.some((s) => s.id === c.serviceId)) {
              form.serviceId.value = c.serviceId;
              form.amount.value = c.totalAmount || db.services.find((s) => s.id === c.serviceId)?.price || '';
            }
          });
        }

        form.serviceId.addEventListener('change', () => {
          const svc = db.services.find((s) => s.id === form.serviceId.value);
          if (svc && svc.price != null && svc.price !== '') form.amount.value = svc.price;
        });

        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          data.serviceName = db.services.find((s) => s.id === data.serviceId)?.name || '';

          if (visit) {
            Object.assign(visit, data);
            toast('Visit updated successfully');
          } else {
            data.id = nextId('visit');
            data.createdAt = new Date().toISOString();
            db.visits.push(data);
            toast(`Visit recorded · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  function viewVisit(id) {
    const v = db.visits.find((x) => x.id === id);
    if (!v) return;
    const emp = db.employees.find((e) => e.id === v.employeeId);
    const cus = db.customers.find((c) => c.id === v.customerId);

    const body = `
      <div class="profile-hero">
        ${avatarHTML(cus || { fullName: v.customerId }, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(v.serviceName || 'Salon Visit')}</h2>
          <div class="role">${esc(cus?.fullName || v.customerId)} · served by ${esc(emp?.fullName || v.employeeId)}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(v.id)}</span>
            ${statusBadge(v.status)}
            ${v.paymentStatus ? payStatusBadge(v.paymentStatus) : ''}
          </div>
        </div>
      </div>

      <div class="detail-section-title">Visit Information</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Visit Date &amp; Time</div><div class="value">${fmtDateTime(v.visitDateTime)}</div></div>
        <div class="detail-item"><div class="label">Service</div><div class="value">${esc(v.serviceName || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Notes</div><div class="value">${esc(v.notes || '·')}</div></div>
      </div>

      <div class="detail-section-title">Payment Details</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Amount</div><div class="value">${v.amount ? `₹${esc(v.amount)}` : '·'}</div></div>
        <div class="detail-item"><div class="label">Payment Method</div><div class="value">${esc(v.paymentMethod || '·')}</div></div>
        <div class="detail-item"><div class="label">Payment Status</div><div class="value">${v.paymentStatus ? payStatusBadge(v.paymentStatus) : '·'}</div></div>
        <div class="detail-item"><div class="label">Visit Status</div><div class="value">${statusBadge(v.status)}</div></div>
      </div>

      <div class="detail-section-title">Customer</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(cus?.fullName || v.customerId)}</div></div>
        <div class="detail-item"><div class="label">Mobile</div><div class="value">${esc(cus?.mobile || '·')}</div></div>
        <div class="detail-item"><div class="label">Email</div><div class="value">${esc(cus?.email || '·')}</div></div>
        <div class="detail-item"><div class="label">Customer ID</div><div class="value">${esc(cus?.id || v.customerId)}</div></div>
      </div>

      <div class="detail-section-title">Assigned Employee</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(emp?.fullName || v.employeeId)}</div></div>
        <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(emp?.staffRole || '·')}</div></div>
        <div class="detail-item"><div class="label">Specialties</div><div class="value">${esc(emp?.specialties || '·')}</div></div>
        <div class="detail-item"><div class="label">Employee ID</div><div class="value">${esc(emp?.id || v.employeeId)}</div></div>
      </div>`;

    openModal({
      title: 'Visit Details',
      subtitle: v.id,
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="close">Close</button>
        <button class="btn btn-primary" data-act="edit">Edit Visit</button>`,
      onOpen: (wrap, close) => {
        wrap.querySelector('[data-act="close"]').addEventListener('click', close);
        wrap.querySelector('[data-act="edit"]').addEventListener('click', () => {
          close();
          openVisitForm(id);
        });
      },
    });
  }

  async function deleteVisit(id) {
    const v = db.visits.find((x) => x.id === id);
    if (!v) return;
    const ok = await confirmDialog({
      title: 'Delete Visit',
      message: `Are you sure you want to delete visit <strong>${esc(v.id)}</strong>? This action cannot be undone.`,
    });
    if (!ok) return;
    db.visits = db.visits.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Visit deleted');
  }

  /* ================= BIRTHDAYS ================= */
  let birthdayFilter = 'all';

  function getUpcomingBirthdays() {
    const items = [];
    db.employees.forEach((e) => {
      if (!e.dob) return;
      const days = daysUntilBirthday(e.dob);
      if (days === null || days > 30) return;
      items.push({ type: 'employee', person: e, days });
    });
    db.customers.forEach((c) => {
      if (!c.dob) return;
      const days = daysUntilBirthday(c.dob);
      if (days === null || days > 30) return;
      items.push({ type: 'customer', person: c, days });
    });
    return items.sort((a, b) => a.days - b.days || a.person.fullName.localeCompare(b.person.fullName));
  }

  function renderBirthdays() {
    let items = getUpcomingBirthdays();
    if (birthdayFilter !== 'all') items = items.filter((b) => b.type === birthdayFilter);

    const grid = $('#birthdayGrid');
    const empty = $('#birthdayEmpty');

    if (!items.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    let lastMonth = '';
    grid.innerHTML = items
      .map((b) => {
        const dob = new Date(b.person.dob + 'T00:00:00');
        const monthKey = dob.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        let head = '';
        if (monthKey !== lastMonth) {
          lastMonth = monthKey;
          head = `<div class="birthday-month-head">${esc(monthKey)}</div>`;
        }

        const pillClass = b.days === 0 ? 'today' : b.days <= 7 ? 'soon' : 'later';
        const daysLabel = b.days === 0 ? 'Today' : b.days === 1 ? '1 day' : `${b.days} days`;

        return `${head}
        <div class="birthday-card ${b.days === 0 ? 'today-card' : b.days <= 7 ? 'soon-card' : ''}">
          ${avatarHTML(b.person, 'avatar-lg')}
          <div class="birthday-info">
            <h4>${esc(b.person.fullName)}</h4>
            <div class="meta">${b.type === 'employee' ? `Employee · ${esc(b.person.staffRole || b.person.specialties || '')}` : 'Customer'}</div>
            <div class="date">${fmtDate(b.person.dob)}</div>
          </div>
          <div class="days-pill ${pillClass}">
            <div class="num">${b.days === 0 ? 'ðŸŽ‚' : b.days}</div>
            <div class="lbl">${daysLabel}</div>
          </div>
        </div>`;
      })
      .join('');
  }

  /* ================= SERVICES ================= */
  let serviceSearch = '';

  function renderServices() {
    const q = serviceSearch.toLowerCase();
    const list = db.services.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
    );

    const grid = $('#serviceGrid');
    const empty = $('#serviceEmpty');

    if (!db.services.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No services yet';
      empty.querySelector('.empty-text').textContent = 'Add services offered by your business.';
      return;
    }
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      grid.innerHTML = '';
      empty.querySelector('.empty-title').textContent = 'No matching services';
      empty.querySelector('.empty-text').textContent = 'Try a different search term.';
      return;
    }

    grid.innerHTML = list
      .map(
        (s) => `
      <div class="service-card" data-id="${esc(s.id)}">
        <div class="service-card-top">
          <div class="service-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <div class="row-actions">
            <button class="icon-action" data-act="edit" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-action danger" data-act="delete" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div>
          <span class="badge badge-violet">${esc(s.category || 'General')}</span>
        </div>
        <h4>${esc(s.name)}</h4>
        <p class="desc">${esc(s.description || 'No description provided.')}</p>
        <div class="service-meta">
          <div class="service-price">${s.price != null && s.price !== '' ? `${esc(s.currency || 'â‚¹')}${Number(s.price).toLocaleString('en-IN')}` : '·'} <small>${s.price != null && s.price !== '' ? '/ ' + esc(s.unit || 'service') : ''}</small></div>
          ${s.status === 'Active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}
        </div>
      </div>`
      )
      .join('');

    $$('#serviceGrid [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('.service-card').dataset.id;
        if (btn.dataset.act === 'edit') openServiceForm(id);
        else if (btn.dataset.act === 'delete') deleteService(id);
      });
    });
  }

  function openServiceForm(id = null) {
    const svc = id ? db.services.find((s) => s.id === id) : null;

    const categories = ['General', 'Consulting', 'Support', 'Maintenance', 'Installation', 'Training', 'Subscription', 'Custom', 'Other'];

    const body = `
      <form id="svcForm" class="form-grid" autocomplete="off">
        <div class="field">
          <label>Service ID</label>
          <div class="auto-id-box"><span>Auto-generated</span><span>${svc ? esc(svc.id) : peekId('svc')}</span></div>
        </div>
        <div class="field">
          <label>Service Name <span class="req">*</span></label>
          <input name="name" required placeholder="e.g. Website Maintenance" value="${esc(svc?.name || '')}" />
        </div>

        <div class="field">
          <label>Category <span class="req">*</span></label>
          <select name="category" required>
            ${categories.map((c) => `<option ${(svc?.category || 'General') === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Active', 'Inactive'].map((s) => `<option ${(svc?.status || 'Active') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Description</label>
          <textarea name="description" placeholder="Describe this service...">${esc(svc?.description || '')}</textarea>
        </div>

        <div class="field">
          <label>Price</label>
          <input type="number" name="price" min="0" step="0.01" placeholder="e.g. 4999" value="${esc(svc?.price ?? '')}" />
        </div>
        <div class="field">
          <label>Billing Unit</label>
          <select name="unit">
            ${['service', 'hour', 'day', 'month', 'year', 'project'].map((u) => `<option ${(svc?.unit || 'service') === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </form>`;

    openModal({
      title: svc ? 'Edit Service' : 'Add Service',
      subtitle: svc ? `Updating ${svc.id}` : 'Add a new service to your catalog',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${svc ? 'Save Changes' : 'Add Service'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#svcForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          data.currency = 'â‚¹';

          if (svc) {
            Object.assign(svc, data);
            toast('Service updated successfully');
          } else {
            data.id = nextId('svc');
            data.createdAt = new Date().toISOString();
            db.services.push(data);
            toast(`Service added · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  async function deleteService(id) {
    const s = db.services.find((x) => x.id === id);
    if (!s) return;
    const ok = await confirmDialog({
      title: 'Delete Service',
      message: `Are you sure you want to delete <strong>${esc(s.name)}</strong> (${esc(s.id)})? This action cannot be undone.`,
    });
    if (!ok) return;
    db.services = db.services.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Service deleted');
  }

  /* ================= INIT ================= */
  function init() {
    // Today chip
    $('#todayChip').textContent = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Nav
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => goto(btn.dataset.section));
    });

    $$('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => goto(btn.dataset.goto));
    });

    // Mobile menu
    const sidebar = $('#sidebar');
    const sidebarBackdrop = $('#sidebarBackdrop');

    function closeSidebar() {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('show');
    }

    $('#menuToggle').addEventListener('click', () => {
      const open = sidebar.classList.toggle('open');
      sidebarBackdrop.classList.toggle('show', open);
    });
    sidebarBackdrop.addEventListener('click', closeSidebar);
    $$('.nav-item').forEach((btn) => btn.addEventListener('click', closeSidebar));
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 860 && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !e.target.closest('#menuToggle') && !e.target.closest('#sidebarBackdrop')) {
        closeSidebar();
      }
    });

    // Employee
    $('#addEmployeeBtn').addEventListener('click', () => openEmployeeForm());
    $('#employeeSearch').addEventListener('input', (e) => {
      employeeSearch = e.target.value;
      renderEmployees();
    });

    // Customer
    $('#addCustomerBtn').addEventListener('click', () => openCustomerForm());
    $('#customerSearch').addEventListener('input', (e) => {
      customerSearch = e.target.value;
      renderCustomers();
    });

    // Visits
    $('#addVisitBtn').addEventListener('click', () => openVisitForm());
    $('#visitSearch').addEventListener('input', (e) => {
      visitSearch = e.target.value;
      renderVisits();
    });
    $$('#visitFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#visitFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        visitFilterStatus = chip.dataset.status;
        renderVisits();
      });
    });

    // Birthdays
    $$('#birthdayFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#birthdayFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        birthdayFilter = chip.dataset.btype;
        renderBirthdays();
      });
    });

    // Services
    $('#addServiceBtn').addEventListener('click', () => openServiceForm());
    $('#serviceSearch').addEventListener('input', (e) => {
      serviceSearch = e.target.value;
      renderServices();
    });

    // First render
    goto('dashboard');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
