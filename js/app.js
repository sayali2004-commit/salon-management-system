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
    appointments: [],
    payments: [],
    expenses: [],
    maintenance: [],
    attendance: [],
    leaves: [],
    salaries: [],
    counters: { emp: 0, cus: 0, visit: 0, svc: 0, apt: 0, pay: 0, exp: 0, mnt: 0, att: 0, lv: 0, sal: 0 },
  };

  const ID_PREFIX = { emp: 'EMP', cus: 'CUS', visit: 'VIS', svc: 'SVC', apt: 'APT', pay: 'PAY', exp: 'EXP', mnt: 'MNT', att: 'ATT', lv: 'LV', sal: 'SAL' };

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
      ['appointments', 'payments', 'expenses', 'maintenance', 'attendance', 'leaves', 'salaries'].forEach((k) => {
        if (!Array.isArray(merged[k])) merged[k] = [];
      });
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
    return `${ID_PREFIX[type]}-${n}`;
  }

  function peekId(type) {
    const n = String((db.counters[type] || 0) + 1).padStart(4, '0');
    return `${ID_PREFIX[type]}-${n}`;
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
      ' · ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  }

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function monthISO(d = new Date()) {
    return d.toISOString().slice(0, 7);
  }

  function yearNum(d = new Date()) {
    return d.getFullYear();
  }

  function fmtMonth(ym) {
    if (!ym) return '·';
    const [y, m] = ym.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    if (isNaN(d)) return ym;
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  function isOnlineMethod(method) {
    return method === 'UPI' || method === 'Card' || method === 'Bank Transfer';
  }

  function daysBetween(fromISO, toISO) {
    if (!fromISO || !toISO) return 0;
    const a = new Date(fromISO + 'T00:00:00');
    const b = new Date(toISO + 'T00:00:00');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }

  function num(v) {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function fmtMoney(v) {
    return `₹${num(v).toLocaleString('en-IN')}`;
  }

  /* ---------------- Customer uniqueness (mobile dedup) ---------------- */
  function mobileKey(mobile) {
    const digits = String(mobile || '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  function findCustomerByMobile(mobile, excludeId = null) {
    const key = mobileKey(mobile);
    if (!key) return null;
    return db.customers.find((c) => c.id !== excludeId && mobileKey(c.mobile) === key) || null;
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

    // Auto-focus first field on desktop (pointer:fine) — avoids popping mobile keyboards
    try {
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        const first = wrap.querySelector('.modal-body input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), .modal-body select, .modal-body textarea');
        if (first && typeof first.focus === 'function') first.focus();
      }
    } catch {
      /* ignore */
    }

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

  /* ---------------- Autocomplete ---------------- */
  function setupAutocomplete({ input, list, search, renderItem, onChoose, onAddNew, addNewLabel, emptyMessage, onQueryChange }) {
    const wrap = input.closest('.autocomplete');
    let items = [];
    let activeIdx = -1;
    let blurTimer = null;

    function close() {
      if (wrap) wrap.classList.remove('open');
      activeIdx = -1;
    }

    function highlight(idx) {
      const nodes = list.querySelectorAll('[data-ac-item]');
      nodes.forEach((n, i) => n.classList.toggle('active', i === idx));
      activeIdx = idx;
      if (idx >= 0 && nodes[idx] && nodes[idx].scrollIntoView) nodes[idx].scrollIntoView({ block: 'nearest' });
    }

    function chooseByIndex(idx) {
      if (idx < 0 || idx >= items.length) return;
      const picked = items[idx];
      close();
      if (typeof onChoose === 'function') onChoose(picked);
    }

    function renderList() {
      const q = input.value.trim().toLowerCase();
      items = search(q);
      activeIdx = -1;

      let html = '';
      if (!items.length) {
        html = `<div class="ac-empty">${esc(emptyMessage)}</div>`;
      } else {
        html = items.map((it, i) => renderItem(it, i)).join('');
      }
      if (typeof onAddNew === 'function' && q) {
        html += `<div class="ac-add" data-ac-add="1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${esc(addNewLabel || 'Add new')}
        </div>`;
      }
      list.innerHTML = html;
      if (wrap) wrap.classList.add('open');
    }

    input.addEventListener('focus', () => {
      clearTimeout(blurTimer);
      renderList();
    });

    input.addEventListener('blur', () => {
      blurTimer = setTimeout(close, 160);
    });

    input.addEventListener('input', () => {
      if (typeof onQueryChange === 'function') onQueryChange();
      renderList();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!wrap || !wrap.classList.contains('open')) renderList();
        else highlight(Math.min(activeIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight(Math.max(activeIdx - 1, 0));
      } else if (e.key === 'Enter') {
        if (wrap && wrap.classList.contains('open') && activeIdx >= 0) {
          e.preventDefault();
          chooseByIndex(activeIdx);
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    list.addEventListener('mousedown', (e) => e.preventDefault());

    list.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-ac-add]');
      if (addBtn) {
        close();
        if (typeof onAddNew === 'function') onAddNew(input.value.trim());
        return;
      }
      const item = e.target.closest('[data-ac-item]');
      if (!item) return;
      const idx = Number(item.dataset.acIndex);
      chooseByIndex(idx);
    });

    return {
      close,
      refresh: renderList,
      clear() {
        items = [];
        activeIdx = -1;
        list.innerHTML = '';
        close();
      },
    };
  }

  /* ---------------- Global search ---------------- */
  function searchAll(q) {
    const results = [];
    const match = (v) => String(v || '').toLowerCase().includes(q);

    db.customers
      .filter((c) => match(c.fullName) || match(c.mobile) || match(c.email) || match(c.id))
      .slice(0, 4)
      .forEach((c) => results.push({ type: 'customer', id: c.id, title: c.fullName, meta: `${c.mobile || ''}${c.email ? ' · ' + c.email : ''}`, badge: c.id, icon: 'user' }));

    db.employees
      .filter((e) => match(e.fullName) || match(e.staffRole) || match(e.mobile) || match(e.id))
      .slice(0, 4)
      .forEach((e) => results.push({ type: 'employee', id: e.id, title: e.fullName, meta: `${e.staffRole || 'Employee'} · ${e.mobile || e.id}`, badge: e.id, icon: 'users' }));

    db.services
      .filter((s) => match(s.name) || match(s.category) || match(s.id))
      .slice(0, 3)
      .forEach((s) => results.push({ type: 'service', id: s.id, title: s.name, meta: `${s.category || 'General'}${s.price != null && s.price !== '' ? ' · ' + fmtMoney(s.price) : ''}`, badge: s.id, icon: 'tool' }));

    db.appointments
      .filter((a) => {
        const cus = db.customers.find((c) => c.id === a.customerId);
        return match(a.id) || match(a.serviceName) || match(cus?.fullName);
      })
      .slice(0, 3)
      .forEach((a) => {
        const cus = db.customers.find((c) => c.id === a.customerId);
        results.push({ type: 'appointment', id: a.id, title: a.serviceName || 'Appointment', meta: `${cus?.fullName || 'Customer'} · ${fmtDate(a.date)} ${a.time || ''}`, badge: a.id, icon: 'calendar' });
      });

    return results;
  }

  const GS_ICONS = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  };

  function openGlobalSearch() {
    openModal({
      title: 'Search',
      subtitle: 'Customers, employees, services & appointments',
      size: 'sm',
      body: `
        <div class="search-box" style="height:46px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="gsInput" placeholder="Type a name, mobile, ID or service..." autocomplete="off" />
        </div>
        <div class="gs-results" id="gsResults"></div>`,
      onOpen: (wrap, close) => {
        const input = $('#gsInput', wrap);
        const results = $('#gsResults', wrap);

        const run = () => {
          const q = input.value.trim().toLowerCase();
          if (!q) {
            results.innerHTML = `<div class="gs-hint">Start typing to search across the whole system — customers, employees, services and appointments.</div>`;
            return;
          }
          const items = searchAll(q);
          if (!items.length) {
            results.innerHTML = `<div class="gs-hint">No matches for "<strong>${esc(input.value.trim())}</strong>".</div>`;
            return;
          }
          results.innerHTML = items
            .map(
              (r) => `
            <div class="ac-item" data-gs-type="${r.type}" data-gs-id="${esc(r.id)}" role="button" tabindex="0">
              <span class="avatar" style="width:32px;height:32px;font-size:12px">${GS_ICONS[r.icon] || ''}</span>
              <div class="ac-info">
                <div class="ac-name">${esc(r.title)}</div>
                <div class="ac-meta">${esc(r.meta)}</div>
              </div>
              <span class="badge badge-gray">${esc(r.badge)}</span>
            </div>`
            )
            .join('');
        };

        input.addEventListener('input', run);
        results.addEventListener('click', (e) => {
          const item = e.target.closest('[data-gs-type]');
          if (!item) return;
          const type = item.dataset.gsType;
          const id = item.dataset.gsId;
          close();
          if (type === 'customer') viewCustomer(id);
          else if (type === 'employee') viewEmployee(id);
          else if (type === 'service') goto('services');
          else if (type === 'appointment') viewAppointment(id);
        });

        run();
        input.focus();
      },
    });
  }

  /* ---------------- Navigation ---------------- */
  const SECTIONS = {
    dashboard: { title: 'Dashboard', sub: 'Overview of your management system' },
    'employee-panel': { title: 'Employee Dashboard', sub: 'Sign in to view your attendance, leaves, salary & appointments' },
    employees: { title: 'Employees', sub: 'Create and manage your employee directory' },
    customers: { title: 'Customers', sub: 'Manage your customer records' },
    visits: { title: 'Visits', sub: 'Customer visits with assigned staff & payments' },
    appointments: { title: 'Appointments', sub: 'Schedule appointments with existing customers' },
    payments: { title: 'Payments', sub: 'Track every payment — cash & online' },
    expenses: { title: 'Expenses', sub: 'Record and monitor business expenses' },
    maintenance: { title: 'Maintenance', sub: 'Equipment servicing, repairs & cleaning tasks' },
    birthdays: { title: 'Birthdays', sub: 'Upcoming birthdays · employees & customers' },
    services: { title: 'Services', sub: 'Services offered by your business' },
    attendance: { title: 'Attendance', sub: 'Mark and review daily employee attendance' },
    leaves: { title: 'Leaves', sub: 'Employee leave requests & approvals' },
    salary: { title: 'Salary', sub: 'Monthly salary records & payments' },
  };

  let currentSection = 'dashboard';

  function goto(section) {
    currentSection = section;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
    $$('.bottom-nav [data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
    $$('.section').forEach((s) => s.classList.toggle('active', s.id === `section-${section}`));
    $('#pageTitle').textContent = SECTIONS[section].title;
    $('#pageSubtitle').textContent = SECTIONS[section].sub;
    render(section);
    updateNavBadges();
  }

  /* ---------------- Render dispatch ---------------- */
  function render(section) {
    switch (section) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'employee-panel':
        renderEmployeePanel();
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
      case 'appointments':
        renderAppointments();
        break;
      case 'payments':
        renderPayments();
        break;
      case 'expenses':
        renderExpenses();
        break;
      case 'maintenance':
        renderMaintenance();
        break;
      case 'birthdays':
        renderBirthdays();
        break;
      case 'services':
        renderServices();
        break;
      case 'attendance':
        renderAttendance();
        break;
      case 'leaves':
        renderLeaves();
        break;
      case 'salary':
        renderSalary();
        break;
    }
  }

  function renderAll() {
    render(currentSection);
    updateNavBadges();
  }

  function updateNavBadges() {
    const today = todayISO();
    const set = (key, n) => {
      const el = $('#navBadge-' + key);
      if (!el) return;
      el.hidden = !n;
      el.textContent = n;
    };
    set('appointments', db.appointments.filter((a) => a.date === today && (a.status === 'Scheduled' || a.status === 'Confirmed')).length);
    set('leaves', db.leaves.filter((l) => l.status === 'Pending').length);
    const markedToday = new Set(db.attendance.filter((a) => a.date === today).map((a) => a.employeeId));
    set('attendance', Math.max(db.employees.length - markedToday.size, 0));
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
      { label: 'Total Employees', value: empCount, sub: `${db.employees.filter((e) => e.employmentStatus === 'Active').length} active`, icon: 'users', accent: 'var(--brand)', bg: 'var(--brand-50)', goto: 'employees' },
      { label: 'Total Customers', value: cusCount, sub: `${db.customers.length} records`, icon: 'user', accent: 'var(--sky)', bg: 'var(--sky-50)', goto: 'customers' },
      { label: 'Open Visits', value: openVisits, sub: `${visitCount} total visits`, icon: 'calendar', accent: 'var(--violet)', bg: 'var(--violet-50)', goto: 'visits' },
      { label: "Today's Birthdays", value: todayB, sub: todayB ? 'Celebrate today!' : 'None today', icon: 'cake', accent: 'var(--amber)', bg: 'var(--amber-50)', goto: 'birthdays' },
      { label: 'Active Services', value: activeServices, sub: `${db.services.length} total services`, icon: 'tool', accent: 'var(--green)', bg: 'var(--green-50)', goto: 'services' },
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
      <div class="stat-card clickable" data-goto="${s.goto}" style="--stat-accent:${s.accent};--stat-bg:${s.bg}" role="button" tabindex="0">
        <div class="stat-top">
          <div class="stat-icon">${icons[s.icon]}</div>
        </div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    // Setup checklist — guide new users until core data exists
    const setupWrap = $('#setupChecklist');
    const setupSteps = $('#setupSteps');
    const missing = [];
    if (!db.services.length) missing.push({ id: 'service', title: 'Add your services', sub: 'Haircut, color, spa — with prices', action: 'service' });
    if (!db.employees.length) missing.push({ id: 'employee', title: 'Add your employees', sub: 'Stylists, barbers, staff', action: 'employee' });
    if (!db.customers.length) missing.push({ id: 'customer', title: 'Add your first customer', sub: 'Then book appointments anytime', action: 'customer' });

    if (missing.length) {
      setupWrap.hidden = false;
      setupSteps.innerHTML = missing
        .map(
          (m, i) => `
        <div class="setup-step">
          <span class="num">${i + 1}</span>
          <div class="lbl">${esc(m.title)}<small>${esc(m.sub)}</small></div>
          <button class="btn btn-primary btn-sm" data-setup="${m.action}">Add</button>
        </div>`
        )
        .join('');
      $$('#setupSteps [data-setup]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const a = btn.dataset.setup;
          if (a === 'service') openServiceForm();
          else if (a === 'employee') openEmployeeForm();
          else if (a === 'customer') openCustomerForm();
        });
      });
    } else {
      setupWrap.hidden = true;
      setupSteps.innerHTML = '';
    }

    // Today's schedule
    const today = todayISO();
    const todays = db.appointments
      .filter((a) => a.date === today)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    $('#dashToday').innerHTML = todays.length
      ? todays
          .slice(0, 6)
          .map((a) => {
            const cus = db.customers.find((c) => c.id === a.customerId);
            const emp = db.employees.find((e) => e.id === a.employeeId);
            return `
          <div class="mini-row">
            <div class="info">
              <div class="t">${esc(a.time || '·')} · ${esc(a.serviceName || 'Appointment')}</div>
              <div class="s">${esc(cus?.fullName || 'Customer')}${emp ? ' · ' + esc(emp.fullName) : ''}</div>
            </div>
            ${appointmentStatusBadge(a.status)}
          </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No appointments today. Book one from quick actions above.</p></div>`;

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
              <div class="s">${b.type === 'employee' ? 'Employee' : 'Customer'} · ${fmtDate(b.person.dob)}</div>
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
        <td data-label="Employee">
          <div class="person-cell">
            ${avatarHTML(e)}
            <div>
              <div class="person-name">${esc(e.fullName)}</div>
              <div class="person-meta">${esc(e.staffRole || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Employee ID"><strong style="color:var(--brand)">${esc(e.id)}</strong></td>
        <td data-label="Staff Role">${esc(e.staffRole || '·')}</td>
        <td data-label="Specialties">${esc(e.specialties || '·')}</td>
        <td data-label="Mobile">${esc(e.mobile || '·')}</td>
        <td data-label="Status">${empStatusBadge(e.employmentStatus)}</td>
        <td data-label="Joining Date">${fmtDate(e.joiningDate)}</td>
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
        <div class="detail-item"><div class="label">Date of Birth</div><div class="value">${fmtDate(e.dob)}${isTodayBirthday(e.dob) ? ' · 🎂 Today!' : ''}</div></div>
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
    const related =
      db.visits.filter((v) => v.employeeId === id).length +
      db.attendance.filter((a) => a.employeeId === id).length +
      db.leaves.filter((l) => l.employeeId === id).length +
      db.salaries.filter((s) => s.employeeId === id).length +
      db.maintenance.filter((m) => m.employeeId === id).length;
    const ok = await confirmDialog({
      title: 'Delete Employee',
      message: `Are you sure you want to delete <strong>${esc(e.fullName)}</strong> (${esc(e.id)})?${related ? ` This will also remove <strong>${related}</strong> related record${related === 1 ? '' : 's'} (visits, attendance, leaves, salary).` : ''} This action cannot be undone.`,
    });
    if (!ok) return;
    db.employees = db.employees.filter((x) => x.id !== id);
    db.visits = db.visits.filter((v) => v.employeeId !== id);
    db.attendance = db.attendance.filter((a) => a.employeeId !== id);
    db.leaves = db.leaves.filter((l) => l.employeeId !== id);
    db.salaries = db.salaries.filter((s) => s.employeeId !== id);
    db.maintenance = db.maintenance.filter((m) => m.employeeId !== id);
    save();
    renderAll();
    toast('Employee deleted');
  }

  /* ================= CUSTOMERS ================= */
  let customerSearch = '';

  function customerStatsData() {
    const today = todayISO();
    const thisMonth = monthISO();
    const thisYear = String(yearNum());

    const createdDate = (c) => (c.createdAt ? c.createdAt.slice(0, 10) : '');

    const todayCount = db.customers.filter((c) => createdDate(c) === today).length;
    const monthCount = db.customers.filter((c) => createdDate(c).slice(0, 7) === thisMonth).length;
    const yearCount = db.customers.filter((c) => createdDate(c).slice(0, 4) === thisYear).length;

    const online = db.customers.filter((c) => isOnlineMethod(c.paymentMethod));
    const cash = db.customers.filter((c) => c.paymentMethod === 'Cash');

    const sum = (arr) => arr.reduce((t, c) => t + num(c.paidAmount || c.totalAmount), 0);

    return {
      todayCount,
      monthCount,
      yearCount,
      total: db.customers.length,
      onlineCount: online.length,
      cashCount: cash.length,
      onlineAmount: sum(online),
      cashAmount: sum(cash),
    };
  }

  function renderCustomerStats() {
    const s = customerStatsData();
    const icons = {
      sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
      cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      year: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/></svg>',
      cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
    };

    const cards = [
      { label: "Today's Customers", value: s.todayCount, sub: `Added on ${fmtDate(todayISO())}`, icon: 'sun', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'This Month', value: s.monthCount, sub: fmtMonth(monthISO()), icon: 'cal', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'This Year', value: s.yearCount, sub: `${yearNum()} · ${s.total} total`, icon: 'year', accent: 'var(--violet)', bg: 'var(--violet-50)' },
      { label: 'Online Payments', value: s.onlineCount, sub: `${fmtMoney(s.onlineAmount)} collected`, icon: 'online', accent: 'var(--green)', bg: 'var(--green-50)' },
      { label: 'Cash Payments', value: s.cashCount, sub: `${fmtMoney(s.cashAmount)} collected`, icon: 'cash', accent: 'var(--amber)', bg: 'var(--amber-50)' },
    ];

    $('#customerStats').innerHTML = cards
      .map(
        (c) => `
      <div class="stat-card" style="--stat-accent:${c.accent};--stat-bg:${c.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[c.icon]}</div></div>
        <div class="stat-value">${c.value}</div>
        <div class="stat-label">${esc(c.label)}</div>
        <div class="stat-sub">${esc(c.sub)}</div>
      </div>`
      )
      .join('');
  }

  function renderCustomers() {
    renderCustomerStats();

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
        <td data-label="Customer">
          <div class="person-cell">
            ${avatarHTML(c)}
            <div>
              <div class="person-name">${esc(c.fullName)}</div>
              <div class="person-meta">${esc(c.address ? c.address.slice(0, 40) : '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Customer ID"><strong style="color:var(--brand)">${esc(c.id)}</strong></td>
        <td data-label="Mobile">${esc(c.mobile || '·')}</td>
        <td data-label="Email">${esc(c.email || '·')}</td>
        <td data-label="Assigned To">${esc(db.employees.find((e) => e.id === c.employeeId)?.fullName || '·')}</td>
        <td data-label="Payment">${c.totalAmount ? `<strong>${fmtMoney(c.totalAmount)}</strong>` : '·'} ${c.paymentStatus ? payStatusBadge(c.paymentStatus) : ''}</td>
        <td data-label="Date of Birth">${fmtDate(c.dob)}${isTodayBirthday(c.dob) ? ' 🎂' : ''}</td>
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

  function openCustomerForm(id = null, opts = {}) {
    const cus = id ? db.customers.find((c) => c.id === id) : null;

    if (!id && (!db.employees.length || !db.services.length)) {
      toast('Please add at least one employee and one service first.', 'error');
      return;
    }

    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${cus?.employeeId === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.specialties || e.id)}</option>`)
      .join('');
    const svcOptions = db.services
      .map((s) => `<option value="${esc(s.id)}" ${cus?.serviceId === s.id ? 'selected' : ''}>${esc(s.name)}${s.price ? ` (${fmtMoney(s.price)})` : ''}</option>`)
      .join('');

    const methods = [
      { v: 'Cash', hint: 'Pay at counter' },
      { v: 'UPI', hint: 'GPay / PhonePe' },
      { v: 'Card', hint: 'Credit / Debit' },
      { v: 'Bank Transfer', hint: 'NEFT / IMPS' },
    ];
    const selectedMethod = cus?.paymentMethod || 'Cash';

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${cus ? 'Edit Customer' : 'Add New Customer'}</h3>
          <p>${cus ? `Update the details of ${esc(cus.id)}` : 'Register a customer & record their first payment'}</p>
        </div>
        <span class="modal-hero-id">${cus ? esc(cus.id) : peekId('cus')}</span>
      </div>

      <form id="cusForm" class="form-grid" autocomplete="off">
        <div class="form-section-title first"><span class="num">1</span> Personal Information</div>

        <div class="field span-2">
          <label>Full Name <span class="req">*</span></label>
          <input name="fullName" required placeholder="e.g. Farhan Ahmed" value="${esc(cus?.fullName || '')}" />
        </div>

        <div class="field">
          <label>Date of Birth <span class="req">*</span></label>
          <input type="date" name="dob" required value="${esc(cus?.dob || '')}" />
        </div>
        <div class="field">
          <label>Mobile Number <span class="req">*</span></label>
          <input type="tel" name="mobile" required placeholder="e.g. +91 91234 56789" value="${esc(cus?.mobile || '')}" />
        </div>

        <div class="field span-2">
          <label>Email Address <span class="req">*</span></label>
          <input type="email" name="email" required placeholder="e.g. customer@email.com" value="${esc(cus?.email || '')}" />
        </div>

        <div class="field span-2">
          <label>Address</label>
          <textarea name="address" placeholder="Full address...">${esc(cus?.address || '')}</textarea>
        </div>

        <div class="form-section-title"><span class="num">2</span> Service &amp; Assignment</div>

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

        <div class="form-section-title"><span class="num">3</span> Payment Details</div>

        <div class="field">
          <label>Total Amount (₹)</label>
          <input type="number" name="totalAmount" min="0" step="0.01" placeholder="e.g. 2000" value="${esc(cus?.totalAmount || '')}" />
        </div>
        <div class="field">
          <label>Paid Amount (₹)</label>
          <input type="number" name="paidAmount" min="0" step="0.01" placeholder="e.g. 2000" value="${esc(cus?.paidAmount || '')}" />
        </div>

        <div class="field span-2">
          <label>Payment Method <span class="req">*</span></label>
          <div class="pay-methods">
            ${methods
              .map(
                (m) => `
              <label class="pay-method">
                <input type="radio" name="paymentMethod" value="${m.v}" ${selectedMethod === m.v ? 'checked' : ''} />
                <span>${m.v}</span>
              </label>`
              )
              .join('')}
          </div>
        </div>

        <div class="field">
          <label>Payment Status <span class="req">*</span></label>
          <select name="paymentStatus" required>
            ${['Paid', 'Partial', 'Pending'].map((p) => `<option ${(cus?.paymentStatus || 'Pending') === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="field"></div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional notes...">${esc(cus?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: cus ? 'Edit Customer' : 'Add Customer',
      subtitle: cus ? `Updating ${cus.id}` : 'New customer registration',
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
          const fd = new FormData(form);
          const data = Object.fromEntries(fd.entries());
          data.paymentMethod = fd.get('paymentMethod') || 'Cash';

          // Prevent duplicate customers — mobile number must be unique
          const duplicate = findCustomerByMobile(data.mobile, cus ? cus.id : null);
          if (duplicate) {
            if (!cus && opts.reuseOnDuplicateMobile) {
              // Reuse the existing customer instead of creating a duplicate
              toast(`Existing customer reused · ${duplicate.id} · ${duplicate.fullName}`);
              if (typeof opts.onSelectExisting === 'function') opts.onSelectExisting(duplicate);
              close();
              return;
            }
            toast(`Mobile number already registered to ${duplicate.fullName} (${duplicate.id}). Each customer can only be added once.`, 'error');
            return;
          }

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
            }

            // Auto-record a payment entry when an amount was paid
            if (num(data.paidAmount) > 0) {
              db.payments.push({
                id: nextId('pay'),
                customerId: data.id,
                amount: data.paidAmount,
                method: data.paymentMethod || 'Cash',
                status: data.paymentStatus === 'Pending' ? 'Pending' : 'Paid',
                date: todayISO(),
                notes: 'Payment received on customer registration',
                createdAt: new Date().toISOString(),
              });
            }

            toast(`Customer added · ${data.id}${data.serviceId ? ' · visit recorded' : ''}`);
            if (typeof opts.onCreated === 'function') opts.onCreated(data);
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
        <div class="detail-item"><div class="label">Date of Birth</div><div class="value">${fmtDate(c.dob)}${isTodayBirthday(c.dob) ? ' · 🎂 Today!' : ''}</div></div>
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
    const related =
      db.visits.filter((v) => v.customerId === id).length + db.appointments.filter((a) => a.customerId === id).length + db.payments.filter((p) => p.customerId === id).length;
    const ok = await confirmDialog({
      title: 'Delete Customer',
      message: `Are you sure you want to delete <strong>${esc(c.fullName)}</strong> (${esc(c.id)})?${related ? ` This will also remove <strong>${related}</strong> related record${related === 1 ? '' : 's'} (visits, appointments, payments).` : ''} This action cannot be undone.`,
    });
    if (!ok) return;
    db.customers = db.customers.filter((x) => x.id !== id);
    db.visits = db.visits.filter((v) => v.customerId !== id);
    db.appointments = db.appointments.filter((a) => a.customerId !== id);
    db.payments = db.payments.filter((p) => p.customerId !== id);
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
        <td data-label="Visit ID"><strong style="color:var(--brand)">${esc(v.id)}</strong></td>
        <td data-label="Customer">
          <div class="person-cell">
            ${avatarHTML(cus || { fullName: v.customerId })}
            <div>
              <div class="person-name">${esc(cus?.fullName || v.customerId)}</div>
              <div class="person-meta">${esc(cus?.mobile || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Assigned To">
          <div class="person-cell">
            ${avatarHTML(emp || { fullName: v.employeeId })}
            <div>
              <div class="person-name">${esc(emp?.fullName || v.employeeId)}</div>
              <div class="person-meta">${esc(emp?.staffRole || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Service">${esc(v.serviceName || '·')}</td>
        <td data-label="Visit Date &amp; Time">${fmtDateTime(v.visitDateTime)}</td>
        <td data-label="Payment">${v.amount ? `<strong>${fmtMoney(v.amount)}</strong>` : '·'} ${v.paymentStatus ? payStatusBadge(v.paymentStatus) : ''}</td>
        <td data-label="Status">${statusBadge(v.status)}</td>
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

  /* ================= APPOINTMENTS ================= */
  let appointmentSearch = '';
  let appointmentFilterStatus = 'all';

  function appointmentStatusBadge(status) {
    const map = { Scheduled: 'badge-amber', Confirmed: 'badge-sky', Completed: 'badge-green', Cancelled: 'badge-red' };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || '·')}</span>`;
  }

  function sortSearchResults(list, q, textOf) {
    if (!q) return list;
    const starts = [];
    const contains = [];
    list.forEach((item) => {
      const t = textOf(item);
      (t.startsWith(q) ? starts : contains).push(item);
    });
    return starts.concat(contains);
  }

  function searchCustomersForAutocomplete(q) {
    let list = db.customers;
    if (q) {
      list = list.filter((c) => {
        const name = String(c.fullName || '').toLowerCase();
        const mob = String(c.mobile || '').toLowerCase();
        const id = String(c.id || '').toLowerCase();
        return name.includes(q) || mob.includes(q) || id.includes(q);
      });
    }
    return sortSearchResults(list, q, (c) => String(c.fullName || '').toLowerCase()).slice(0, 8);
  }

  function searchServicesForAutocomplete(q) {
    let list = db.services.filter((s) => s.status !== 'Inactive');
    if (q) {
      list = list.filter((s) => {
        const name = String(s.name || '').toLowerCase();
        const cat = String(s.category || '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    }
    return sortSearchResults(list, q, (s) => String(s.name || '').toLowerCase()).slice(0, 8);
  }

  function renderAppointments() {
    const today = todayISO();
    const icons = {
      today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      upcoming: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    };

    const active = (a) => a.status === 'Scheduled' || a.status === 'Confirmed';
    const stats = [
      { label: "Today's Appointments", value: db.appointments.filter((a) => a.date === today).length, sub: fmtDate(today), icon: 'today', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Upcoming', value: db.appointments.filter((a) => active(a) && a.date >= today).length, sub: 'Scheduled & confirmed', icon: 'upcoming', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'Completed', value: db.appointments.filter((a) => a.status === 'Completed').length, sub: 'All time', icon: 'done', accent: 'var(--green)', bg: 'var(--green-50)' },
      { label: 'Cancelled', value: db.appointments.filter((a) => a.status === 'Cancelled').length, sub: 'All time', icon: 'cancel', accent: 'var(--red)', bg: 'var(--red-50)' },
    ];
    $('#appointmentStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    const q = appointmentSearch.toLowerCase();
    let list = [...db.appointments].sort((a, b) => `${b.date || ''}T${b.time || ''} ${b.createdAt || ''}`.localeCompare(`${a.date || ''}T${a.time || ''} ${a.createdAt || ''}`));
    if (appointmentFilterStatus !== 'all') list = list.filter((a) => a.status === appointmentFilterStatus);
    if (q) {
      list = list.filter((a) => {
        const cus = db.customers.find((c) => c.id === a.customerId);
        const emp = db.employees.find((e) => e.id === a.employeeId);
        return (
          a.id.toLowerCase().includes(q) ||
          (cus?.fullName || '').toLowerCase().includes(q) ||
          (a.serviceName || '').toLowerCase().includes(q) ||
          (emp?.fullName || '').toLowerCase().includes(q)
        );
      });
    }

    const tbody = $('#appointmentTable tbody');
    const empty = $('#appointmentEmpty');
    const tableWrap = $('#appointmentTable').closest('.table-wrap');

    if (!db.appointments.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No appointments yet';
      empty.querySelector('.empty-text').textContent = 'Schedule an appointment — pick an existing customer or add a new one.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching appointments';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map((a) => {
        const cus = db.customers.find((c) => c.id === a.customerId);
        const emp = db.employees.find((e) => e.id === a.employeeId);
        return `
      <tr data-id="${esc(a.id)}">
        <td data-label="Appointment ID"><strong style="color:var(--brand)">${esc(a.id)}</strong></td>
        <td data-label="Customer">
          <div class="person-cell">
            ${avatarHTML(cus || { fullName: a.customerId })}
            <div>
              <div class="person-name">${esc(cus?.fullName || 'Unknown customer')}</div>
              <div class="person-meta">${esc(cus?.mobile || a.customerId || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Service">
          <strong>${esc(a.serviceName || '·')}</strong>
          <div class="person-meta">${a.price != null && a.price !== '' ? fmtMoney(a.price) : '·'}</div>
        </td>
        <td data-label="Assigned To">${esc(emp?.fullName || '·')}</td>
        <td data-label="Date &amp; Time">${fmtDate(a.date)} · ${esc(a.time || '·')}</td>
        <td data-label="Status">${appointmentStatusBadge(a.status)}</td>
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

    $$('#appointmentTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewAppointment(tr.dataset.id);
      });
    });

    $$('#appointmentTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'view') viewAppointment(id);
        else if (act === 'edit') openAppointmentForm(id);
        else if (act === 'delete') deleteAppointment(id);
      });
    });
  }

  function openAppointmentForm(id = null) {
    const apt = id ? db.appointments.find((a) => a.id === id) : null;

    if (!db.employees.length) {
      toast('Please add at least one employee first.', 'error');
      return;
    }

    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${apt?.employeeId === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.id)}</option>`)
      .join('');
    const statuses = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled'];

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 15 11 17 15 13"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${apt ? 'Edit Appointment' : 'New Appointment'}</h3>
          <p>${apt ? `Update ${esc(apt.id)}` : 'Search an existing customer — no need to re-add them'}</p>
        </div>
        <span class="modal-hero-id">${apt ? esc(apt.id) : peekId('apt')}</span>
      </div>

      <form id="aptForm" class="form-grid" autocomplete="off">
        <div class="form-section-title first"><span class="num">1</span> Customer</div>

        <div class="field">
          <label>Customer <span class="req">*</span></label>
          <div class="autocomplete">
            <input type="text" id="aptCustomerInput" placeholder="Type name or mobile to search..." autocomplete="off" />
            <div class="ac-list" id="aptCustomerList"></div>
          </div>
          <input type="hidden" name="customerId" id="aptCustomerId" value="${esc(apt?.customerId || '')}" />
        </div>
        <div class="field">
          <label>Assigned Employee <span class="req">*</span></label>
          <select name="employeeId" required>
            <option value="">Select employee</option>
            ${empOptions}
          </select>
        </div>

        <div class="linked-record span-2" id="aptCustomerPreview" hidden></div>

        <div class="form-section-title"><span class="num">2</span> Service &amp; Pricing</div>

        <div class="field">
          <label>Service <span class="req">*</span></label>
          <div class="autocomplete">
            <input type="text" id="aptServiceInput" placeholder="Type service name to search..." autocomplete="off" />
            <div class="ac-list" id="aptServiceList"></div>
          </div>
          <input type="hidden" name="serviceId" id="aptServiceId" value="${esc(apt?.serviceId || '')}" />
        </div>
        <div class="field">
          <label>Service Price (auto-filled)</label>
          <div class="auto-price-box empty" id="aptPriceBox">Select a service to auto-fill price</div>
          <input type="hidden" name="price" id="aptPrice" value="${esc(apt?.price ?? '')}" />
        </div>

        <div class="form-section-title"><span class="num">3</span> Date &amp; Time</div>

        <div class="field">
          <label>Appointment Date <span class="req">*</span></label>
          <input type="date" name="date" required value="${esc(apt?.date || todayISO())}" />
        </div>
        <div class="field">
          <label>Appointment Time <span class="req">*</span></label>
          <input type="time" name="time" required value="${esc(apt?.time || '')}" />
        </div>

        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${statuses.map((s) => `<option ${(apt?.status || 'Scheduled') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"></div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any notes for this appointment...">${esc(apt?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: apt ? 'Edit Appointment' : 'New Appointment',
      subtitle: apt ? `Updating ${apt.id}` : 'Customer & service autocomplete enabled',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${apt ? 'Save Changes' : 'Save Appointment'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#aptForm', wrap);
        const custInput = $('#aptCustomerInput', wrap);
        const custList = $('#aptCustomerList', wrap);
        const custIdInput = $('#aptCustomerId', wrap);
        const preview = $('#aptCustomerPreview', wrap);
        const svcInput = $('#aptServiceInput', wrap);
        const svcList = $('#aptServiceList', wrap);
        const svcIdInput = $('#aptServiceId', wrap);
        const priceBox = $('#aptPriceBox', wrap);
        const priceInput = $('#aptPrice', wrap);
        const saveBtn = wrap.querySelector('[data-act="save"]');

        let saving = false;

        function selectCustomer(cus) {
          custIdInput.value = cus.id;
          custInput.value = cus.fullName || '';
          preview.hidden = false;
          preview.innerHTML = `
            ${avatarHTML(cus)}
            <div class="lr-info">
              <div class="lr-name">${esc(cus.fullName)}</div>
              <div class="lr-meta">${esc(cus.mobile || '')}${cus.email ? ' · ' + esc(cus.email) : ''}</div>
              <span class="lr-id">${esc(cus.id)}</span>
            </div>
            <button type="button" class="linked-clear" data-act="clear-customer" title="Clear customer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
          const clearBtn = preview.querySelector('[data-act="clear-customer"]');
          if (clearBtn) {
            clearBtn.addEventListener('click', () => {
              custIdInput.value = '';
              custInput.value = '';
              preview.hidden = true;
              preview.innerHTML = '';
              custInput.focus();
            });
          }
        }

        function clearCustomerSelection() {
          if (!custIdInput.value) return;
          custIdInput.value = '';
          preview.hidden = true;
          preview.innerHTML = '';
        }

        function selectService(svc) {
          svcIdInput.value = svc.id;
          svcInput.value = svc.name || '';
          priceInput.value = svc.price != null ? svc.price : '';
          if (svc.price != null && svc.price !== '') {
            priceBox.classList.remove('empty');
            priceBox.innerHTML = `${fmtMoney(svc.price)} <span class="price-unit">/ ${esc(svc.unit || 'service')}</span>`;
          } else {
            priceBox.classList.add('empty');
            priceBox.textContent = 'No price set for this service';
          }
        }

        function clearServiceSelection() {
          if (!svcIdInput.value) return;
          svcIdInput.value = '';
          priceInput.value = '';
          priceBox.classList.add('empty');
          priceBox.textContent = 'Select a service to auto-fill price';
        }

        setupAutocomplete({
          input: custInput,
          list: custList,
          emptyMessage: 'No customer found. Use "Add new customer" below to create one.',
          addNewLabel: 'Add new customer',
          search: (q) => searchCustomersForAutocomplete(q),
          renderItem: (c, i) => `
            <div class="ac-item" data-ac-item data-ac-index="${i}" data-id="${esc(c.id)}">
              ${avatarHTML(c)}
              <div class="ac-info">
                <div class="ac-name">${esc(c.fullName)}</div>
                <div class="ac-meta">${esc(c.mobile || '')}${c.email ? ' · ' + esc(c.email) : ''}</div>
              </div>
              <span class="ac-badge badge badge-brand">${esc(c.id)}</span>
            </div>`,
          onChoose: (cus) => selectCustomer(cus),
          onQueryChange: clearCustomerSelection,
          onAddNew: () => {
            openCustomerForm(null, {
              reuseOnDuplicateMobile: true,
              onCreated: (cus) => selectCustomer(cus),
              onSelectExisting: (cus) => selectCustomer(cus),
            });
          },
        });

        setupAutocomplete({
          input: svcInput,
          list: svcList,
          emptyMessage: 'No service found. Please add it in the Services section first.',
          addNewLabel: 'Add new service',
          search: (q) => searchServicesForAutocomplete(q),
          renderItem: (s, i) => `
            <div class="ac-item" data-ac-item data-ac-index="${i}" data-id="${esc(s.id)}">
              <div class="ac-info">
                <div class="ac-name">${esc(s.name)}</div>
                <div class="ac-meta">${esc(s.category || 'General')}</div>
              </div>
              <span class="ac-price">${s.price != null && s.price !== '' ? fmtMoney(s.price) : 'No price'}</span>
            </div>`,
          onChoose: (svc) => selectService(svc),
          onQueryChange: clearServiceSelection,
          onAddNew: () => {
            close();
            goto('services');
            openServiceForm();
          },
        });

        // Prefill for edit mode
        if (apt?.customerId) {
          const cus = db.customers.find((c) => c.id === apt.customerId);
          if (cus) selectCustomer(cus);
        }
        if (apt?.serviceId) {
          const svc = db.services.find((s) => s.id === apt.serviceId);
          if (svc) selectService(svc);
          else {
            priceBox.classList.remove('empty');
            priceBox.innerHTML = `${apt.price != null && apt.price !== '' ? fmtMoney(apt.price) : '·'} <span class="price-unit">saved rate</span>`;
            svcInput.value = apt.serviceName || '';
          }
        }

        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        saveBtn.addEventListener('click', () => {
          if (saving) return;
          if (!form.reportValidity()) return;

          const fd = new FormData(form);
          const data = Object.fromEntries(fd.entries());

          if (!data.customerId) {
            toast('Please select a customer from the suggestions, or add a new one.', 'error');
            custInput.focus();
            return;
          }
          const cus = db.customers.find((c) => c.id === data.customerId);
          if (!cus) {
            toast('Selected customer no longer exists. Please search again.', 'error');
            custIdInput.value = '';
            custInput.value = '';
            return;
          }
          if (!data.serviceId) {
            toast('Please select a service from the suggestions.', 'error');
            svcInput.focus();
            return;
          }
          const svc = db.services.find((s) => s.id === data.serviceId);
          if (!svc) {
            toast('Selected service no longer exists. Please search again or add it in Services.', 'error');
            svcIdInput.value = '';
            svcInput.value = '';
            return;
          }
          if (!data.date || !data.time) {
            toast('Please choose appointment date and time.', 'error');
            return;
          }

          // Prevent double bookings for the same customer at the same date & time
          const dup = db.appointments.find(
            (a) => a.id !== (apt ? apt.id : null) && a.customerId === data.customerId && a.date === data.date && a.time === data.time && a.status !== 'Cancelled'
          );
          if (dup) {
            toast(`${cus.fullName} already has an appointment at this date & time (${dup.id}).`, 'error');
            return;
          }

          // Always store the latest service name & price from the Services section
          data.serviceName = svc.name;
          data.price = svc.price != null && svc.price !== '' ? svc.price : '';

          saving = true;
          saveBtn.disabled = true;

          if (apt) {
            Object.assign(apt, data);
            apt.updatedAt = new Date().toISOString();
            toast('Appointment updated successfully');
          } else {
            data.id = nextId('apt');
            data.createdAt = new Date().toISOString();
            db.appointments.push(data);
            toast(`Appointment booked · ${data.id} · ${cus.fullName}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  function viewAppointment(id) {
    const a = db.appointments.find((x) => x.id === id);
    if (!a) return;
    const cus = db.customers.find((c) => c.id === a.customerId);
    const emp = db.employees.find((e) => e.id === a.employeeId);

    const body = `
      <div class="profile-hero">
        ${avatarHTML(cus || { fullName: a.customerId }, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(a.serviceName || 'Salon Appointment')}</h2>
          <div class="role">${esc(cus?.fullName || 'Unknown customer')} · ${fmtDate(a.date)} · ${esc(a.time || '·')}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(a.id)}</span>
            ${appointmentStatusBadge(a.status)}
            ${a.price != null && a.price !== '' ? `<span class="badge badge-green">${fmtMoney(a.price)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="detail-section-title">Appointment Details</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Date</div><div class="value">${fmtDate(a.date)}</div></div>
        <div class="detail-item"><div class="label">Time</div><div class="value">${esc(a.time || '·')}</div></div>
        <div class="detail-item"><div class="label">Service</div><div class="value">${esc(a.serviceName || '·')}</div></div>
        <div class="detail-item"><div class="label">Service Price</div><div class="value">${a.price != null && a.price !== '' ? fmtMoney(a.price) : '·'}</div></div>
        <div class="detail-item"><div class="label">Status</div><div class="value">${appointmentStatusBadge(a.status)}</div></div>
        <div class="detail-item"><div class="label">Notes</div><div class="value">${esc(a.notes || '·')}</div></div>
      </div>

      <div class="detail-section-title">Customer</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(cus?.fullName || 'Unknown')}</div></div>
        <div class="detail-item"><div class="label">Mobile</div><div class="value">${esc(cus?.mobile || '·')}</div></div>
        <div class="detail-item"><div class="label">Email</div><div class="value">${esc(cus?.email || '·')}</div></div>
        <div class="detail-item"><div class="label">Customer ID</div><div class="value">${esc(cus?.id || a.customerId)}</div></div>
      </div>

      <div class="detail-section-title">Assigned Employee</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(emp?.fullName || '·')}</div></div>
        <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(emp?.staffRole || '·')}</div></div>
      </div>`;

    openModal({
      title: 'Appointment Details',
      subtitle: a.id,
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="close">Close</button>
        <button class="btn btn-primary" data-act="edit">Edit Appointment</button>`,
      onOpen: (wrap, close) => {
        wrap.querySelector('[data-act="close"]').addEventListener('click', close);
        wrap.querySelector('[data-act="edit"]').addEventListener('click', () => {
          close();
          openAppointmentForm(id);
        });
      },
    });
  }

  async function deleteAppointment(id) {
    const a = db.appointments.find((x) => x.id === id);
    if (!a) return;
    const cus = db.customers.find((c) => c.id === a.customerId);
    const ok = await confirmDialog({
      title: 'Delete Appointment',
      message: `Are you sure you want to delete appointment <strong>${esc(a.id)}</strong> of <strong>${esc(cus?.fullName || a.customerId)}</strong> on ${fmtDate(a.date)}? This action cannot be undone.`,
    });
    if (!ok) return;
    db.appointments = db.appointments.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Appointment deleted');
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
            <div class="num">${b.days === 0 ? '🎂' : b.days}</div>
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
          <div class="service-price">${s.price != null && s.price !== '' ? `${fmtMoney(s.price)}` : '·'} <small>${s.price != null && s.price !== '' ? '/ ' + esc(s.unit || 'service') : ''}</small></div>
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
          data.currency = '₹';

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

  /* ================= PAYMENTS ================= */
  let paymentSearch = '';
  let paymentFilterMethod = 'all';
  let paymentFilterStatus = 'all';

  function renderPayments() {
    // Stats
    const today = todayISO();
    const thisMonth = monthISO();
    const thisYear = String(yearNum());
    const paid = db.payments.filter((p) => p.status === 'Paid');
    const sum = (arr) => arr.reduce((t, p) => t + num(p.amount), 0);

    const stats = [
      { label: "Today's Collections", value: fmtMoney(sum(db.payments.filter((p) => p.date === today))), sub: `${db.payments.filter((p) => p.date === today).length} transactions`, icon: 'sun', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'This Month', value: fmtMoney(sum(db.payments.filter((p) => (p.date || '').slice(0, 7) === thisMonth))), sub: fmtMonth(thisMonth), icon: 'cal', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'This Year', value: fmtMoney(sum(db.payments.filter((p) => (p.date || '').slice(0, 4) === thisYear))), sub: `${yearNum()}`, icon: 'year', accent: 'var(--violet)', bg: 'var(--violet-50)' },
      { label: 'Cash', value: fmtMoney(sum(paid.filter((p) => p.method === 'Cash'))), sub: `${paid.filter((p) => p.method === 'Cash').length} payments`, icon: 'cash', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Online', value: fmtMoney(sum(paid.filter((p) => isOnlineMethod(p.method)))), sub: `${paid.filter((p) => isOnlineMethod(p.method)).length} payments`, icon: 'online', accent: 'var(--green)', bg: 'var(--green-50)' },
    ];

    const icons = {
      sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
      cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      year: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
      online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/></svg>',
      cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
    };
    $('#paymentStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    // List
    const q = paymentSearch.toLowerCase();
    let list = [...db.payments].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (paymentFilterMethod === 'Cash') list = list.filter((p) => p.method === 'Cash');
    else if (paymentFilterMethod === 'online') list = list.filter((p) => isOnlineMethod(p.method));
    if (paymentFilterStatus !== 'all') list = list.filter((p) => p.status === paymentFilterStatus);
    if (q) {
      list = list.filter((p) => {
        const cus = db.customers.find((c) => c.id === p.customerId);
        return p.id.toLowerCase().includes(q) || (cus?.fullName || '').toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q);
      });
    }

    const tbody = $('#paymentTable tbody');
    const empty = $('#paymentEmpty');
    const tableWrap = $('#paymentTable').closest('.table-wrap');

    if (!db.payments.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No payments yet';
      empty.querySelector('.empty-text').textContent = 'Record your first payment to start tracking revenue.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching payments';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map((p) => {
        const cus = db.customers.find((c) => c.id === p.customerId);
        return `
      <tr data-id="${esc(p.id)}">
        <td data-label="Payment ID"><strong style="color:var(--brand)">${esc(p.id)}</strong></td>
        <td data-label="Customer">
          <div class="person-cell">
            ${avatarHTML(cus || { fullName: p.customerId || 'Walk-in' })}
            <div>
              <div class="person-name">${esc(cus?.fullName || 'Walk-in Customer')}</div>
              <div class="person-meta">${esc(p.customerId || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Amount"><strong class="amount-green">${fmtMoney(p.amount)}</strong></td>
        <td data-label="Method">${methodBadge(p.method)}</td>
        <td data-label="Status">${payStatusBadge(p.status)}</td>
        <td data-label="Date">${fmtDate(p.date)}</td>
        <td data-label="Notes">${esc(p.notes || '·')}</td>
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

    $$('#paymentTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewPayment(tr.dataset.id);
      });
    });
    $$('#paymentTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'view') viewPayment(id);
        else if (act === 'edit') openPaymentForm(id);
        else if (act === 'delete') deletePayment(id);
      });
    });
  }

  function methodBadge(method) {
    const cls = isOnlineMethod(method) ? 'badge-green' : method === 'Cash' ? 'badge-amber' : 'badge-gray';
    return `<span class="badge ${cls}">${esc(method || '·')}</span>`;
  }

  function payMethodRadios(selected) {
    const methods = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
    return `<div class="pay-methods">
      ${methods
        .map(
          (m) => `
        <label class="pay-method">
          <input type="radio" name="method" value="${m}" ${(selected || 'Cash') === m ? 'checked' : ''} />
          <span>${m}</span>
        </label>`
        )
        .join('')}
    </div>`;
  }

  function openPaymentForm(id = null) {
    const pay = id ? db.payments.find((p) => p.id === id) : null;
    const cusOptions = db.customers
      .map((c) => `<option value="${esc(c.id)}" ${pay?.customerId === c.id ? 'selected' : ''}>${esc(c.fullName)} (${esc(c.id)})</option>`)
      .join('');

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${pay ? 'Edit Payment' : 'Record Payment'}</h3>
          <p>${pay ? `Update ${esc(pay.id)}` : 'Log a cash or online payment received'}</p>
        </div>
        <span class="modal-hero-id">${pay ? esc(pay.id) : peekId('pay')}</span>
      </div>

      <form id="payForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Customer</label>
          <select name="customerId">
            <option value="">Walk-in customer (no record)</option>
            ${cusOptions}
          </select>
        </div>

        <div class="field">
          <label>Amount (₹) <span class="req">*</span></label>
          <input type="number" name="amount" min="0" step="0.01" required placeholder="e.g. 1500" value="${esc(pay?.amount || '')}" />
        </div>
        <div class="field">
          <label>Payment Date <span class="req">*</span></label>
          <input type="date" name="date" required value="${esc(pay?.date || todayISO())}" />
        </div>

        <div class="field span-2">
          <label>Payment Method <span class="req">*</span></label>
          ${payMethodRadios(pay?.method)}
        </div>

        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Paid', 'Pending'].map((s) => `<option ${(pay?.status || 'Paid') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"></div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="e.g. Payment for hair color service...">${esc(pay?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: pay ? 'Edit Payment' : 'Add Payment',
      subtitle: pay ? `Updating ${pay.id}` : 'Record a new payment',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${pay ? 'Save Changes' : 'Add Payment'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#payForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          const data = Object.fromEntries(fd.entries());
          data.method = fd.get('method') || 'Cash';

          if (pay) {
            Object.assign(pay, data);
            toast('Payment updated successfully');
          } else {
            data.id = nextId('pay');
            data.createdAt = new Date().toISOString();
            db.payments.push(data);
            toast(`Payment recorded · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  function viewPayment(id) {
    const p = db.payments.find((x) => x.id === id);
    if (!p) return;
    const cus = db.customers.find((c) => c.id === p.customerId);

    const body = `
      <div class="profile-hero">
        ${avatarHTML(cus || { fullName: 'Walk-in' }, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${fmtMoney(p.amount)}</h2>
          <div class="role">${esc(cus?.fullName || 'Walk-in Customer')} · ${esc(p.method || '·')}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(p.id)}</span>
            ${payStatusBadge(p.status)}
            ${methodBadge(p.method)}
          </div>
        </div>
      </div>

      <div class="detail-section-title">Payment Information</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Amount</div><div class="value">${fmtMoney(p.amount)}</div></div>
        <div class="detail-item"><div class="label">Payment Date</div><div class="value">${fmtDate(p.date)}</div></div>
        <div class="detail-item"><div class="label">Method</div><div class="value">${esc(p.method || '·')}</div></div>
        <div class="detail-item"><div class="label">Status</div><div class="value">${payStatusBadge(p.status)}</div></div>
        <div class="detail-item span-2"><div class="label">Notes</div><div class="value">${esc(p.notes || '·')}</div></div>
      </div>

      ${
        cus
          ? `<div class="detail-section-title">Customer</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(cus.fullName)}</div></div>
        <div class="detail-item"><div class="label">Mobile</div><div class="value">${esc(cus.mobile || '·')}</div></div>
      </div>`
          : ''
      }`;

    openModal({
      title: 'Payment Details',
      subtitle: p.id,
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="close">Close</button>
        <button class="btn btn-primary" data-act="edit">Edit Payment</button>`,
      onOpen: (wrap, close) => {
        wrap.querySelector('[data-act="close"]').addEventListener('click', close);
        wrap.querySelector('[data-act="edit"]').addEventListener('click', () => {
          close();
          openPaymentForm(id);
        });
      },
    });
  }

  async function deletePayment(id) {
    const p = db.payments.find((x) => x.id === id);
    if (!p) return;
    const ok = await confirmDialog({
      title: 'Delete Payment',
      message: `Are you sure you want to delete payment <strong>${esc(p.id)}</strong> of ${fmtMoney(p.amount)}? This action cannot be undone.`,
    });
    if (!ok) return;
    db.payments = db.payments.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Payment deleted');
  }

  /* ================= EXPENSES ================= */
  let expenseSearch = '';
  let expenseFilterCat = 'all';

  function renderExpenses() {
    const today = todayISO();
    const thisMonth = monthISO();
    const thisYear = String(yearNum());
    const sum = (arr) => arr.reduce((t, e) => t + num(e.amount), 0);

    const icons = {
      sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
      cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      year: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
      list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    };

    const stats = [
      { label: "Today's Expenses", value: fmtMoney(sum(db.expenses.filter((e) => e.date === today))), sub: `${db.expenses.filter((e) => e.date === today).length} entries`, icon: 'sun', accent: 'var(--red)', bg: 'var(--red-50)' },
      { label: 'This Month', value: fmtMoney(sum(db.expenses.filter((e) => (e.date || '').slice(0, 7) === thisMonth))), sub: fmtMonth(thisMonth), icon: 'cal', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'This Year', value: fmtMoney(sum(db.expenses.filter((e) => (e.date || '').slice(0, 4) === thisYear))), sub: `${yearNum()}`, icon: 'year', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Total Entries', value: db.expenses.length, sub: 'All recorded expenses', icon: 'list', accent: 'var(--violet)', bg: 'var(--violet-50)' },
      { label: 'Avg / Entry', value: fmtMoney(db.expenses.length ? sum(db.expenses) / db.expenses.length : 0), sub: 'Per expense record', icon: 'down', accent: 'var(--sky)', bg: 'var(--sky-50)' },
    ];
    $('#expenseStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    const q = expenseSearch.toLowerCase();
    let list = [...db.expenses].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (expenseFilterCat !== 'all') list = list.filter((e) => e.category === expenseFilterCat);
    if (q) {
      list = list.filter((e) => e.id.toLowerCase().includes(q) || (e.title || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q));
    }

    const tbody = $('#expenseTable tbody');
    const empty = $('#expenseEmpty');
    const tableWrap = $('#expenseTable').closest('.table-wrap');

    if (!db.expenses.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No expenses yet';
      empty.querySelector('.empty-text').textContent = 'Track business expenses like rent, supplies and bills.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching expenses';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    const catBadge = (cat) => {
      const map = { Rent: 'badge-brand', Utilities: 'badge-sky', Supplies: 'badge-violet', Salary: 'badge-green', Marketing: 'badge-amber' };
      return `<span class="badge ${map[cat] || 'badge-gray'}">${esc(cat || 'Other')}</span>`;
    };

    tbody.innerHTML = list
      .map(
        (e) => `
      <tr data-id="${esc(e.id)}">
        <td data-label="Expense ID"><strong style="color:var(--brand)">${esc(e.id)}</strong></td>
        <td data-label="Title">${esc(e.title || '·')}</td>
        <td data-label="Category">${catBadge(e.category)}</td>
        <td data-label="Amount"><strong class="amount-red">${fmtMoney(e.amount)}</strong></td>
        <td data-label="Method">${methodBadge(e.method)}</td>
        <td data-label="Date">${fmtDate(e.date)}</td>
        <td class="col-actions">
          <div class="row-actions">
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

    $$('#expenseTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        if (btn.dataset.act === 'edit') openExpenseForm(id);
        else if (btn.dataset.act === 'delete') deleteExpense(id);
      });
    });
  }

  function openExpenseForm(id = null) {
    const exp = id ? db.expenses.find((e) => e.id === id) : null;
    const categories = ['Rent', 'Utilities', 'Supplies', 'Inventory', 'Equipment', 'Marketing', 'Salary', 'Transport', 'Housekeeping', 'Other'];

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#f5644e,#d93737 60%,#a82323);box-shadow:0 8px 18px rgba(217,55,55,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${exp ? 'Edit Expense' : 'Add Expense'}</h3>
          <p>${exp ? `Update ${esc(exp.id)}` : 'Record a business expense entry'}</p>
        </div>
        <span class="modal-hero-id">${exp ? esc(exp.id) : peekId('exp')}</span>
      </div>

      <form id="expForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Expense Title <span class="req">*</span></label>
          <input name="title" required placeholder="e.g. Monthly shop rent" value="${esc(exp?.title || '')}" />
        </div>

        <div class="field">
          <label>Category <span class="req">*</span></label>
          <select name="category" required>
            ${categories.map((c) => `<option ${(exp?.category || 'Other') === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Amount (₹) <span class="req">*</span></label>
          <input type="number" name="amount" min="0" step="0.01" required placeholder="e.g. 25000" value="${esc(exp?.amount || '')}" />
        </div>

        <div class="field">
          <label>Expense Date <span class="req">*</span></label>
          <input type="date" name="date" required value="${esc(exp?.date || todayISO())}" />
        </div>
        <div class="field">
          <label>Paid Via <span class="req">*</span></label>
          <select name="method" required>
            ${['Cash', 'UPI', 'Card', 'Bank Transfer'].map((m) => `<option ${(exp?.method || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional details...">${esc(exp?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: exp ? 'Edit Expense' : 'Add Expense',
      subtitle: exp ? `Updating ${exp.id}` : 'New expense entry',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${exp ? 'Save Changes' : 'Add Expense'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#expForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          if (exp) {
            Object.assign(exp, data);
            toast('Expense updated successfully');
          } else {
            data.id = nextId('exp');
            data.createdAt = new Date().toISOString();
            db.expenses.push(data);
            toast(`Expense added · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  async function deleteExpense(id) {
    const e = db.expenses.find((x) => x.id === id);
    if (!e) return;
    const ok = await confirmDialog({
      title: 'Delete Expense',
      message: `Are you sure you want to delete <strong>${esc(e.title || e.id)}</strong> (${fmtMoney(e.amount)})? This action cannot be undone.`,
    });
    if (!ok) return;
    db.expenses = db.expenses.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Expense deleted');
  }

  /* ================= MAINTENANCE ================= */
  let maintenanceSearch = '';
  let maintenanceFilterStatus = 'all';

  function renderMaintenance() {
    const icons = {
      all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>',
      done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      cost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
    };

    const stats = [
      { label: 'Total Tasks', value: db.maintenance.length, sub: 'All maintenance records', icon: 'all', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Pending', value: db.maintenance.filter((m) => m.status === 'Pending').length, sub: 'Awaiting action', icon: 'pending', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'In Progress', value: db.maintenance.filter((m) => m.status === 'In Progress').length, sub: 'Currently being worked on', icon: 'progress', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'Completed', value: db.maintenance.filter((m) => m.status === 'Completed').length, sub: 'Tasks finished', icon: 'done', accent: 'var(--green)', bg: 'var(--green-50)' },
      { label: 'Total Cost', value: fmtMoney(db.maintenance.reduce((t, m) => t + num(m.cost), 0)), sub: 'Across all tasks', icon: 'cost', accent: 'var(--violet)', bg: 'var(--violet-50)' },
    ];
    $('#maintenanceStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    const q = maintenanceSearch.toLowerCase();
    let list = [...db.maintenance].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (maintenanceFilterStatus !== 'all') list = list.filter((m) => m.status === maintenanceFilterStatus);
    if (q) {
      list = list.filter(
        (m) => m.id.toLowerCase().includes(q) || (m.title || '').toLowerCase().includes(q) || (m.asset || '').toLowerCase().includes(q) || (m.category || '').toLowerCase().includes(q)
      );
    }

    const tbody = $('#maintenanceTable tbody');
    const empty = $('#maintenanceEmpty');
    const tableWrap = $('#maintenanceTable').closest('.table-wrap');

    if (!db.maintenance.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No maintenance tasks';
      empty.querySelector('.empty-text').textContent = 'Track equipment servicing, repairs and cleaning schedules.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching tasks';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    const prioBadge = (p) => {
      const map = { Low: 'badge-gray', Medium: 'badge-sky', High: 'badge-amber', Urgent: 'badge-red' };
      return `<span class="badge ${map[p] || 'badge-gray'}">${esc(p || '·')}</span>`;
    };

    tbody.innerHTML = list
      .map((m) => {
        const emp = db.employees.find((e) => e.id === m.employeeId);
        return `
      <tr data-id="${esc(m.id)}">
        <td data-label="Task ID"><strong style="color:var(--brand)">${esc(m.id)}</strong></td>
        <td data-label="Task">${esc(m.title || '·')}</td>
        <td data-label="Asset / Area">${esc(m.asset || '·')}</td>
        <td data-label="Priority">${prioBadge(m.priority)}</td>
        <td data-label="Status">${maintenanceStatusBadge(m.status)}</td>
        <td data-label="Scheduled">${fmtDate(m.scheduledDate)}</td>
        <td data-label="Cost">${m.cost ? fmtMoney(m.cost) : '·'}</td>
        <td data-label="Assigned To">${esc(emp?.fullName || '·')}</td>
        <td class="col-actions">
          <div class="row-actions">
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

    $$('#maintenanceTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        if (btn.dataset.act === 'edit') openMaintenanceForm(id);
        else if (btn.dataset.act === 'delete') deleteMaintenance(id);
      });
    });
  }

  function maintenanceStatusBadge(status) {
    const map = { Pending: 'badge-amber', 'In Progress': 'badge-sky', Completed: 'badge-green' };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || '·')}</span>`;
  }

  function openMaintenanceForm(id = null) {
    const m = id ? db.maintenance.find((x) => x.id === id) : null;
    const categories = ['Equipment', 'Facility', 'Cleaning', 'Repair', 'Safety', 'Other'];
    const priorities = ['Low', 'Medium', 'High', 'Urgent'];

    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${m?.employeeId === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.id)}</option>`)
      .join('');

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed 60%,#5b21b6);box-shadow:0 8px 18px rgba(124,58,237,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${m ? 'Edit Task' : 'New Maintenance Task'}</h3>
          <p>${m ? `Update ${esc(m.id)}` : 'Schedule a repair, cleaning or servicing task'}</p>
        </div>
        <span class="modal-hero-id">${m ? esc(m.id) : peekId('mnt')}</span>
      </div>

      <form id="mntForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Task Title <span class="req">*</span></label>
          <input name="title" required placeholder="e.g. Service hair dryer machine" value="${esc(m?.title || '')}" />
        </div>

        <div class="field">
          <label>Asset / Area <span class="req">*</span></label>
          <input name="asset" required placeholder="e.g. Hair Dryer #2 / Wash Station" value="${esc(m?.asset || '')}" />
        </div>
        <div class="field">
          <label>Category <span class="req">*</span></label>
          <select name="category" required>
            ${categories.map((c) => `<option ${(m?.category || 'Equipment') === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Priority <span class="req">*</span></label>
          <select name="priority" required>
            ${priorities.map((p) => `<option ${(m?.priority || 'Medium') === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Pending', 'In Progress', 'Completed'].map((s) => `<option ${(m?.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Scheduled Date <span class="req">*</span></label>
          <input type="date" name="scheduledDate" required value="${esc(m?.scheduledDate || todayISO())}" />
        </div>
        <div class="field">
          <label>Cost (₹)</label>
          <input type="number" name="cost" min="0" step="0.01" placeholder="e.g. 800" value="${esc(m?.cost || '')}" />
        </div>

        <div class="field span-2">
          <label>Assign To (Employee)</label>
          <select name="employeeId">
            <option value="">Unassigned</option>
            ${empOptions}
          </select>
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Additional instructions...">${esc(m?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: m ? 'Edit Task' : 'New Maintenance Task',
      subtitle: m ? `Updating ${m.id}` : 'Maintenance scheduling',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${m ? 'Save Changes' : 'Create Task'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#mntForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          if (m) {
            Object.assign(m, data);
            toast('Task updated successfully');
          } else {
            data.id = nextId('mnt');
            data.createdAt = new Date().toISOString();
            db.maintenance.push(data);
            toast(`Task created · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  async function deleteMaintenance(id) {
    const m = db.maintenance.find((x) => x.id === id);
    if (!m) return;
    const ok = await confirmDialog({
      title: 'Delete Task',
      message: `Are you sure you want to delete <strong>${esc(m.title || m.id)}</strong>? This action cannot be undone.`,
    });
    if (!ok) return;
    db.maintenance = db.maintenance.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Task deleted');
  }

  /* ================= ATTENDANCE ================= */
  let attendanceSearch = '';
  let attendanceDate = todayISO();

  function attendanceFor(employeeId, date) {
    return db.attendance.find((a) => a.employeeId === employeeId && a.date === date);
  }

  function setAttendance(employeeId, status) {
    let rec = attendanceFor(employeeId, attendanceDate);
    if (rec) {
      rec.status = status;
    } else {
      rec = {
        id: nextId('att'),
        employeeId,
        date: attendanceDate,
        status,
        checkIn: status === 'Absent' ? '' : '09:00',
        notes: '',
        createdAt: new Date().toISOString(),
      };
      db.attendance.push(rec);
    }
    save();
    renderAttendance();
  }

  function renderAttendance() {
    const date = attendanceDate;
    const dayRecs = db.attendance.filter((a) => a.date === date);
    const icons = {
      present: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      late: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      absent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      half: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>',
      total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    };

    const stats = [
      { label: 'Present', value: dayRecs.filter((a) => a.status === 'Present').length, sub: fmtDate(date), icon: 'present', accent: 'var(--green)', bg: 'var(--green-50)' },
      { label: 'Late', value: dayRecs.filter((a) => a.status === 'Late').length, sub: fmtDate(date), icon: 'late', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Absent', value: dayRecs.filter((a) => a.status === 'Absent').length, sub: fmtDate(date), icon: 'absent', accent: 'var(--red)', bg: 'var(--red-50)' },
      { label: 'Half Day', value: dayRecs.filter((a) => a.status === 'Half Day').length, sub: fmtDate(date), icon: 'half', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'Not Marked', value: Math.max(db.employees.length - dayRecs.length, 0), sub: `${db.employees.length} employees`, icon: 'total', accent: 'var(--text-2)', bg: '#f0f1f4' },
    ];
    $('#attendanceStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    const q = attendanceSearch.toLowerCase();
    const list = db.employees.filter((e) => !q || e.fullName.toLowerCase().includes(q) || (e.staffRole || '').toLowerCase().includes(q) || e.id.toLowerCase().includes(q));

    const wrap = $('#attendanceList');
    const empty = $('#attendanceEmpty');

    if (!db.employees.length) {
      wrap.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No employees to mark';
      empty.querySelector('.empty-text').textContent = 'Add employees first, then mark their daily attendance here.';
      return;
    }
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      wrap.innerHTML = '';
      empty.querySelector('.empty-title').textContent = 'No matching employees';
      empty.querySelector('.empty-text').textContent = 'Try a different search term.';
      return;
    }

    const segBtn = (rec, status, cls) => {
      const on = rec?.status === status ? `on-${cls}` : '';
      return `<button class="${on}" data-status="${status}">${status}</button>`;
    };

    wrap.innerHTML = list
      .map((e) => {
        const rec = attendanceFor(e.id, date);
        return `
      <div class="att-row" data-id="${esc(e.id)}">
        <div class="att-row-top">
          ${avatarHTML(e)}
          <div class="info">
            <div class="t">${esc(e.fullName)}</div>
            <div class="s">${esc(e.staffRole || '')} · ${esc(e.id)}${rec ? ' · ' + esc(rec.status) : ' · Not marked'}</div>
          </div>
          ${rec ? `<span class="badge ${rec.status === 'Present' ? 'badge-green' : rec.status === 'Late' ? 'badge-amber' : rec.status === 'Absent' ? 'badge-red' : 'badge-sky'}">${esc(rec.status)}</span>` : '<span class="badge badge-gray">Not marked</span>'}
        </div>
        <div class="att-controls">
          <div class="seg-group">
            ${segBtn(rec, 'Present', 'present')}
            ${segBtn(rec, 'Late', 'late')}
            ${segBtn(rec, 'Absent', 'absent')}
            ${segBtn(rec, 'Half Day', 'half')}
          </div>
          <div class="att-checkin">
            <label>Check-in</label>
            <input type="time" value="${esc(rec?.checkIn || '')}" data-role="checkin" ${rec?.status === 'Absent' ? 'disabled' : ''} />
            ${rec ? `<button class="icon-action danger" data-act="remove" title="Remove record"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
          </div>
        </div>
      </div>`;
      })
      .join('');

    $$('#attendanceList .att-row').forEach((row) => {
      const empId = row.dataset.id;
      $$('.seg-group button', row).forEach((btn) => {
        btn.addEventListener('click', () => setAttendance(empId, btn.dataset.status));
      });
      const timeInput = row.querySelector('[data-role="checkin"]');
      if (timeInput) {
        timeInput.addEventListener('change', () => {
          const rec = attendanceFor(empId, date);
          if (!rec) return;
          rec.checkIn = timeInput.value;
          save();
        });
      }
      const removeBtn = row.querySelector('[data-act="remove"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          db.attendance = db.attendance.filter((a) => !(a.employeeId === empId && a.date === date));
          save();
          renderAttendance();
          toast('Attendance record removed');
        });
      }
    });
  }

  function markAllPresent() {
    if (!db.employees.length) {
      toast('No employees to mark.', 'error');
      return;
    }
    let count = 0;
    db.employees.forEach((e) => {
      const rec = attendanceFor(e.id, attendanceDate);
      if (rec) {
        if (rec.status === 'Absent' || rec.status === 'Late' || rec.status === 'Half Day') {
          rec.status = 'Present';
          count++;
        }
      } else {
        db.attendance.push({
          id: nextId('att'),
          employeeId: e.id,
          date: attendanceDate,
          status: 'Present',
          checkIn: '09:00',
          notes: '',
          createdAt: new Date().toISOString(),
        });
        count++;
      }
    });
    save();
    renderAttendance();
    toast(count ? `${count} employee${count === 1 ? '' : 's'} marked present` : 'Everyone already marked present');
  }

  /* ================= LEAVES ================= */
  let leaveSearch = '';
  let leaveFilterStatus = 'all';

  function leaveStatusBadge(status) {
    const map = { Pending: 'badge-amber', Approved: 'badge-green', Rejected: 'badge-red' };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || '·')}</span>`;
  }

  function renderLeaves() {
    const icons = {
      total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      approved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      rejected: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      days: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    };

    const approved = db.leaves.filter((l) => l.status === 'Approved');
    const stats = [
      { label: 'Total Requests', value: db.leaves.length, sub: 'All time', icon: 'total', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Pending', value: db.leaves.filter((l) => l.status === 'Pending').length, sub: 'Awaiting review', icon: 'pending', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Approved', value: approved.length, sub: 'Leaves granted', icon: 'approved', accent: 'var(--green)', bg: 'var(--green-50)' },
      { label: 'Rejected', value: db.leaves.filter((l) => l.status === 'Rejected').length, sub: 'Leaves declined', icon: 'rejected', accent: 'var(--red)', bg: 'var(--red-50)' },
      { label: 'Approved Days', value: approved.reduce((t, l) => t + daysBetween(l.fromDate, l.toDate), 0), sub: 'Total leave days', icon: 'days', accent: 'var(--violet)', bg: 'var(--violet-50)' },
    ];
    $('#leaveStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    const q = leaveSearch.toLowerCase();
    let list = [...db.leaves].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (leaveFilterStatus !== 'all') list = list.filter((l) => l.status === leaveFilterStatus);
    if (q) {
      list = list.filter((l) => {
        const emp = db.employees.find((e) => e.id === l.employeeId);
        return l.id.toLowerCase().includes(q) || (emp?.fullName || '').toLowerCase().includes(q) || (l.type || '').toLowerCase().includes(q) || (l.reason || '').toLowerCase().includes(q);
      });
    }

    const tbody = $('#leaveTable tbody');
    const empty = $('#leaveEmpty');
    const tableWrap = $('#leaveTable').closest('.table-wrap');

    if (!db.leaves.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No leave requests';
      empty.querySelector('.empty-text').textContent = 'Employee leave requests will appear here for approval.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching requests';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map((l) => {
        const emp = db.employees.find((e) => e.id === l.employeeId);
        return `
      <tr data-id="${esc(l.id)}">
        <td data-label="Request ID"><strong style="color:var(--brand)">${esc(l.id)}</strong></td>
        <td data-label="Employee">
          <div class="person-cell">
            ${avatarHTML(emp || { fullName: l.employeeId })}
            <div>
              <div class="person-name">${esc(emp?.fullName || l.employeeId)}</div>
              <div class="person-meta">${esc(emp?.staffRole || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Leave Type"><span class="badge badge-violet">${esc(l.type || '·')}</span></td>
        <td data-label="From">${fmtDate(l.fromDate)}</td>
        <td data-label="To">${fmtDate(l.toDate)}</td>
        <td data-label="Days"><strong>${daysBetween(l.fromDate, l.toDate)}</strong></td>
        <td data-label="Status">${leaveStatusBadge(l.status)}</td>
        <td class="col-actions">
          <div class="row-actions">
            ${l.status === 'Pending' ? `<button class="icon-action" data-act="approve" title="Approve" style="color:var(--green);border-color:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
            <button class="icon-action" data-act="reject" title="Reject" style="color:var(--red);border-color:var(--red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
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

    $$('#leaveTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'edit') openLeaveForm(id);
        else if (act === 'delete') deleteLeave(id);
        else if (act === 'approve') updateLeaveStatus(id, 'Approved');
        else if (act === 'reject') updateLeaveStatus(id, 'Rejected');
      });
    });
  }

  function updateLeaveStatus(id, status) {
    const l = db.leaves.find((x) => x.id === id);
    if (!l) return;
    l.status = status;
    save();
    renderAll();
    toast(`Leave ${status.toLowerCase()}`);
  }

  function openLeaveForm(id = null, prefill = {}) {
    const l = id ? db.leaves.find((x) => x.id === id) : null;
    if (!db.employees.length) {
      toast('Please add at least one employee first.', 'error');
      return;
    }

    const preEmp = l?.employeeId || prefill.employeeId || '';
    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${preEmp === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.id)}</option>`)
      .join('');
    const types = ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave', 'Maternity Leave', 'Paternity Leave', 'Other'];

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#f59e0b,#c77700 60%,#92400e);box-shadow:0 8px 18px rgba(199,119,0,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M9 16h6"/><path d="M12 13v6"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${l ? 'Edit Leave Request' : 'New Leave Request'}</h3>
          <p>${l ? `Update ${esc(l.id)}` : 'Record a leave request for an employee'}</p>
        </div>
        <span class="modal-hero-id">${l ? esc(l.id) : peekId('lv')}</span>
      </div>

      <form id="lvForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Employee <span class="req">*</span></label>
          <select name="employeeId" required>
            <option value="">Select employee</option>
            ${empOptions}
          </select>
        </div>

        <div class="field">
          <label>Leave Type <span class="req">*</span></label>
          <select name="type" required>
            ${types.map((t) => `<option ${(l?.type || 'Casual Leave') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Pending', 'Approved', 'Rejected'].map((s) => `<option ${(l?.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>From Date <span class="req">*</span></label>
          <input type="date" name="fromDate" required value="${esc(l?.fromDate || todayISO())}" />
        </div>
        <div class="field">
          <label>To Date <span class="req">*</span></label>
          <input type="date" name="toDate" required value="${esc(l?.toDate || todayISO())}" />
        </div>

        <div class="field span-2">
          <label>Reason</label>
          <textarea name="reason" placeholder="Reason for leave...">${esc(l?.reason || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: l ? 'Edit Leave Request' : 'New Leave Request',
      subtitle: l ? `Updating ${l.id}` : 'Employee leave management',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${l ? 'Save Changes' : 'Submit Request'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#lvForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          if (data.toDate < data.fromDate) {
            toast('To date must be on or after from date.', 'error');
            return;
          }
          if (l) {
            Object.assign(l, data);
            toast('Leave request updated');
          } else {
            data.id = nextId('lv');
            data.createdAt = new Date().toISOString();
            db.leaves.push(data);
            toast(`Leave request created · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  async function deleteLeave(id) {
    const l = db.leaves.find((x) => x.id === id);
    if (!l) return;
    const emp = db.employees.find((e) => e.id === l.employeeId);
    const ok = await confirmDialog({
      title: 'Delete Leave Request',
      message: `Are you sure you want to delete the leave request <strong>${esc(l.id)}</strong> of <strong>${esc(emp?.fullName || l.employeeId)}</strong>? This action cannot be undone.`,
    });
    if (!ok) return;
    db.leaves = db.leaves.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Leave request deleted');
  }

  /* ================= SALARY ================= */
  let salarySearch = '';
  let salaryFilterStatus = 'all';

  function salaryStatusBadge(status) {
    const map = { Paid: 'badge-green', Pending: 'badge-amber' };
    return `<span class="badge ${map[status] || 'badge-gray'}">${esc(status || '·')}</span>`;
  }

  function renderSalary() {
    const icons = {
      paid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
      month: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      bonus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    };

    const thisMonth = monthISO();
    const paid = db.salaries.filter((s) => s.status === 'Paid');
    const sum = (arr) => arr.reduce((t, s) => t + num(s.net), 0);

    const stats = [
      { label: 'Total Paid', value: fmtMoney(sum(paid)), sub: `${paid.length} salary records`, icon: 'paid', accent: 'var(--green)', bg: 'var(--green-50)' },
      { label: 'This Month Paid', value: fmtMoney(sum(paid.filter((s) => s.month === thisMonth))), sub: fmtMonth(thisMonth), icon: 'month', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Pending Amount', value: fmtMoney(sum(db.salaries.filter((s) => s.status === 'Pending'))), sub: `${db.salaries.filter((s) => s.status === 'Pending').length} unpaid records`, icon: 'pending', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Total Records', value: db.salaries.length, sub: 'All salary entries', icon: 'total', accent: 'var(--violet)', bg: 'var(--violet-50)' },
      { label: 'Total Bonuses', value: fmtMoney(db.salaries.reduce((t, s) => t + num(s.bonus), 0)), sub: 'Bonuses paid out', icon: 'bonus', accent: 'var(--sky)', bg: 'var(--sky-50)' },
    ];
    $('#salaryStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${esc(s.sub)}</div>
      </div>`
      )
      .join('');

    const q = salarySearch.toLowerCase();
    let list = [...db.salaries].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (salaryFilterStatus !== 'all') list = list.filter((s) => s.status === salaryFilterStatus);
    if (q) {
      list = list.filter((s) => {
        const emp = db.employees.find((e) => e.id === s.employeeId);
        return s.id.toLowerCase().includes(q) || (emp?.fullName || '').toLowerCase().includes(q) || (s.month || '').toLowerCase().includes(q);
      });
    }

    const tbody = $('#salaryTable tbody');
    const empty = $('#salaryEmpty');
    const tableWrap = $('#salaryTable').closest('.table-wrap');

    if (!db.salaries.length) {
      tableWrap.style.display = 'none';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = 'No salary records';
      empty.querySelector('.empty-text').textContent = 'Record monthly salary payments for your employees.';
      return;
    }
    tableWrap.style.display = '';
    empty.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      empty.querySelector('.empty-title').textContent = 'No matching records';
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map((s) => {
        const emp = db.employees.find((e) => e.id === s.employeeId);
        return `
      <tr data-id="${esc(s.id)}">
        <td data-label="Record ID"><strong style="color:var(--brand)">${esc(s.id)}</strong></td>
        <td data-label="Employee">
          <div class="person-cell">
            ${avatarHTML(emp || { fullName: s.employeeId })}
            <div>
              <div class="person-name">${esc(emp?.fullName || s.employeeId)}</div>
              <div class="person-meta">${esc(emp?.staffRole || '')}</div>
            </div>
          </div>
        </td>
        <td data-label="Month">${esc(fmtMonth(s.month))}</td>
        <td data-label="Basic">${fmtMoney(s.basic)}</td>
        <td data-label="Bonus">${num(s.bonus) ? `<strong class="amount-green">+${fmtMoney(s.bonus)}</strong>` : '·'}</td>
        <td data-label="Deductions">${num(s.deductions) ? `<strong class="amount-red">-${fmtMoney(s.deductions)}</strong>` : '·'}</td>
        <td data-label="Net Salary"><strong>${fmtMoney(s.net)}</strong></td>
        <td data-label="Status">${salaryStatusBadge(s.status)}</td>
        <td class="col-actions">
          <div class="row-actions">
            ${s.status === 'Pending' ? `<button class="icon-action" data-act="paid" title="Mark as Paid" style="color:var(--green);border-color:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
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

    $$('#salaryTable [data-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = btn.closest('tr').dataset.id;
        const act = btn.dataset.act;
        if (act === 'edit') openSalaryForm(id);
        else if (act === 'delete') deleteSalary(id);
        else if (act === 'paid') markSalaryPaid(id);
      });
    });
  }

  function markSalaryPaid(id) {
    const s = db.salaries.find((x) => x.id === id);
    if (!s) return;
    s.status = 'Paid';
    s.paidDate = todayISO();
    save();
    renderAll();
    toast('Salary marked as paid');
  }

  function openSalaryForm(id = null) {
    const sal = id ? db.salaries.find((x) => x.id === id) : null;
    if (!db.employees.length) {
      toast('Please add at least one employee first.', 'error');
      return;
    }

    const empOptions = db.employees
      .map((e) => `<option value="${esc(e.id)}" ${sal?.employeeId === e.id ? 'selected' : ''}>${esc(e.fullName)} · ${esc(e.staffRole || e.id)}</option>`)
      .join('');
    const methods = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

    const net = num(sal?.basic) + num(sal?.bonus) - num(sal?.deductions);

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#34d399,#12a150 60%,#0a6b35);box-shadow:0 8px 18px rgba(18,161,80,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${sal ? 'Edit Salary Record' : 'Pay Salary'}</h3>
          <p>${sal ? `Update ${esc(sal.id)}` : 'Record a monthly salary payment'}</p>
        </div>
        <span class="modal-hero-id">${sal ? esc(sal.id) : peekId('sal')}</span>
      </div>

      <form id="salForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Employee <span class="req">*</span></label>
          <select name="employeeId" required>
            <option value="">Select employee</option>
            ${empOptions}
          </select>
        </div>

        <div class="field">
          <label>Salary Month <span class="req">*</span></label>
          <input type="month" name="month" required value="${esc(sal?.month || monthISO())}" />
        </div>
        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Pending', 'Paid'].map((s) => `<option ${(sal?.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field">
          <label>Basic Salary (₹) <span class="req">*</span></label>
          <input type="number" name="basic" min="0" step="0.01" required placeholder="e.g. 25000" value="${esc(sal?.basic || '')}" />
        </div>
        <div class="field">
          <label>Bonus (₹)</label>
          <input type="number" name="bonus" min="0" step="0.01" placeholder="e.g. 2000" value="${esc(sal?.bonus || '')}" />
        </div>

        <div class="field">
          <label>Deductions (₹)</label>
          <input type="number" name="deductions" min="0" step="0.01" placeholder="e.g. 500" value="${esc(sal?.deductions || '')}" />
        </div>
        <div class="field">
          <label>Payment Date</label>
          <input type="date" name="paidDate" value="${esc(sal?.paidDate || '')}" />
        </div>

        <div class="field span-2">
          <label>Payment Method <span class="req">*</span></label>
          <select name="method" required>
            ${methods.map((m) => `<option ${(sal?.method || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional notes...">${esc(sal?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: sal ? 'Edit Salary' : 'Pay Salary',
      subtitle: sal ? `Updating ${sal.id}` : 'New salary record',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${sal ? 'Save Changes' : 'Save Salary'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#salForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          data.net = num(data.basic) + num(data.bonus) - num(data.deductions);
          if (data.status === 'Paid' && !data.paidDate) data.paidDate = todayISO();

          if (sal) {
            Object.assign(sal, data);
            toast('Salary record updated');
          } else {
            data.id = nextId('sal');
            data.createdAt = new Date().toISOString();
            db.salaries.push(data);
            toast(`Salary recorded · ${data.id}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  async function deleteSalary(id) {
    const s = db.salaries.find((x) => x.id === id);
    if (!s) return;
    const emp = db.employees.find((e) => e.id === s.employeeId);
    const ok = await confirmDialog({
      title: 'Delete Salary Record',
      message: `Are you sure you want to delete the salary record <strong>${esc(s.id)}</strong> of <strong>${esc(emp?.fullName || s.employeeId)}</strong> (${esc(fmtMonth(s.month))})? This action cannot be undone.`,
    });
    if (!ok) return;
    db.salaries = db.salaries.filter((x) => x.id !== id);
    save();
    renderAll();
    toast('Salary record deleted');
  }

﻿  /* ================= EMPLOYEE PANEL (employee-side dashboard) ================= */
  const PANEL_EMP_KEY = 'salon_panel_emp';
  let panelEmployeeSearch = '';
  let panelEmployeeId = '';
  let panelTab = 'overview';
  let panelAptFilter = 'today';

  try {
    panelEmployeeId = localStorage.getItem(PANEL_EMP_KEY) || '';
  } catch {
    panelEmployeeId = '';
  }

  function setPanelEmployee(id) {
    panelEmployeeId = id || '';
    panelTab = 'overview';
    try {
      if (id) localStorage.setItem(PANEL_EMP_KEY, id);
      else localStorage.removeItem(PANEL_EMP_KEY);
    } catch {
      /* ignore storage errors */
    }
    renderEmployeePanel();
  }

  function employeeCheckIn(empId) {
    const t = todayISO();
    if (attendanceFor(empId, t)) {
      toast('You are already checked in today.', 'error');
      return;
    }
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    db.attendance.push({
      id: nextId('att'),
      employeeId: empId,
      date: t,
      status: 'Present',
      checkIn: hhmm,
      notes: 'Self check-in from employee dashboard',
      createdAt: now.toISOString(),
    });
    save();
    renderAll();
    toast(`Checked in at ${hhmm}`);
  }

  function attStatusBadgeLocal(status) {
    const cls = status === 'Present' ? 'badge-green' : status === 'Late' ? 'badge-amber' : status === 'Absent' ? 'badge-red' : 'badge-sky';
    return `<span class="badge ${cls}">${esc(status || '·')}</span>`;
  }

  function renderEmployeePanel() {
    const emp = db.employees.find((e) => e.id === panelEmployeeId);
    const login = $('#panelLogin');
    const app = $('#panelApp');

    if (!emp) {
      if (panelEmployeeId) setPanelEmployee('');
      login.hidden = false;
      app.hidden = true;
      renderEmployeePicker();
      return;
    }

    login.hidden = true;
    app.hidden = false;

    // Header
    $('#panelDashHead').innerHTML = `
      ${avatarHTML(emp, 'avatar-lg')}
      <div class="edh-info">
        <div class="edh-name">${esc(emp.fullName)}</div>
        <div class="edh-meta">${esc(emp.staffRole || 'Employee')} · ${esc(emp.id)} · ${esc(emp.shift || 'No shift')}</div>
        <div class="edh-badges">
          ${empStatusBadge(emp.employmentStatus)}
          ${isTodayBirthday(emp.dob) ? '<span class="badge badge-amber">🎂 Birthday today</span>' : ''}
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="panelSignOutBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </button>`;
    const signOutBtn = $('#panelSignOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        setPanelEmployee('');
        toast('Signed out successfully');
      });
    }

    // Tabs
    $$('#panelTabs .chip').forEach((c) => c.classList.toggle('active', c.dataset.ptab === panelTab));

    renderPanelTab(emp);
  }

  function renderPanelTab(emp) {
    const root = $('#panelTabContent');
    if (panelTab === 'appointments') root.innerHTML = panelAppointmentsHTML(emp);
    else if (panelTab === 'attendance') {
      root.innerHTML = panelAttendanceHTML(emp);
      wirePanelAttendance(root, emp);
    } else if (panelTab === 'leaves') {
      root.innerHTML = panelLeavesHTML(emp);
      wirePanelLeaves(root, emp);
    } else if (panelTab === 'salary') root.innerHTML = panelSalaryHTML(emp);
    else if (panelTab === 'profile') root.innerHTML = panelProfileHTML(emp);
    else {
      root.innerHTML = panelOverviewHTML(emp);
      wirePanelOverview(root, emp);
    }
  }

  /* ---------- Overview ---------- */
  function panelOverviewHTML(emp) {
    const today = todayISO();
    const thisMonth = monthISO();

    const todayRec = attendanceFor(emp.id, today);
    const todaysApts = db.appointments
      .filter((a) => a.employeeId === emp.id && a.date === today && a.status !== 'Cancelled')
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const upcoming = db.appointments.filter((a) => a.employeeId === emp.id && (a.status === 'Scheduled' || a.status === 'Confirmed') && a.date >= today);
    const myLeaves = db.leaves.filter((l) => l.employeeId === emp.id);
    const pendingLeaves = myLeaves.filter((l) => l.status === 'Pending');
    const salaryThisMonth = db.salaries.find((s) => s.employeeId === emp.id && s.month === thisMonth);
    const recentAtt = db.attendance
      .filter((a) => a.employeeId === emp.id)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 5);

    const icons = {
      att: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>',
      pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
    };

    const stats = [
      { label: "Today's Attendance", value: todayRec ? todayRec.status : 'Not marked', sub: todayRec ? `Check-in ${todayRec.checkIn || '·'}` : 'Tap Check In below', icon: 'att', accent: todayRec ? 'var(--green)' : 'var(--amber)', bg: todayRec ? 'var(--green-50)' : 'var(--amber-50)' },
      { label: "Today's Appointments", value: todaysApts.length, sub: fmtDate(today), icon: 'cal', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Upcoming Appointments', value: upcoming.length, sub: `${db.appointments.filter((a) => a.employeeId === emp.id).length} total`, icon: 'up', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'Pending Leaves', value: pendingLeaves.length, sub: `${myLeaves.length} request(s) total`, icon: 'leave', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Salary This Month', value: salaryThisMonth ? fmtMoney(salaryThisMonth.net) : '—', sub: salaryThisMonth ? salaryStatusBadge(salaryThisMonth.status) : fmtMonth(thisMonth), icon: 'pay', accent: 'var(--violet)', bg: 'var(--violet-50)' },
    ];

    return `
      <div class="panel-quick-row">
        ${
          todayRec
            ? `<button class="btn btn-ghost" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Checked in · ${esc(todayRec.checkIn || todayRec.status)}
              </button>`
            : `<button class="btn btn-primary" data-pan-act="checkin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Check In Now
              </button>`
        }
        <button class="btn btn-ghost" data-pan-act="leave">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Request Leave
        </button>
      </div>

      <div class="stat-grid">
        ${stats
          .map(
            (s) => `
          <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
            <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${esc(s.label)}</div>
            <div class="stat-sub">${s.sub}</div>
          </div>`
          )
          .join('')}
      </div>

      <div class="detail-section-title">Today's Schedule</div>
      <div class="panel">
        <div class="panel-body">
          ${
            todaysApts.length
              ? todaysApts
                  .map((a) => {
                    const cus = db.customers.find((c) => c.id === a.customerId);
                    return `
                <div class="emp-list-item">
                  <div class="eli-info">
                    <div class="eli-t">${esc(a.time || '·')} · ${esc(a.serviceName || 'Appointment')}</div>
                    <div class="eli-s">${esc(cus?.fullName || 'Customer')}${cus?.mobile ? ' · ' + esc(cus.mobile) : ''}</div>
                  </div>
                  <div class="eli-right">
                    ${appointmentStatusBadge(a.status)}
                    ${a.price != null && a.price !== '' ? `<span class="eli-amount amount-green">${fmtMoney(a.price)}</span>` : ''}
                  </div>
                </div>`;
                  })
                  .join('')
              : `<div class="empty-state empty-inline"><p class="empty-text">No appointments today.</p></div>`
          }
        </div>
      </div>

      <div class="detail-section-title">Recent Attendance</div>
      <div class="panel">
        <div class="panel-body">
          ${
            recentAtt.length
              ? recentAtt
                  .map(
                    (a) => `
                <div class="emp-list-item">
                  <div class="eli-info">
                    <div class="eli-t">${fmtDate(a.date)}</div>
                    <div class="eli-s">${a.checkIn ? 'Check-in ' + esc(a.checkIn) : 'No check-in time'}</div>
                  </div>
                  <div class="eli-right">${attStatusBadgeLocal(a.status)}</div>
                </div>`
                  )
                  .join('')
              : `<div class="empty-state empty-inline"><p class="empty-text">No attendance records yet.</p></div>`
          }
        </div>
      </div>`;
  }

  function wirePanelOverview(root, emp) {
    const btn = root.querySelector('[data-pan-act="checkin"]');
    if (btn) btn.addEventListener('click', () => employeeCheckIn(emp.id));
    const leaveBtn = root.querySelector('[data-pan-act="leave"]');
    if (leaveBtn) leaveBtn.addEventListener('click', () => openLeaveForm(null, { employeeId: emp.id }));
  }

  /* ---------- Appointments tab ---------- */
  function panelAppointmentsHTML(emp) {
    const today = todayISO();
    let list = db.appointments.filter((a) => a.employeeId === emp.id);

    if (panelAptFilter === 'today') list = list.filter((a) => a.date === today);
    else if (panelAptFilter === 'upcoming') list = list.filter((a) => (a.status === 'Scheduled' || a.status === 'Confirmed') && a.date >= today);
    else if (panelAptFilter === 'completed') list = list.filter((a) => a.status === 'Completed');

    list.sort((a, b) => `${b.date || ''}T${b.time || ''}`.localeCompare(`${a.date || ''}T${a.time || ''}`));

    return `
      <div class="filter-chips" id="panelAptFilters">
        <button class="chip ${panelAptFilter === 'today' ? 'active' : ''}" data-paf="today">Today</button>
        <button class="chip ${panelAptFilter === 'upcoming' ? 'active' : ''}" data-paf="upcoming">Upcoming</button>
        <button class="chip ${panelAptFilter === 'completed' ? 'active' : ''}" data-paf="completed">Completed</button>
        <button class="chip ${panelAptFilter === 'all' ? 'active' : ''}" data-paf="all">All</button>
      </div>
      <div class="panel">
        <div class="panel-body">
          ${
            list.length
              ? list
                  .map((a) => {
                    const cus = db.customers.find((c) => c.id === a.customerId);
                    return `
                <div class="emp-list-item">
                  <div class="eli-info">
                    <div class="eli-t">${esc(a.serviceName || 'Appointment')}</div>
                    <div class="eli-s">${esc(cus?.fullName || 'Customer')}${cus?.mobile ? ' · ' + esc(cus.mobile) : ''}</div>
                    <div class="eli-s">${fmtDate(a.date)} · ${esc(a.time || '·')} · ${esc(a.id)}</div>
                  </div>
                  <div class="eli-right">
                    ${appointmentStatusBadge(a.status)}
                    ${a.price != null && a.price !== '' ? `<span class="eli-amount">${fmtMoney(a.price)}</span>` : ''}
                  </div>
                </div>`;
                  })
                  .join('')
              : `<div class="empty-state empty-inline"><p class="empty-text">No ${panelAptFilter === 'all' ? '' : panelAptFilter + ' '}appointments found.</p></div>`
          }
        </div>
      </div>`;
  }

  /* ---------- Attendance tab ---------- */
  function panelAttendanceHTML(emp) {
    const thisMonth = monthISO();
    const all = db.attendance.filter((a) => a.employeeId === emp.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const monthRecs = all.filter((a) => String(a.date || '').slice(0, 7) === thisMonth);
    const todayRec = attendanceFor(emp.id, todayISO());

    const counts = {
      Present: monthRecs.filter((a) => a.status === 'Present').length,
      Late: monthRecs.filter((a) => a.status === 'Late').length,
      Absent: monthRecs.filter((a) => a.status === 'Absent').length,
      Half: monthRecs.filter((a) => a.status === 'Half Day').length,
    };

    return `
      ${
        todayRec
          ? `<div class="panel-quick-row"><button class="btn btn-ghost" disabled>✓ Checked in today · ${esc(todayRec.checkIn || todayRec.status)} · ${esc(todayRec.status)}</button></div>`
          : `<div class="panel-quick-row"><button class="btn btn-primary" data-pan-act="checkin">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Check In Now
            </button></div>`
      }

      <div class="detail-section-title">This Month · ${esc(fmtMonth(thisMonth))}</div>
      <div class="panel-summary-strip">
        <div class="ps-cell green"><div class="ps-n">${counts.Present}</div><div class="ps-l">Present</div></div>
        <div class="ps-cell amber"><div class="ps-n">${counts.Late}</div><div class="ps-l">Late</div></div>
        <div class="ps-cell red"><div class="ps-n">${counts.Absent}</div><div class="ps-l">Absent</div></div>
        <div class="ps-cell sky"><div class="ps-n">${counts.Half}</div><div class="ps-l">Half Day</div></div>
      </div>

      <div class="detail-section-title">Full History</div>
      <div class="panel">
        <div class="panel-body">
          ${
            all.length
              ? all
                  .map(
                    (a) => `
                <div class="emp-list-item">
                  <div class="eli-info">
                    <div class="eli-t">${fmtDate(a.date)}</div>
                    <div class="eli-s">${a.checkIn ? 'Check-in ' + esc(a.checkIn) : 'No check-in time'}${a.notes ? ' · ' + esc(a.notes) : ''}</div>
                  </div>
                  <div class="eli-right">${attStatusBadgeLocal(a.status)}</div>
                </div>`
                  )
                  .join('')
              : `<div class="empty-state empty-inline"><p class="empty-text">No attendance records yet.</p></div>`
          }
        </div>
      </div>`;
  }

  function wirePanelAttendance(root, emp) {
    const btn = root.querySelector('[data-pan-act="checkin"]');
    if (btn) btn.addEventListener('click', () => employeeCheckIn(emp.id));
  }

  /* ---------- Leaves tab ---------- */
  function panelLeavesHTML(emp) {
    const all = db.leaves.filter((l) => l.employeeId === emp.id).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const pending = all.filter((l) => l.status === 'Pending').length;
    const approvedDays = all.filter((l) => l.status === 'Approved').reduce((t, l) => t + daysBetween(l.fromDate, l.toDate), 0);

    return `
      <div class="panel-quick-row">
        <button class="btn btn-primary" data-pan-act="leave">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Request Leave
        </button>
      </div>

      <div class="panel-summary-strip" style="grid-template-columns: repeat(3, 1fr);">
        <div class="ps-cell"><div class="ps-n">${all.length}</div><div class="ps-l">Total</div></div>
        <div class="ps-cell amber"><div class="ps-n">${pending}</div><div class="ps-l">Pending</div></div>
        <div class="ps-cell green"><div class="ps-n">${approvedDays}</div><div class="ps-l">Approved Days</div></div>
      </div>

      <div class="detail-section-title">My Requests</div>
      <div class="panel">
        <div class="panel-body">
          ${
            all.length
              ? all
                  .map(
                    (l) => `
                <div class="emp-list-item">
                  <div class="eli-info">
                    <div class="eli-t">${esc(l.type || 'Leave')} · ${daysBetween(l.fromDate, l.toDate)} day(s)</div>
                    <div class="eli-s">${fmtDate(l.fromDate)} → ${fmtDate(l.toDate)}</div>
                    ${l.reason ? `<div class="eli-s">${esc(l.reason)}</div>` : ''}
                  </div>
                  <div class="eli-right">${leaveStatusBadge(l.status)}</div>
                </div>`
                  )
                  .join('')
              : `<div class="empty-state empty-inline"><p class="empty-text">No leave requests yet. Tap "Request Leave" to apply.</p></div>`
          }
        </div>
      </div>`;
  }

  function wirePanelLeaves(root, emp) {
    const btn = root.querySelector('[data-pan-act="leave"]');
    if (btn) btn.addEventListener('click', () => openLeaveForm(null, { employeeId: emp.id }));
  }

  /* ---------- Salary tab ---------- */
  function panelSalaryHTML(emp) {
    const all = db.salaries.filter((s) => s.employeeId === emp.id).sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
    const paid = all.filter((s) => s.status === 'Paid');
    const totalPaid = paid.reduce((t, s) => t + num(s.net), 0);
    const pendingAmt = all.filter((s) => s.status === 'Pending').reduce((t, s) => t + num(s.net), 0);
    const totalBonus = all.reduce((t, s) => t + num(s.bonus), 0);

    return `
      <div class="panel-summary-strip">
        <div class="ps-cell green"><div class="ps-n">${fmtMoney(totalPaid)}</div><div class="ps-l">Total Paid</div></div>
        <div class="ps-cell amber"><div class="ps-n">${fmtMoney(pendingAmt)}</div><div class="ps-l">Pending</div></div>
        <div class="ps-cell"><div class="ps-n">${all.length}</div><div class="ps-l">Records</div></div>
        <div class="ps-cell sky"><div class="ps-n">${fmtMoney(totalBonus)}</div><div class="ps-l">Bonuses</div></div>
      </div>

      <div class="detail-section-title">Salary History</div>
      <div class="panel">
        <div class="panel-body">
          ${
            all.length
              ? all
                  .map(
                    (s) => `
                <div class="emp-list-item">
                  <div class="eli-info">
                    <div class="eli-t">${esc(fmtMonth(s.month))}</div>
                    <div class="eli-s">Basic ${fmtMoney(s.basic)}${num(s.bonus) ? ' · Bonus +' + fmtMoney(s.bonus) : ''}${num(s.deductions) ? ' · Deductions -' + fmtMoney(s.deductions) : ''}</div>
                    <div class="eli-s">${esc(s.id)}${s.paidDate ? ' · Paid ' + fmtDate(s.paidDate) : ''} · ${esc(s.method || '·')}</div>
                  </div>
                  <div class="eli-right">
                    <span class="eli-amount">${fmtMoney(s.net)}</span>
                    ${salaryStatusBadge(s.status)}
                  </div>
                </div>`
                  )
                  .join('')
              : `<div class="empty-state empty-inline"><p class="empty-text">No salary records yet.</p></div>`
          }
        </div>
      </div>`;
  }

  /* ---------- Profile tab ---------- */
  function panelProfileHTML(emp) {
    const visitsDone = db.visits.filter((v) => v.employeeId === emp.id && v.status === 'Completed').length;
    const totalApts = db.appointments.filter((a) => a.employeeId === emp.id).length;

    return `
      <div class="profile-hero">
        ${avatarHTML(emp, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(emp.fullName)}</h2>
          <div class="role">${esc(emp.staffRole || 'Employee')} · ${esc(emp.specialties || emp.id)}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(emp.id)}</span>
            ${empStatusBadge(emp.employmentStatus)}
            <span class="badge badge-gray">${visitsDone} visits · ${totalApts} appointments</span>
          </div>
        </div>
      </div>

      <div class="detail-section-title">Personal Information</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Date of Birth</div><div class="value">${fmtDate(emp.dob)}${isTodayBirthday(emp.dob) ? ' · 🎂 Today!' : ''}</div></div>
        <div class="detail-item"><div class="label">Gender</div><div class="value">${esc(emp.gender || '·')}</div></div>
        <div class="detail-item"><div class="label">Mobile Number</div><div class="value">${esc(emp.mobile || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Address</div><div class="value">${esc(emp.address || '·')}</div></div>
      </div>

      <div class="detail-section-title">Employment</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(emp.staffRole || '·')}</div></div>
        <div class="detail-item"><div class="label">Specialties / Services</div><div class="value">${esc(emp.specialties || '·')}</div></div>
        <div class="detail-item"><div class="label">Experience (Years)</div><div class="value">${esc(emp.experienceYears || '·')}</div></div>
        <div class="detail-item"><div class="label">Commission Rate</div><div class="value">${emp.commissionRate ? esc(emp.commissionRate) + '%' : '·'}</div></div>
        <div class="detail-item"><div class="label">Shift</div><div class="value">${esc(emp.shift || '·')}</div></div>
        <div class="detail-item"><div class="label">Joining Date</div><div class="value">${fmtDate(emp.joiningDate)}</div></div>
        <div class="detail-item"><div class="label">Employment Status</div><div class="value">${empStatusBadge(emp.employmentStatus)}</div></div>
        <div class="detail-item"><div class="label">Employee ID</div><div class="value">${esc(emp.id)}</div></div>
        <div class="detail-item span-2"><div class="label">Notes</div><div class="value">${esc(emp.notes || '·')}</div></div>
      </div>`;
  }

  /* ---------- Sign-in picker ---------- */
  function renderEmployeePicker() {
    const q = panelEmployeeSearch.toLowerCase();
    const list = db.employees.filter((e) => !q || (e.fullName || '').toLowerCase().includes(q) || (e.staffRole || '').toLowerCase().includes(q) || e.id.toLowerCase().includes(q));

    const grid = $('#panelEmpGrid');
    const empty = $('#panelPickEmpty');
    const noMatch = $('#panelPickNoMatch');

    if (!db.employees.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      noMatch.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    noMatch.style.display = list.length ? 'none' : 'block';
    if (!list.length) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = list
      .map(
        (e) => `
      <button type="button" class="emp-pick-card" data-id="${esc(e.id)}">
        ${avatarHTML(e, 'avatar-lg')}
        <div class="emp-pick-info">
          <h4>${esc(e.fullName)}</h4>
          <p>${esc(e.staffRole || 'Employee')} · ${esc(e.shift || e.id)}</p>
          ${empStatusBadge(e.employmentStatus)}
        </div>
        <span class="emp-pick-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </span>
      </button>`
      )
      .join('');

    $$('#panelEmpGrid .emp-pick-card').forEach((card) => {
      card.addEventListener('click', () => {
        setPanelEmployee(card.dataset.id);
        toast(`Welcome, ${db.employees.find((x) => x.id === card.dataset.id)?.fullName || 'employee'}!`);
      });
    });
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

    // Dynamic data-goto (dashboard stat cards) — delegation
    $('#statGrid').addEventListener('click', (e) => {
      const t = e.target.closest('[data-goto]');
      if (t) goto(t.dataset.goto);
    });

    // Quick actions (dashboard)
    $('#qaAppointment').addEventListener('click', () => openAppointmentForm());
    $('#qaCustomer').addEventListener('click', () => openCustomerForm());
    $('#qaVisit').addEventListener('click', () => openVisitForm());
    $('#qaAttendance').addEventListener('click', () => goto('attendance'));
    $('#qaPayment').addEventListener('click', () => openPaymentForm());

    // Empty-state CTA buttons — one delegated handler
    const emptyCtaActions = {
      employeeEmpty: () => openEmployeeForm(),
      customerEmpty: () => openCustomerForm(),
      visitEmpty: () => openVisitForm(),
      appointmentEmpty: () => openAppointmentForm(),
      serviceEmpty: () => openServiceForm(),
      paymentEmpty: () => openPaymentForm(),
      expenseEmpty: () => openExpenseForm(),
      maintenanceEmpty: () => openMaintenanceForm(),
      attendanceEmpty: () => openEmployeeForm(),
      leaveEmpty: () => openLeaveForm(),
      salaryEmpty: () => openSalaryForm(),
    };
    $('#content').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-empty-cta]');
      if (!btn) return;
      const fn = emptyCtaActions[btn.dataset.emptyCta];
      if (fn) fn();
    });

    // Global search
    $('#globalSearchBtn').addEventListener('click', openGlobalSearch);
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openGlobalSearch();
      } else if (e.key === '/' && !typing && !modalStack.length) {
        e.preventDefault();
        openGlobalSearch();
      }
    });

    // Mobile bottom navigation
    $$('.bottom-nav [data-section]').forEach((btn) => {
      btn.addEventListener('click', () => goto(btn.dataset.section));
    });
    $('#bottomMenuBtn').addEventListener('click', () => {
      $('#menuToggle').click();
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

    // Employee Panel (employee dashboard)
    $('#panelEmpSearch').addEventListener('input', (e) => {
      panelEmployeeSearch = e.target.value;
      renderEmployeePicker();
    });
    $$('#panelTabs .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        panelTab = chip.dataset.ptab;
        renderEmployeePanel();
      });
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

    // Appointments
    $('#addAppointmentBtn').addEventListener('click', () => openAppointmentForm());
    $('#appointmentSearch').addEventListener('input', (e) => {
      appointmentSearch = e.target.value;
      renderAppointments();
    });
    $$('#appointmentFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#appointmentFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        appointmentFilterStatus = chip.dataset.status;
        renderAppointments();
      });
    });

    // Payments
    $('#addPaymentBtn').addEventListener('click', () => openPaymentForm());
    $('#paymentSearch').addEventListener('input', (e) => {
      paymentSearch = e.target.value;
      renderPayments();
    });
    $$('#paymentFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#paymentFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        if (chip.dataset.method) {
          paymentFilterMethod = chip.dataset.method;
          paymentFilterStatus = 'all';
        } else if (chip.dataset.status) {
          paymentFilterStatus = chip.dataset.status;
          paymentFilterMethod = 'all';
        }
        renderPayments();
      });
    });

    // Expenses
    $('#addExpenseBtn').addEventListener('click', () => openExpenseForm());
    $('#expenseSearch').addEventListener('input', (e) => {
      expenseSearch = e.target.value;
      renderExpenses();
    });
    $$('#expenseFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#expenseFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        expenseFilterCat = chip.dataset.cat;
        renderExpenses();
      });
    });

    // Maintenance
    $('#addMaintenanceBtn').addEventListener('click', () => openMaintenanceForm());
    $('#maintenanceSearch').addEventListener('input', (e) => {
      maintenanceSearch = e.target.value;
      renderMaintenance();
    });
    $$('#maintenanceFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#maintenanceFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        maintenanceFilterStatus = chip.dataset.status;
        renderMaintenance();
      });
    });

    // Attendance
    $('#attendanceDate').value = attendanceDate;
    $('#attendanceDate').addEventListener('change', (e) => {
      attendanceDate = e.target.value || todayISO();
      renderAttendance();
    });
    $('#attendanceSearch').addEventListener('input', (e) => {
      attendanceSearch = e.target.value;
      renderAttendance();
    });
    $('#markAllPresentBtn').addEventListener('click', markAllPresent);

    // Leaves
    $('#addLeaveBtn').addEventListener('click', () => openLeaveForm());
    $('#leaveSearch').addEventListener('input', (e) => {
      leaveSearch = e.target.value;
      renderLeaves();
    });
    $$('#leaveFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#leaveFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        leaveFilterStatus = chip.dataset.status;
        renderLeaves();
      });
    });

    // Salary
    $('#addSalaryBtn').addEventListener('click', () => openSalaryForm());
    $('#salarySearch').addEventListener('input', (e) => {
      salarySearch = e.target.value;
      renderSalary();
    });
    $$('#salaryFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#salaryFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        salaryFilterStatus = chip.dataset.status;
        renderSalary();
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
