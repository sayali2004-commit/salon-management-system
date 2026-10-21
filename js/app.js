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
    attendance: [],
    leaves: [],
    salaries: [],
    timetables: [],
    counters: { emp: 0, cus: 0, visit: 0, svc: 0, apt: 0, pay: 0, exp: 0, att: 0, lv: 0, sal: 0, tmt: 0 },
  };

  const ID_PREFIX = { emp: 'EMP', cus: 'CUS', visit: 'VIS', svc: 'SVC', apt: 'APT', pay: 'PAY', exp: 'EXP', att: 'ATT', lv: 'LV', sal: 'SAL', tmt: 'TMT' };

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
      ['appointments', 'payments', 'expenses', 'attendance', 'leaves', 'salaries', 'timetables'].forEach((k) => {
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

  /* ---------------- Auto payment status ---------------- */
  function autoPayStatus(total, paid) {
    const t = num(total);
    const p = num(paid);
    if (p <= 0) return 'Pending';
    if (t > 0 && p < t) return 'Partial';
    return 'Paid';
  }

  /* ---------------- Generic searchable picker ---------------- */
  function pickerOptionsEmployee() {
    return db.employees.map((e) => ({ id: e.id, label: e.fullName, sub: `${e.staffRole || 'Employee'}${e.mobile ? ' · ' + e.mobile : ''}` }));
  }

  function pickerOptionsCustomer() {
    return db.customers.map((c) => ({ id: c.id, label: c.fullName, sub: `${c.mobile || ''}${c.email ? ' · ' + c.email : ''}` }));
  }

  function pickerOptionsService() {
    return db.services
      .filter((s) => s.status !== 'Inactive')
      .map((s) => ({ id: s.id, label: s.name, sub: `${s.category || 'General'}${s.price != null && s.price !== '' ? ' · ' + fmtMoney(s.price) : ''}`, price: s.price, unit: s.unit, name: s.name }));
  }

  function pickerSearch(options, q) {
    let list = options;
    if (q) {
      list = options.filter((o) => String(o.label || '').toLowerCase().includes(q) || String(o.sub || '').toLowerCase().includes(q) || String(o.id || '').toLowerCase().includes(q));
    }
    return sortSearchResults(list, q, (o) => String(o.label || '').toLowerCase()).slice(0, 8);
  }

  function pickerItemHTML(o, i) {
    return `
      <div class="ac-item" data-ac-item data-ac-index="${i}" data-id="${esc(o.id)}">
        <div class="ac-info">
          <div class="ac-name">${esc(o.label)}</div>
          ${o.sub ? `<div class="ac-meta">${esc(o.sub)}</div>` : ''}
        </div>
      </div>`;
  }

  function pickerFieldHTML(base, name, placeholder, currentId, currentLabel) {
    return `
      <div class="autocomplete">
        <input type="text" id="${base}Input" placeholder="${esc(placeholder)}" autocomplete="off" value="${esc(currentLabel || '')}" />
        <div class="ac-list" id="${base}List"></div>
      </div>
      <input type="hidden" name="${name}" id="${base}Id" value="${esc(currentId || '')}" />`;
  }

  function wirePicker(wrap, { base, options, placeholder = 'Type to search...', emptyMessage = 'No match found. Check spelling or add a new record first.', onChoose, onClear }) {
    const input = $('#' + base + 'Input', wrap);
    const list = $('#' + base + 'List', wrap);
    const hidden = $('#' + base + 'Id', wrap);
    setupAutocomplete({
      input,
      list,
      emptyMessage,
      search: (q) => pickerSearch(options(), q),
      renderItem: pickerItemHTML,
      onChoose: (o) => {
        hidden.value = o.id;
        input.value = o.label;
        if (typeof onChoose === 'function') onChoose(o);
      },
      onQueryChange: () => {
        hidden.value = '';
        if (typeof onClear === 'function') onClear();
      },
    });
    return { input, hidden };
  }

  function pickerLabelById(options, id) {
    const found = options().find((o) => o.id === id);
    return found ? found.label : '';
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
      .filter((c) => match(c.fullName) || match(c.mobile) || match(c.email))
      .slice(0, 4)
      .forEach((c) => results.push({ type: 'customer', id: c.id, title: c.fullName, meta: `${c.mobile || ''}${c.email ? ' · ' + c.email : ''}`, badge: c.mobile || 'Customer', icon: 'user' }));

    db.employees
      .filter((e) => match(e.fullName) || match(e.staffRole) || match(e.mobile))
      .slice(0, 4)
      .forEach((e) => results.push({ type: 'employee', id: e.id, title: e.fullName, meta: `${e.staffRole || 'Employee'} · ${e.mobile || ''}`, badge: e.staffRole || 'Employee', icon: 'users' }));

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
    employees: { title: 'Employees', sub: 'Create and manage your employee directory' },
    customers: { title: 'Customers', sub: 'Manage your customer records' },
    visits: { title: 'Visits', sub: 'Customer visits with assigned staff & payments' },
    appointments: { title: 'Appointments', sub: 'Schedule appointments with existing customers' },
    payments: { title: 'Payments', sub: 'Track every payment — cash & online' },
    expenses: { title: 'Expenses', sub: 'Record and monitor business expenses' },
    birthdays: { title: 'Birthdays', sub: 'Upcoming birthdays · employees & customers' },
    services: { title: 'Services', sub: 'Services offered by your business' },
    attendance: { title: 'Attendance', sub: 'Mark and review daily employee attendance' },
    leaves: { title: 'Leaves', sub: 'Employee leave requests & approvals' },
    salary: { title: 'Salary', sub: 'Monthly salary records & payments' },
  };

  let currentSection = 'dashboard';

  function goto(section) {
    if (!canAccessSection(section)) return;
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
      $$( '#setupSteps [data-setup]').forEach((btn) => {
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
  let employeeFilterStatus = 'all';

  function renderEmployees() {
    $('#addEmployeeBtn').style.display = db.employees.length ? '' : 'none';

    const q = employeeSearch.toLowerCase();
    const list = db.employees.filter((e) => {
      if (employeeFilterStatus !== 'all' && e.employmentStatus !== employeeFilterStatus) return false;
      return (
        !q ||
        e.fullName.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.staffRole || '').toLowerCase().includes(q) ||
        (e.specialties || '').toLowerCase().includes(q)
      );
    });

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
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search term.';
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
            </div>
          </div>
        </td>
        <td data-label="Staff Role">${esc(e.staffRole || '·')}</td>
        <td data-label="Mobile">${esc(e.mobile || '·')}</td>
        <td data-label="Status">${employeeStatusCell(e)}</td>
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

    $$( '#employeeTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewEmployee(tr.dataset.id);
      });
    });

    $$( '#employeeTable [data-act]').forEach((btn) => {
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

  /* Live status: Active employees not present today automatically show "Not Present" */
  function employeeStatusCell(e) {
    if (e.employmentStatus !== 'Active') return empStatusBadge(e.employmentStatus);
    const rec = attendanceFor(e.id, todayISO());
    if (!rec) return '<span class="badge badge-amber">Not Present</span>';
    const map = { Present: 'badge-green', Late: 'badge-amber', Absent: 'badge-red', 'Half Day': 'badge-sky' };
    return `<span class="badge ${map[rec.status] || 'badge-green'}">${esc(rec.status)}</span>`;
  }

  ﻿  function openEmployeeForm(id = null) {
    const emp = id ? db.employees.find((e) => e.id === id) : null;

    const staffRoles = ['Salon Manager', 'Receptionist', 'Hair Stylist', 'Barber', 'Beautician', 'Makeup Artist', 'Nail Technician', 'Esthetician', 'Spa Therapist', 'Apprentice'];
    const shifts = ['Morning', 'Afternoon', 'Evening', 'Full Day'];
    const statuses = ['Active', 'Probation', 'On Leave', 'Resigned', 'Terminated'];
    const genders = ['Male', 'Female', 'Other'];

    const body = `
      <form id="empForm" class="form-grid" autocomplete="off">
        <div class="form-section-title first"><span class="num">1</span> Personal Details</div>

        <div class="field">
          <label>Full Name <span class="req">*</span></label>
          <input name="fullName" required placeholder="e.g. Ayesha Rahman" value="${esc(emp?.fullName || '')}" />
        </div>
        <div class="field">
          <label>Mobile Number <span class="req">*</span></label>
          <input type="tel" name="mobile" required placeholder="e.g. +91 98765 43210" value="${esc(emp?.mobile || '')}" />
        </div>

        <div class="field">
          <label>Gender <span class="req">*</span></label>
          <div class="pay-methods">
            ${genders
              .map(
                (g) => `
              <label class="pay-method">
                <input type="radio" name="gender" value="${g}" ${(emp?.gender || '') === g ? 'checked' : ''} />
                <span>${g}</span>
              </label>`
              )
              .join('')}
          </div>
        </div>
        <div class="field">
          <label>Date of Birth <span class="req">*</span></label>
          <input type="date" name="dob" required value="${esc(emp?.dob || '')}" />
        </div>

        <div class="field span-2">
          <label>Address</label>
          <textarea name="address" placeholder="Full address...">${esc(emp?.address || '')}</textarea>
        </div>

        <div class="form-section-title"><span class="num">2</span> Employment</div>

        <div class="field">
          <label>Staff Role <span class="req">*</span></label>
          <select name="staffRole" required>
            <option value="">Select staff role</option>
            ${staffRoles.map((r) => `<option ${emp?.staffRole === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Monthly Salary (₹) <span class="req">*</span></label>
          <input type="number" name="salary" min="0" step="1" required placeholder="e.g. 25000" value="${esc(emp?.salary || '')}" />
        </div>

        <div class="field span-2">
          <label>Specialties / Services</label>
          <input name="specialties" placeholder="e.g. Haircut, Hair Color, Bridal Makeup" value="${esc(emp?.specialties || '')}" />
        </div>

        <div class="field">
          <label>Experience (Years)</label>
          <input type="number" name="experienceYears" min="0" max="60" placeholder="e.g. 5" value="${esc(emp?.experienceYears || '')}" />
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

        <div class="form-section-title"><span class="num">3</span> Login Credentials</div>

        <div class="field">
          <label>Username <span class="req">*</span></label>
          <input name="username" required autocomplete="off" placeholder="e.g. sayali" value="${esc(emp ? employeeUsername(emp) : '')}" />
        </div>
        <div class="field">
          <label>Password <span class="req">*</span></label>
          <input name="password" required autocomplete="off" placeholder="Set a login password" value="${esc(emp ? employeePassword(emp) : 'employee123')}" />
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional notes...">${esc(emp?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: emp ? 'Edit Employee' : 'Create Employee',
      subtitle: emp ? 'Update team member details' : 'New team member registration',
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
          const fd = new FormData(form);
          const data = Object.fromEntries(fd.entries());
          data.gender = fd.get('gender') || '';
          if (!data.gender) {
            toast('Please select a gender.', 'error');
            return;
          }

          data.username = String(data.username || '').trim().toLowerCase();
          data.password = String(data.password || '').trim();
          if (!data.username) {
            toast('Please enter a login username.', 'error');
            return;
          }
          if (!data.password) {
            toast('Please set a login password.', 'error');
            return;
          }
          const usernameTaken =
            data.username === getAdminUsername() ||
            db.employees.some((e) => e.id !== (emp ? emp.id : null) && employeeUsername(e) === data.username);
          if (usernameTaken) {
            toast('That username is already taken.', 'error');
            return;
          }

          if (emp) {
            Object.assign(emp, data);
            toast('Employee updated successfully');
          } else {
            data.id = nextId('emp');
            data.createdAt = new Date().toISOString();
            db.employees.push(data);
            toast('Employee created successfully');
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
            ${empStatusBadge(e.employmentStatus)}
            <span class="badge badge-gray">${esc(e.shift || 'No shift')}</span>
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
        <div class="detail-item"><div class="label">Monthly Salary</div><div class="value">${e.salary ? fmtMoney(e.salary) : '·'}</div></div>
        <div class="detail-item"><div class="label">Shift</div><div class="value">${esc(e.shift || '·')}</div></div>
        <div class="detail-item"><div class="label">Login Username</div><div class="value">${esc(employeeUsername(e))}</div></div>
        <div class="detail-item"><div class="label">Joining Date</div><div class="value">${fmtDate(e.joiningDate)}</div></div>
        <div class="detail-item"><div class="label">Employment Status</div><div class="value">${empStatusBadge(e.employmentStatus)}</div></div>
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
      db.timetables.filter((t) => t.employeeId === id).length;
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
    db.timetables = db.timetables.filter((t) => t.employeeId !== id);
    save();
    renderAll();
    toast('Employee deleted');
  }

  /* ================= CUSTOMERS ================= */
  let customerSearch = '';
  let customerFilterStatus = 'all';

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
    $('#addCustomerBtn').style.display = db.customers.length ? '' : 'none';

    renderCustomerStats();

    const q = customerSearch.toLowerCase();
    const list = db.customers.filter((c) => {
      const due = num(c.totalAmount) - num(c.paidAmount);
      if (customerFilterStatus === 'dues' && due <= 0) return false;
      if (customerFilterStatus === 'paid' && due > 0) return false;
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
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search term.';
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = list
      .map((c) => {
        return `
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
        <td data-label="Mobile">${esc(c.mobile || '·')}</td>
        <td data-label="Email">${esc(c.email || '·')}</td>
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
          </div>
        </td>
      </tr>`;
      })
      .join('');

    $$( '#customerTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewCustomer(tr.dataset.id);
      });
    });

    $$( '#customerTable [data-act]').forEach((btn) => {
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

  ﻿  function openCustomerForm(id = null, opts = {}) {
    const cus = id ? db.customers.find((c) => c.id === id) : null;

    if (!id && (!db.employees.length || !db.services.length)) {
      toast('Please add at least one employee and one service first.', 'error');
      return;
    }

    const methods = [
      { v: 'Cash', hint: 'Pay at counter' },
      { v: 'UPI', hint: 'GPay / PhonePe' },
    ];
    const selectedMethod = cus?.paymentMethod || 'Cash';

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${cus ? 'Edit Customer' : 'Add New Customer'}</h3>
          <p>${cus ? 'Update the customer details' : 'Register a customer — payment status updates automatically'}</p>
        </div>
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
          ${pickerFieldHTML('cusEmp', 'employeeId', 'Type employee name to search...', cus?.employeeId || '', pickerLabelById(pickerOptionsEmployee, cus?.employeeId || ''))}
        </div>
        <div class="field">
          <label>Service <span class="req">*</span></label>
          ${pickerFieldHTML('cusSvc', 'serviceId', 'Type service name to search...', cus?.serviceId || '', pickerLabelById(pickerOptionsService, cus?.serviceId || ''))}
        </div>

        <div class="form-section-title"><span class="num">3</span> Payment Details</div>

        <div class="field">
          <label>Total Amount (₹)</label>
          <input type="number" name="totalAmount" min="0" step="0.01" placeholder="e.g. 20000" value="${esc(cus?.totalAmount || '')}" />
        </div>
        <div class="field">
          <label>Paid Amount (₹)</label>
          <input type="number" name="paidAmount" min="0" step="0.01" placeholder="e.g. 1000" value="${esc(cus?.paidAmount || '')}" />
        </div>

        <div class="field span-2">
          <div class="auto-price-box empty" id="cusDueHint">Enter amounts to see payment status &amp; due</div>
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

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Any additional notes...">${esc(cus?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: cus ? 'Edit Customer' : 'Add Customer',
      subtitle: cus ? 'Update customer details' : 'New customer registration',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${cus ? 'Save Changes' : 'Add Customer'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#cusForm', wrap);
        const dueHint = $('#cusDueHint', wrap);

        // Searchable pickers
        wirePicker(wrap, {
          base: 'cusEmp',
          options: pickerOptionsEmployee,
        });
        wirePicker(wrap, {
          base: 'cusSvc',
          options: pickerOptionsService,
          onChoose: (o) => {
            if (o.price != null && o.price !== '') form.totalAmount.value = o.price;
            syncPayStatus();
          },
        });

        // Auto payment status from total vs paid
        function syncPayStatus() {
          const t = form.totalAmount.value;
          const p = form.paidAmount.value;
          if (t === '' && p === '') {
            dueHint.classList.add('empty');
            dueHint.textContent = 'Enter amounts to see payment status & due';
            return;
          }
          const status = autoPayStatus(t, p);
          const due = num(t) - num(p);
          dueHint.classList.remove('empty');
          if (due > 0) dueHint.innerHTML = `Payment: <strong>${status}</strong> · Due amount: <strong style="color:var(--red)">${fmtMoney(due)}</strong>`;
          else dueHint.innerHTML = `Payment: <strong>${status}</strong> · Fully paid ✓`;
        }
        form.totalAmount.addEventListener('input', syncPayStatus);
        form.paidAmount.addEventListener('input', syncPayStatus);
        syncPayStatus();

        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          const data = Object.fromEntries(fd.entries());
          data.paymentMethod = fd.get('paymentMethod') || 'Cash';

          if (!data.employeeId) {
            toast('Please select an employee from the suggestions.', 'error');
            return;
          }
          if (!data.serviceId) {
            toast('Please select a service from the suggestions.', 'error');
            return;
          }
          const svc = db.services.find((s) => s.id === data.serviceId);
          if (!svc) {
            toast('Selected service no longer exists. Please search again.', 'error');
            return;
          }

          // Payment status is always derived from amounts
          data.paymentStatus = autoPayStatus(data.totalAmount, data.paidAmount);

          // Prevent duplicate customers — mobile number must be unique
          const duplicate = findCustomerByMobile(data.mobile, cus ? cus.id : null);
          if (duplicate) {
            if (!cus && opts.reuseOnDuplicateMobile) {
              toast(`Existing customer reused · ${duplicate.fullName}`);
              if (typeof opts.onSelectExisting === 'function') opts.onSelectExisting(duplicate);
              close();
              return;
            }
            toast(`Mobile number already registered to ${duplicate.fullName}. Each customer can only be added once.`, 'error');
            return;
          }

          if (cus) {
            Object.assign(cus, data);
            toast('Customer updated successfully');
          } else {
            data.id = nextId('cus');
            data.createdAt = new Date().toISOString();
            db.customers.push(data);

            if (data.serviceId) {
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
                paymentStatus: data.paymentStatus,
                status: 'Completed',
                notes: 'Service given on customer registration',
                createdAt: now.toISOString(),
              });
            }

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

            toast(`Customer added${data.serviceId ? ' · visit recorded' : ''}`);
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
    const due = num(c.totalAmount) - num(c.paidAmount);

    const body = `
      <div class="profile-hero">
        ${avatarHTML(c, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(c.fullName)}</h2>
          <div class="role">Customer</div>
          <div class="badges">
            <span class="badge badge-gray">${visits.length} visit${visits.length === 1 ? '' : 's'}</span>
            ${c.paymentStatus ? payStatusBadge(c.paymentStatus) : ''}
            ${due > 0 ? `<span class="badge badge-red">Due ${fmtMoney(due)}</span>` : ''}
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
        <div class="detail-item"><div class="label">Total Amount</div><div class="value">${c.totalAmount ? fmtMoney(c.totalAmount) : '·'}</div></div>
        <div class="detail-item"><div class="label">Paid Amount</div><div class="value">${c.paidAmount ? fmtMoney(c.paidAmount) : '·'}</div></div>
        <div class="detail-item"><div class="label">Due Amount</div><div class="value">${due > 0 ? `<strong style="color:var(--red)">${fmtMoney(due)}</strong>` : (num(c.totalAmount) ? 'Fully paid ✓' : '·')}</div></div>
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
    $('#addVisitBtn').style.display = db.visits.length ? '' : 'none';

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

    $$( '#visitTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewVisit(tr.dataset.id);
      });
    });

    $$( '#visitTable [data-act]').forEach((btn) => {
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

  ﻿  function openVisitForm(id = null, prefill = {}) {
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

    let localDT = visit?.visitDateTime ? visit.visitDateTime.slice(0, 16) : '';
    if (!localDT && !visit) {
      const now = new Date();
      localDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#38bdf8,#0b7fc9 60%,#075985);box-shadow:0 8px 18px rgba(11,127,201,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${visit ? 'Edit Visit' : 'New Visit'}</h3>
          <p>${visit ? 'Update the visit record' : 'Record a customer visit & payment'}</p>
        </div>
        <span class="modal-hero-id">${visit ? esc(visit.id) : peekId('visit')}</span>
      </div>

      <form id="visitForm" class="form-grid" autocomplete="off">
        <div class="form-section-title first"><span class="num">1</span> Customer &amp; Staff</div>

        <div class="field">
          <label>Customer <span class="req">*</span></label>
          ${pickerFieldHTML('vstCus', 'customerId', 'Type customer name to search...', preCus, pickerLabelById(pickerOptionsCustomer, preCus))}
        </div>
        <div class="field">
          <label>Assign To (Employee) <span class="req">*</span></label>
          ${pickerFieldHTML('vstEmp', 'employeeId', 'Type employee name to search...', preEmp, pickerLabelById(pickerOptionsEmployee, preEmp))}
        </div>

        <div class="form-section-title"><span class="num">2</span> Service &amp; Payment</div>

        <div class="field">
          <label>Service <span class="req">*</span></label>
          ${pickerFieldHTML('vstSvc', 'serviceId', 'Type service name to search...', preSvc, pickerLabelById(pickerOptionsService, preSvc))}
        </div>
        <div class="field">
          <label>Amount (₹)</label>
          <input type="number" name="amount" min="0" step="0.01" placeholder="e.g. 1500" value="${esc(amountVal)}" />
        </div>

        <div class="field">
          <label>Payment Method <span class="req">*</span></label>
          <select name="paymentMethod" required>
            ${['Cash', 'UPI'].map((m) => `<option ${(visit?.paymentMethod || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Payment Status <span class="req">*</span></label>
          <select name="paymentStatus" required>
            ${['Paid', 'Partial', 'Pending'].map((p) => `<option ${(visit?.paymentStatus || 'Pending') === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>

        <div class="form-section-title"><span class="num">3</span> Schedule</div>

        <div class="field">
          <label>Visit Date &amp; Time <span class="req">*</span></label>
          <input type="datetime-local" name="visitDateTime" required value="${esc(localDT)}" />
        </div>
        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Scheduled', 'In Progress', 'Completed'].map((s) => `<option ${(visit?.status || 'Scheduled') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="field span-2">
          <label>Notes</label>
          <textarea name="notes" placeholder="Internal notes...">${esc(visit?.notes || '')}</textarea>
        </div>
      </form>`;

    openModal({
      title: visit ? 'Edit Visit' : 'New Visit',
      subtitle: visit ? 'Update visit details' : 'Record a customer visit & payment',
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="save">${visit ? 'Save Changes' : 'Save Visit'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#visitForm', wrap);

        wirePicker(wrap, {
          base: 'vstCus',
          options: pickerOptionsCustomer,
          onChoose: (o) => {
            const c = db.customers.find((x) => x.id === o.id);
            if (!c || visit) return;
            if (c.employeeId && db.employees.some((e) => e.id === c.employeeId)) {
              $('#vstEmpId', wrap).value = c.employeeId;
              $('#vstEmpInput', wrap).value = pickerLabelById(pickerOptionsEmployee, c.employeeId);
            }
            if (c.serviceId && db.services.some((s) => s.id === c.serviceId)) {
              $('#vstSvcId', wrap).value = c.serviceId;
              $('#vstSvcInput', wrap).value = pickerLabelById(pickerOptionsService, c.serviceId);
              form.amount.value = c.totalAmount || db.services.find((s) => s.id === c.serviceId)?.price || '';
            }
          },
        });
        wirePicker(wrap, { base: 'vstEmp', options: pickerOptionsEmployee });
        wirePicker(wrap, {
          base: 'vstSvc',
          options: pickerOptionsService,
          onChoose: (o) => {
            if (o.price != null && o.price !== '') form.amount.value = o.price;
          },
        });

        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          const data = Object.fromEntries(fd.entries());

          if (!data.customerId) {
            toast('Please select a customer from the suggestions.', 'error');
            return;
          }
          if (!data.employeeId) {
            toast('Please select an employee from the suggestions.', 'error');
            return;
          }
          if (!data.serviceId) {
            toast('Please select a service from the suggestions.', 'error');
            return;
          }
          const svc = db.services.find((s) => s.id === data.serviceId);
          if (!svc) {
            toast('Selected service no longer exists. Please search again.', 'error');
            return;
          }
          data.serviceName = svc.name;

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
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(cus?.fullName || '·')}</div></div>
        <div class="detail-item"><div class="label">Mobile</div><div class="value">${esc(cus?.mobile || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Email</div><div class="value">${esc(cus?.email || '·')}</div></div>
      </div>

      <div class="detail-section-title">Assigned Employee</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(emp?.fullName || '·')}</div></div>
        <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(emp?.staffRole || '·')}</div></div>
        <div class="detail-item span-2"><div class="label">Specialties</div><div class="value">${esc(emp?.specialties || '·')}</div></div>
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

    $('#addAppointmentBtn').style.display = db.appointments.length ? '' : 'none';

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
          <div class="person-meta">${a.price != null && a.price !== '' ? fmtMoney(a.price) : '·'}${num(a.discount) > 0 ? ` · <span style="color:var(--green)">−${fmtMoney(a.discount)} discount</span>` : ''}</div>
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

    $$( '#appointmentTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewAppointment(tr.dataset.id);
      });
    });

    $$( '#appointmentTable [data-act]').forEach((btn) => {
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

    const statuses = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled'];

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 15 11 17 15 13"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${apt ? 'Edit Appointment' : 'New Appointment'}</h3>
          <p>${apt ? 'Update the appointment' : 'Search an existing customer — no need to re-add them'}</p>
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
          ${pickerFieldHTML('aptEmp', 'employeeId', 'Type employee name to search...', apt?.employeeId || '', pickerLabelById(pickerOptionsEmployee, apt?.employeeId || ''))}
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
          <label>Discount (₹)</label>
          <input type="number" name="discount" id="aptDiscount" min="0" step="0.01" placeholder="e.g. 100" value="${esc(apt?.discount ?? '')}" />
        </div>

        <div class="field span-2">
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
        const discountInput = $('#aptDiscount', wrap);
        const saveBtn = wrap.querySelector('[data-act="save"]');

        let saving = false;
        let basePrice = null;

        wirePicker(wrap, { base: 'aptEmp', options: pickerOptionsEmployee });

        function updatePriceBox() {
          const disc = num(discountInput.value);
          if (basePrice == null || basePrice === '') {
            priceBox.classList.add('empty');
            priceBox.textContent = 'Select a service to auto-fill price';
            priceInput.value = '';
            return;
          }
          const base = num(basePrice);
          const final = Math.max(base - disc, 0);
          priceInput.value = String(final);
          if (disc > 0) {
            priceBox.classList.remove('empty');
            priceBox.innerHTML = `${fmtMoney(final)} <span class="price-unit">(${fmtMoney(base)} − ${fmtMoney(disc)} discount)</span>`;
          } else {
            priceBox.classList.remove('empty');
            priceBox.innerHTML = `${fmtMoney(base)} <span class="price-unit">/ ${esc(db.services.find((s) => s.id === svcIdInput.value)?.unit || 'service')}</span>`;
          }
        }

        function selectCustomer(cus) {
          custIdInput.value = cus.id;
          custInput.value = cus.fullName || '';
          preview.hidden = false;
          preview.innerHTML = `
            ${avatarHTML(cus)}
            <div class="lr-info">
              <div class="lr-name">${esc(cus.fullName)}</div>
              <div class="lr-meta">${esc(cus.mobile || '')}${cus.email ? ' · ' + esc(cus.email) : ''}</div>
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
          basePrice = svc.price != null && svc.price !== '' ? svc.price : null;
          updatePriceBox();
        }

        function clearServiceSelection() {
          if (!svcIdInput.value && !basePrice) return;
          svcIdInput.value = '';
          basePrice = null;
          discountInput.value = '';
          updatePriceBox();
        }

        discountInput.addEventListener('input', updatePriceBox);

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
            basePrice = apt.price != null ? num(apt.price) + num(apt.discount) : null;
            updatePriceBox();
            svcInput.value = apt.serviceName || '';
          }
          if (apt.discount) updatePriceBox();
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

          // Always store the latest service name & apply discount to the latest price
          data.serviceName = svc.name;
          const latestBase = svc.price != null && svc.price !== '' ? num(svc.price) : 0;
          data.discount = num(data.discount);
          data.price = Math.max(latestBase - data.discount, 0);

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
        <div class="detail-item"><div class="label">Final Price</div><div class="value">${a.price != null && a.price !== '' ? fmtMoney(a.price) : '·'}</div></div>
        <div class="detail-item"><div class="label">Discount</div><div class="value">${num(a.discount) > 0 ? `<span style="color:var(--green)">−${fmtMoney(a.discount)}</span>` : '·'}</div></div>
        <div class="detail-item"><div class="label">Status</div><div class="value">${appointmentStatusBadge(a.status)}</div></div>
        <div class="detail-item"><div class="label">Notes</div><div class="value">${esc(a.notes || '·')}</div></div>
      </div>

      <div class="detail-section-title">Customer</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Name</div><div class="value">${esc(cus?.fullName || 'Unknown')}</div></div>
        <div class="detail-item"><div class="label">Mobile</div><div class="value">${esc(cus?.mobile || '·')}</div></div>
        <div class="detail-item"><div class="label">Email</div><div class="value">${esc(cus?.email || '·')}</div></div>
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
  let birthdaySearch = '';

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
    const q = birthdaySearch.toLowerCase();
    if (q) {
      items = items.filter(
        (b) =>
          (b.person.fullName || '').toLowerCase().includes(q) ||
          (b.person.mobile || '').toLowerCase().includes(q) ||
          ((b.type === 'employee' ? b.person.staffRole : b.person.email) || '').toLowerCase().includes(q)
      );
    }

    const grid = $('#birthdayGrid');
    const empty = $('#birthdayEmpty');

    if (!items.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = q || birthdayFilter !== 'all' ? 'No matching birthdays' : 'No upcoming birthdays';
      empty.querySelector('.empty-text').textContent =
        q || birthdayFilter !== 'all' ? 'Try a different filter or search term.' : 'Birthdays within the next 30 days will appear here.';
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
  let serviceFilterStatus = 'all';

  function renderServices() {
    $('#addServiceBtn').style.display = db.services.length ? '' : 'none';

    const q = serviceSearch.toLowerCase();
    const list = db.services.filter((s) => {
      if (serviceFilterStatus !== 'all' && (s.status || 'Active') !== serviceFilterStatus) return false;
      return !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
    });

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
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search term.';
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

    $$( '#serviceGrid [data-act]').forEach((btn) => {
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
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#a78bfa,#7c3aed 60%,#5b21b6);box-shadow:0 8px 18px rgba(124,58,237,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${svc ? 'Edit Service' : 'Add Service'}</h3>
          <p>${svc ? 'Update the service details' : 'Add a new service to your catalog'}</p>
        </div>
        <span class="modal-hero-id">${svc ? esc(svc.id) : peekId('svc')}</span>
      </div>

      <form id="svcForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Service Name <span class="req">*</span></label>
          <input name="name" required placeholder="e.g. Bridal Makeup" value="${esc(svc?.name || '')}" />
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
    $('#addPaymentBtn').style.display = db.payments.length ? '' : 'none';

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
            ${avatarHTML(cus || { fullName: 'Walk-in' })}
            <div>
              <div class="person-name">${esc(cus?.fullName || 'Walk-in Customer')}</div>
              <div class="person-meta">${esc(cus?.mobile || '')}</div>
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

    $$( '#paymentTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        viewPayment(tr.dataset.id);
      });
    });
    $$( '#paymentTable [data-act]').forEach((btn) => {
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
    const methods = ['Cash', 'UPI'];
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

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${pay ? 'Edit Payment' : 'Record Payment'}</h3>
          <p>${pay ? `Update payment record` : 'Log a cash or online payment received'}</p>
        </div>
        <span class="modal-hero-id">${pay ? esc(pay.id) : peekId('pay')}</span>
      </div>

      <form id="payForm" class="form-grid" autocomplete="off">
        <div class="field span-2">
          <label>Customer</label>
          ${pickerFieldHTML('payCus', 'customerId', 'Type customer name to search...', pay?.customerId || '', pickerLabelById(pickerOptionsCustomer, pay?.customerId || ''))}
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
        wirePicker(wrap, { base: 'payCus', options: pickerOptionsCustomer });
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

    $('#addExpenseBtn').style.display = db.expenses.length ? '' : 'none';

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

    $$( '#expenseTable [data-act]').forEach((btn) => {
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
            ${['Cash', 'UPI'].map((m) => `<option ${(exp?.method || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}
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

  /* ================= ATTENDANCE ================= */
  let attendanceSearch = '';
  let attendanceFilterStatus = 'all';
  let attendanceDate = todayISO();

  /* ---- Employee timetables (admin-defined work timings) ---- */
  function getTimetable(employeeId) {
    return db.timetables.find((t) => t.employeeId === employeeId) || null;
  }

  /* Decide attendance status from a check-in time against the timetable */
  function attendanceStatusFromTimetable(checkInHHMM, tt) {
    if (!tt || !tt.checkIn) return 'Present';
    const toMin = (hhmm) => {
      const [h, m] = String(hhmm || '').split(':').map(Number);
      return isNaN(h) ? null : h * 60 + (m || 0);
    };
    const inMin = toMin(checkInHHMM);
    const startMin = toMin(tt.checkIn);
    if (inMin === null || startMin === null) return 'Present';
    const halfMin = toMin(tt.halfDayTime);
    if (halfMin !== null && inMin > halfMin) return 'Half Day';
    if (inMin > startMin + 15) return 'Late';
    return 'Present';
  }

  function renderAttendanceTimetables() {
    const wrap = $('#attendanceTimetables');
    const empty = $('#timetableEmpty');
    const count = $('#timetableCount');
    if (!wrap) return;

    if (!db.employees.length) {
      wrap.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '0 set';
      return;
    }
    if (count) count.textContent = `${db.timetables.length} set`;

    wrap.innerHTML = db.employees
      .map((e) => {
        const tt = getTimetable(e.id);
        return `
      <div class="emp-list-item">
        <div class="eli-info">
          <div class="eli-t">${esc(e.fullName)}</div>
          <div class="eli-s">${
            tt
              ? `${esc(tt.checkIn || '·')} – ${esc(tt.checkOut || '·')} · ${esc(tt.workHours || '·')}h/day · Half day after ${esc(tt.halfDayTime || '·')}`
              : 'No timetable set'
          }</div>
        </div>
        <div class="eli-right">
          ${tt ? '<span class="badge badge-green">Set</span>' : '<span class="badge badge-gray">Not set</span>'}
          <button class="btn btn-ghost btn-sm" data-tt-edit="${esc(e.id)}">${tt ? 'Edit' : 'Set Timetable'}</button>
        </div>
      </div>`;
      })
      .join('');
    if (empty) empty.style.display = 'none';

    $$( '#attendanceTimetables [data-tt-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openTimetableForm(btn.dataset.ttEdit));
    });
  }

  function openTimetableForm(employeeId) {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const tt = getTimetable(employeeId);

    const body = `
      <div class="modal-hero">
        <div class="modal-hero-icon" style="background:linear-gradient(135deg,#38bdf8,#0b7fc9 60%,#075985);box-shadow:0 8px 18px rgba(11,127,201,0.35)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="modal-hero-info">
          <h3>${tt ? 'Edit Timetable' : 'Set Timetable'}</h3>
          <p>${esc(emp.fullName)} · attendance marks automatically from these timings</p>
        </div>
      </div>

      <form id="ttForm" class="form-grid" autocomplete="off">
        <div class="field">
          <label>Check-in Time <span class="req">*</span></label>
          <input type="time" name="checkIn" required value="${esc(tt?.checkIn || '09:00')}" />
        </div>
        <div class="field">
          <label>Check-out Time <span class="req">*</span></label>
          <input type="time" name="checkOut" required value="${esc(tt?.checkOut || '18:00')}" />
        </div>

        <div class="field">
          <label>Work Hours / Day <span class="req">*</span></label>
          <input type="number" name="workHours" min="1" max="24" step="0.5" required placeholder="e.g. 8" value="${esc(tt?.workHours || '8')}" />
        </div>
        <div class="field">
          <label>Half Day After (time) <span class="req">*</span></label>
          <input type="time" name="halfDayTime" required value="${esc(tt?.halfDayTime || '14:00')}" />
          <p class="hint">Check-ins after this time are marked Half Day</p>
        </div>

        <div class="field span-2">
          <div class="auto-price-box empty">Check-in later than start + 15 min → marked <strong>Late</strong> automatically</div>
        </div>
      </form>`;

    openModal({
      title: tt ? 'Edit Timetable' : 'Set Timetable',
      subtitle: emp.fullName,
      size: 'lg',
      body,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        ${tt ? '<button class="btn btn-danger-soft" data-act="remove">Remove</button>' : ''}
        <button class="btn btn-primary" data-act="save">${tt ? 'Save Changes' : 'Set Timetable'}</button>`,
      onOpen: (wrap, close) => {
        const form = $('#ttForm', wrap);
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        const removeBtn = wrap.querySelector('[data-act="remove"]');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            db.timetables = db.timetables.filter((t) => t.employeeId !== employeeId);
            save();
            close();
            renderAll();
            toast('Timetable removed');
          });
        }
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          const existing = getTimetable(employeeId);
          if (existing) {
            Object.assign(existing, data);
            existing.updatedAt = new Date().toISOString();
            toast('Timetable updated');
          } else {
            data.id = nextId('tmt');
            data.employeeId = employeeId;
            data.createdAt = new Date().toISOString();
            db.timetables.push(data);
            toast(`Timetable set for ${emp.fullName}`);
          }
          save();
          close();
          renderAll();
        });
      },
    });
  }

  function clearAttendanceFilters() {
    attendanceSearch = '';
    attendanceFilterStatus = 'all';
    attendanceDate = todayISO();
    const searchInput = $('#attendanceSearch');
    const dateInput = $('#attendanceDate');
    if (searchInput) searchInput.value = '';
    if (dateInput) dateInput.value = attendanceDate;
    $$('#attendanceFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
    renderAttendance();
    toast('Filters cleared');
  }

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
    renderAttendanceTimetables();
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
      { label: 'Late Mark', value: dayRecs.filter((a) => a.status === 'Late').length, sub: fmtDate(date), icon: 'late', accent: 'var(--amber)', bg: 'var(--amber-50)' },
      { label: 'Absent', value: dayRecs.filter((a) => a.status === 'Absent').length, sub: fmtDate(date), icon: 'absent', accent: 'var(--red)', bg: 'var(--red-50)' },
      { label: 'Half Day', value: dayRecs.filter((a) => a.status === 'Half Day').length, sub: fmtDate(date), icon: 'half', accent: 'var(--sky)', bg: 'var(--sky-50)' },
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
    let list = db.employees.filter((e) => !q || e.fullName.toLowerCase().includes(q) || (e.staffRole || '').toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    if (attendanceFilterStatus !== 'all') {
      list = list.filter((e) => {
        const rec = attendanceFor(e.id, date);
        return attendanceFilterStatus === 'unmarked' ? !rec : rec?.status === attendanceFilterStatus;
      });
    }

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
      empty.querySelector('.empty-text').textContent = 'Try a different filter or search term.';
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

    $$( '#attendanceList .att-row').forEach((row) => {
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

    $$( '#leaveTable [data-act]').forEach((btn) => {
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

    const isEmployee = session?.role === 'employee';
    const preEmp = isEmployee ? currentEmployee()?.id || prefill.employeeId || '' : l?.employeeId || prefill.employeeId || '';
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
        ${
          isEmployee
            ? ''
            : `<div class="field span-2">
          <label>Employee <span class="req">*</span></label>
          ${pickerFieldHTML('lvEmp', 'employeeId', 'Type employee name to search...', preEmp, pickerLabelById(pickerOptionsEmployee, preEmp))}
        </div>`
        }

        <div class="field ${isEmployee ? 'span-2' : ''}">
          <label>Leave Type <span class="req">*</span></label>
          <select name="type" required>
            ${types.map((t) => `<option ${(l?.type || 'Casual Leave') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        ${
          isEmployee
            ? ''
            : `<div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Pending', 'Approved', 'Rejected'].map((s) => `<option ${(l?.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>`
        }

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
        if (!isEmployee) wirePicker(wrap, { base: 'lvEmp', options: pickerOptionsEmployee });
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          if (isEmployee) {
            data.employeeId = preEmp;
            data.status = l?.status || 'Pending';
          } else if (!data.employeeId) {
            toast('Please select an employee from the suggestions.', 'error');
            return;
          }
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

    $('#addSalaryBtn').style.display = db.salaries.length ? '' : 'none';

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

    $$( '#salaryTable [data-act]').forEach((btn) => {
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

    const methods = ['Cash', 'UPI'];

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
          ${pickerFieldHTML('salEmp', 'employeeId', 'Type employee name to search...', sal?.employeeId || '', pickerLabelById(pickerOptionsEmployee, sal?.employeeId || ''))}
        </div>

        <div class="field">
          <label>Salary Month <span class="req">*</span></label>
          <input type="month" name="month" required value="${esc(sal?.month || monthISO())}" />
        </div>
        <div class="field"></div>

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

        <div class="field">
          <label>Status <span class="req">*</span></label>
          <select name="status" required>
            ${['Pending', 'Paid'].map((s) => `<option ${(sal?.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field"></div>
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
        wirePicker(wrap, {
          base: 'salEmp',
          options: pickerOptionsEmployee,
          onChoose: (o) => {
            if (sal) return;
            const e = db.employees.find((x) => x.id === o.id);
            if (e && e.salary && !form.basic.value) form.basic.value = e.salary;
          },
        });
        wrap.querySelector('[data-act="cancel"]').addEventListener('click', close);
        wrap.querySelector('[data-act="save"]').addEventListener('click', () => {
          if (!form.reportValidity()) return;
          const data = Object.fromEntries(new FormData(form).entries());
          if (!data.employeeId) {
            toast('Please select an employee from the suggestions.', 'error');
            return;
          }
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

﻿  /* ================= AUTH / ROLE SESSION ================= */
  const AUTH_KEY = 'salon_session';
  const AUTH_CFG_KEY = 'salon_auth_cfg';
  let session = null;

  try {
    session = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    session = null;
  }

  function saveSession(s) {
    session = s;
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  function clearSession() {
    session = null;
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
  }

  function isAdmin() {
    return !!session && session.role === 'admin';
  }

  function isEmployee() {
    return !!session && session.role === 'employee';
  }

  function currentEmployee() {
    if (!isEmployee()) return null;
    return db.employees.find((e) => e.id === session.employeeId) || null;
  }

  /* ================= ROLE-BASED PERMISSION CHECKS ================= */

  const ADMIN_ONLY_SECTIONS = new Set([
    'dashboard', 'employees', 'customers', 'visits', 'appointments',
    'payments', 'expenses', 'birthdays', 'services', 'attendance',
    'leaves', 'salary',
  ]);

  const ADMIN_DATA_SECTIONS = new Set([
    'employees', 'customers', 'visits', 'appointments', 'payments',
    'expenses', 'birthdays', 'services', 'attendance', 'leaves', 'salary',
  ]);

  const EMPLOYEE_DATA_SECTIONS = new Set([
    'emp-dash', 'emp-appointments', 'emp-visits', 'emp-attendance',
    'emp-leaves', 'emp-salary', 'emp-profile', 'emp-customers',
  ]);

  function isAdminSection(section) {
    return ADMIN_ONLY_SECTIONS.has(section);
  }

  function isEmployeeSection(section) {
    return EMPLOYEE_DATA_SECTIONS.has(section);
  }

  function canAccessSection(section) {
    if (!session) return false;
    if (session.role === 'admin') return true;
    if (session.role === 'employee') return isEmployeeSection(section);
    return false;
  }

  function canManageAdminData() {
    return isAdmin();
  }

  function canViewOwnDataOnly() {
    return isEmployee();
  }

  function getOwnEmployeeId() {
    return isEmployee() ? session.employeeId : null;
  }

  function filterByOwnData(list) {
    if (!session || !session.employeeId) return [];
    const ownId = session.employeeId;
    return list.filter((item) => item.employeeId === ownId);
  }

  function getAdminPassword() {
    try {
      const cfg = JSON.parse(localStorage.getItem(AUTH_CFG_KEY) || 'null');
      return (cfg && cfg.adminPassword) || 'admin123';
    } catch {
      return 'admin123';
    }
  }

  function getAdminUsername() {
    try {
      const cfg = JSON.parse(localStorage.getItem(AUTH_CFG_KEY) || 'null');
      return String((cfg && cfg.adminUsername) || 'admin').trim().toLowerCase();
    } catch {
      return 'admin';
    }
  }

  function defaultEmployeeUsername(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      .replace(/[^a-z0-9._-]/g, '');
  }

  function employeeUsername(emp) {
    return String((emp && emp.username) || defaultEmployeeUsername(emp && emp.fullName)).trim().toLowerCase();
  }

  function employeePassword(emp) {
    return String((emp && emp.password) || 'employee123');
  }

  function findEmployeeByLoginName(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return null;
    return (
      db.employees.find(
        (e) =>
          employeeUsername(e) === u ||
          String(e.fullName || '').trim().toLowerCase() === u ||
          defaultEmployeeUsername(e.fullName) === u ||
          String(e.id || '').toLowerCase() === u
      ) || null
    );
  }

  function loginUser(username, password) {
    const u = String(username || '').trim();
    const p = String(password || '');
    if (!u || !p) {
      toast('Enter your username and password.', 'error');
      return false;
    }

    if (u.toLowerCase() === getAdminUsername() && p === getAdminPassword()) {
      saveSession({ role: 'admin', loggedInAt: new Date().toISOString() });
      toast('Welcome back, Admin');
      route();
      return true;
    }

    const emp = findEmployeeByLoginName(u);
    if (emp && employeePassword(emp) === p) {
      saveSession({ role: 'employee', employeeId: emp.id, loggedInAt: new Date().toISOString() });
      toast(`Welcome, ${emp.fullName}!`);
      route();
      return true;
    }

    toast('Invalid username or password.', 'error');
    return false;
  }

  /* Route by role after login/logout */
  function route() {
    const login = $('#loginScreen');
    const adminApp = $('#app');
    const empApp = $('#empApp');

    if (!session) {
      login.hidden = false;
      if (adminApp) {
        adminApp.hidden = true;
        adminApp.style.display = 'none';
      }
      if (empApp) {
        empApp.hidden = true;
        empApp.style.display = 'none';
      }
      return;
    }

    login.hidden = true;

    if (isAdmin()) {
      if (empApp) {
        empApp.hidden = true;
        empApp.style.display = 'none';
      }
      if (adminApp) {
        adminApp.hidden = false;
        adminApp.style.display = '';
      }
      goto('dashboard');
    } else if (isEmployee()) {
      if (!currentEmployee()) {
        // Employee record was deleted — force logout
        clearSession();
        route();
        toast('Your employee record was removed. Please contact the admin.', 'error');
        return;
      }
      if (adminApp) {
        adminApp.hidden = true;
        adminApp.style.display = 'none';
      }
      if (empApp) {
        empApp.hidden = false;
        empApp.style.display = '';
      }
      empGoto('emp-dash');
    } else {
      clearSession();
      route();
      return;
    }

    window.scrollTo(0, 0);
  }

  function logout() {
    clearSession();
    toast('Signed out successfully');
    route();
  }

  /* ================= EMPLOYEE DASHBOARD APP ================= */
  const EMP_SECTIONS = {
    'emp-dash': { title: 'Dashboard', sub: 'Your personal work overview' },
    'emp-appointments': { title: 'My Appointments', sub: 'Your scheduled & completed appointments' },
    'emp-customers': { title: 'My Customers', sub: 'Customers assigned to you' },
    'emp-visits': { title: 'My Visits', sub: 'Visits assigned to you' },
    'emp-attendance': { title: 'My Attendance', sub: 'Check in and review your attendance' },
    'emp-leaves': { title: 'Leave Requests', sub: 'Request leave and track approvals' },
    'emp-salary': { title: 'My Salary', sub: 'Your salary records & payments' },
    'emp-profile': { title: 'My Profile', sub: 'Your personal & employment details' },
  };

  let empSection = 'emp-dash';
  let empAptFilter = 'today';
  let empAptSearch = '';

  function attBadge(status) {
    const cls = status === 'Present' ? 'badge-green' : status === 'Late' ? 'badge-amber' : status === 'Absent' ? 'badge-red' : 'badge-sky';
    return `<span class="badge ${cls}">${esc(status || '·')}</span>`;
  }

  function empGoto(section) {
    if (!canAccessSection(section)) return;
    if (!EMP_SECTIONS[section]) return;
    empSection = section;
    $$('#empApp .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.empSection === section));
    $$('#empBottomNav [data-emp-section]').forEach((b) => b.classList.toggle('active', b.dataset.empSection === section));
    $$('#empApp .section').forEach((s) => s.classList.toggle('active', s.id === section));
    $('#empPageTitle').textContent = EMP_SECTIONS[section].title;
    $('#empPageSubtitle').textContent = EMP_SECTIONS[section].sub;
    renderEmp(section);
    closeEmpSidebar();
  }

  function renderEmp(section) {
    const emp = currentEmployee();
    if (!emp) return;
    switch (section) {
      case 'emp-appointments':
        renderEmpAppointments(emp);
        break;
      case 'emp-customers':
        renderEmpCustomers(emp);
        break;
      case 'emp-visits':
        renderEmpVisits(emp);
        break;
      case 'emp-attendance':
        renderEmpAttendance(emp);
        break;
      case 'emp-leaves':
        renderEmpLeaves(emp);
        break;
      case 'emp-salary':
        renderEmpSalary(emp);
        break;
      case 'emp-profile':
        renderEmpProfile(emp);
        break;
      default:
        renderEmpDash(emp);
    }
    updateEmpBadges(emp);
  }

  function updateEmpBadges(emp) {
    const el = $('#empNavBadge-leaves');
    if (!el) return;
    const pending = db.leaves.filter((l) => l.employeeId === emp.id && l.status === 'Pending').length;
    el.hidden = !pending;
    el.textContent = pending;
  }

  /* ---- Employee overview ---- */
  function renderEmpDash(emp) {
    const today = todayISO();
    const thisMonth = monthISO();

    // Header
    $('#empDashHead').innerHTML = `
      <div class="emp-dash-head">
        ${avatarHTML(emp, 'avatar-lg')}
        <div class="edh-info">
          <div class="edh-name">${esc(emp.fullName)}</div>
          <div class="edh-meta">${esc(emp.staffRole || 'Employee')} · ${esc(emp.shift || 'No shift')}</div>
          <div class="edh-badges">
            <span class="badge badge-brand">${esc(emp.id)}</span>
            ${empStatusBadge(emp.employmentStatus)}
            ${isTodayBirthday(emp.dob) ? '<span class="badge badge-amber">🎂 Birthday today</span>' : ''}
          </div>
        </div>
      </div>`;

    // Scoped data
    const apts = db.appointments.filter((a) => a.employeeId === emp.id);
    const todaysApts = apts.filter((a) => a.date === today && a.status !== 'Cancelled').sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const upcoming = apts.filter((a) => (a.status === 'Scheduled' || a.status === 'Confirmed') && a.date >= today);
    const myVisits = db.visits.filter((v) => v.employeeId === emp.id);
    const visitsDone = myVisits.filter((v) => v.status === 'Completed').length;
    const todayRec = attendanceFor(emp.id, today);
    const monthRecs = db.attendance.filter((a) => a.employeeId === emp.id && String(a.date || '').slice(0, 7) === thisMonth);
    const presentDays = monthRecs.filter((a) => a.status === 'Present' || a.status === 'Late' || a.status === 'Half Day').length;
    const myLeaves = db.leaves.filter((l) => l.employeeId === emp.id);
    const pendingLeaves = myLeaves.filter((l) => l.status === 'Pending').length;

    const icons = {
      cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      visit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      att: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>',
      pay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
    };

    const stats = [
      { label: "Today's Appointments", value: todaysApts.length, sub: fmtDate(today), icon: 'cal', accent: 'var(--brand)', bg: 'var(--brand-50)' },
      { label: 'Upcoming Appointments', value: upcoming.length, sub: `${apts.length} total`, icon: 'up', accent: 'var(--sky)', bg: 'var(--sky-50)' },
      { label: 'My Visits', value: visitsDone, sub: `of ${myVisits.length} completed`, icon: 'visit', accent: 'var(--violet)', bg: 'var(--violet-50)' },
      { label: "Today's Attendance", value: todayRec ? todayRec.status : 'Not marked', sub: todayRec ? `Check-in ${todayRec.checkIn || '·'}` : 'Tap Check In below', icon: 'att', accent: todayRec ? 'var(--green)' : 'var(--amber)', bg: todayRec ? 'var(--green-50)' : 'var(--amber-50)' },
      { label: 'Pending Leaves', value: pendingLeaves, sub: `${myLeaves.length} request(s)`, icon: 'leave', accent: 'var(--amber)', bg: 'var(--amber-50)' },
    ];

    $('#empDashStats').innerHTML = stats
      .map(
        (s) => `
      <div class="stat-card" style="--stat-accent:${s.accent};--stat-bg:${s.bg}">
        <div class="stat-top"><div class="stat-icon">${icons[s.icon]}</div></div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>`
      )
      .join('');

    // Progress (my work progress)
    const attPct = monthRecs.length ? Math.round((presentDays / monthRecs.length) * 100) : 0;
    const visitPct = myVisits.length ? Math.round((visitsDone / myVisits.length) * 100) : 0;
    $('#empDashProgress').innerHTML = `
      <div class="progress-card">
        <div class="pg-head"><span class="pg-title">Attendance · ${esc(fmtMonth(thisMonth))}</span><span class="pg-val">${presentDays}/${monthRecs.length} days · ${attPct}%</span></div>
        <div class="progress-track"><div class="progress-fill green" style="width:${attPct}%"></div></div>
      </div>
      <div class="progress-card">
        <div class="pg-head"><span class="pg-title">Visits completed</span><span class="pg-val">${visitsDone}/${myVisits.length} · ${visitPct}%</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${visitPct}%"></div></div>
      </div>`;

    // Quick action button states
    const qaCheckin = $('#empQaCheckin');
    if (todayRec) {
      qaCheckin.disabled = true;
      qaCheckin.innerHTML = `✓ Checked in · ${esc(todayRec.checkIn || todayRec.status)}`;
    } else {
      qaCheckin.disabled = false;
      qaCheckin.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Check In Now`;
    }

    const notifLabel = $('#empQaNotifLabel');
    if (notifLabel) {
      const count = empNotificationItems(emp).length;
      notifLabel.textContent = count ? `Notifications (${count})` : 'Notifications';
    }

    // Today's schedule
    $('#empDashToday').innerHTML = todaysApts.length
      ? todaysApts
          .map((a) => {
            const cus = db.customers.find((c) => c.id === a.customerId);
            return `
          <div class="emp-list-item">
            <div class="eli-info">
              <div class="eli-t">${esc(a.time || '·')} · ${esc(a.serviceName || 'Appointment')}</div>
              <div class="eli-s">${esc(cus?.fullName || 'Customer')}${cus?.mobile ? ' · ' + esc(cus.mobile) : ''}</div>
            </div>
            <div class="eli-right">${appointmentStatusBadge(a.status)}</div>
          </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No appointments today.</p></div>`;

    // Recent activity: latest attendance + latest visit
    const recentAtt = db.attendance.filter((a) => a.employeeId === emp.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    const recentVisit = [...myVisits].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    let activity = '';
    if (recentAtt) {
      activity += `
      <div class="emp-list-item">
        <div class="eli-info">
          <div class="eli-t">Attendance · ${fmtDate(recentAtt.date)}</div>
          <div class="eli-s">${recentAtt.checkIn ? 'Check-in ' + esc(recentAtt.checkIn) : 'No check-in time'}</div>
        </div>
        <div class="eli-right">${attBadge(recentAtt.status)}</div>
      </div>`;
    }
    if (recentVisit) {
      const cus = db.customers.find((c) => c.id === recentVisit.customerId);
      activity += `
      <div class="emp-list-item">
        <div class="eli-info">
          <div class="eli-t">Visit · ${esc(recentVisit.serviceName || 'Salon Visit')}</div>
          <div class="eli-s">${esc(cus?.fullName || 'Customer')} · ${fmtDateTime(recentVisit.visitDateTime)}</div>
        </div>
        <div class="eli-right">${statusBadge(recentVisit.status)}</div>
      </div>`;
    }
    $('#empDashActivity').innerHTML = activity || `<div class="empty-state empty-inline"><p class="empty-text">No recent activity yet.</p></div>`;
  }

  /* ---- My Appointments ---- */
  function renderEmpAppointments(emp) {
    const today = todayISO();
    let list = db.appointments.filter((a) => a.employeeId === emp.id);
    if (empAptFilter === 'today') list = list.filter((a) => a.date === today);
    else if (empAptFilter === 'upcoming') list = list.filter((a) => (a.status === 'Scheduled' || a.status === 'Confirmed') && a.date >= today);
    else if (empAptFilter === 'completed') list = list.filter((a) => a.status === 'Completed');

    const q = empAptSearch.toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const cus = db.customers.find((c) => c.id === a.customerId);
        return (
          (a.id || '').toLowerCase().includes(q) ||
          (a.serviceName || '').toLowerCase().includes(q) ||
          (a.status || '').toLowerCase().includes(q) ||
          (cus?.fullName || '').toLowerCase().includes(q)
        );
      });
    }
    list.sort((a, b) => `${b.date || ''}T${b.time || ''}`.localeCompare(`${a.date || ''}T${a.time || ''}`));

    $$('#empAptFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.paf === empAptFilter));

    $('#empAptList').innerHTML = list.length
      ? list
          .map((a) => {
            const cus = db.customers.find((c) => c.id === a.customerId);
            return `
        <div class="emp-list-item">
          <div class="eli-info">
            <div class="eli-t">${esc(a.serviceName || 'Appointment')}</div>
            <div class="eli-s">${esc(cus?.fullName || 'Customer')}${cus?.mobile ? ' · ' + esc(cus.mobile) : ''}</div>
            <div class="eli-s">${fmtDate(a.date)} · ${esc(a.time || '·')}</div>
          </div>
          <div class="eli-right">
            ${appointmentStatusBadge(a.status)}
            ${a.price != null && a.price !== '' ? `<span class="eli-amount">${fmtMoney(a.price)}</span>` : ''}
          </div>
        </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No ${empAptFilter === 'all' ? '' : empAptFilter + ' '}appointments found.</p></div>`;
  }

  /* ---- My Visits ---- */
  function renderEmpVisits(emp) {
    const list = db.visits
      .filter((v) => v.employeeId === emp.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    $('#empVisitsList').innerHTML = list.length
      ? list
          .map((v) => {
            const cus = db.customers.find((c) => c.id === v.customerId);
            return `
        <div class="emp-list-item">
          <div class="eli-info">
            <div class="eli-t">${esc(v.serviceName || 'Salon Visit')}</div>
            <div class="eli-s">${esc(cus?.fullName || 'Customer')}${cus?.mobile ? ' · ' + esc(cus.mobile) : ''}</div>
            <div class="eli-s">${fmtDateTime(v.visitDateTime)}</div>
          </div>
          <div class="eli-right">
            ${statusBadge(v.status)}
            ${v.amount ? `<span class="eli-amount">${fmtMoney(v.amount)}</span>` : ''}
          </div>
        </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No visits assigned yet.</p></div>`;
  }

  /* ---- My Attendance ---- */
  function renderEmpAttendance(emp) {
    const today = todayISO();
    const thisMonth = monthISO();
    const todayRec = attendanceFor(emp.id, today);
    const tt = getTimetable(emp.id);

    $('#empAttCheckin').innerHTML = `
      <div class="panel-quick-row">
        ${
          todayRec
            ? `<button class="btn btn-ghost" disabled>✓ Checked in today · ${esc(todayRec.checkIn || todayRec.status)} · ${esc(todayRec.status)}</button>`
            : `<button class="btn btn-primary" id="empAttCheckinBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Check In Now
              </button>`
        }
      </div>
      ${
        tt
          ? `<div class="progress-card" style="margin-bottom:14px"><div class="pg-head"><span class="pg-title">My Shift</span><span class="pg-val">${esc(tt.checkIn)} – ${esc(tt.checkOut)} · ${esc(tt.workHours)}h</span></div><p style="font-size:11.5px;color:var(--text-3);margin:0">Half day after ${esc(tt.halfDayTime)} · late over 15 min</p></div>`
          : ''
      }`;

    const checkinBtn = $('#empAttCheckinBtn');
    if (checkinBtn) checkinBtn.addEventListener('click', () => empCheckIn(emp.id));

    const all = db.attendance.filter((a) => a.employeeId === emp.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const monthRecs = all.filter((a) => String(a.date || '').slice(0, 7) === thisMonth);
    const counts = {
      Present: monthRecs.filter((a) => a.status === 'Present').length,
      Late: monthRecs.filter((a) => a.status === 'Late').length,
      Absent: monthRecs.filter((a) => a.status === 'Absent').length,
      Half: monthRecs.filter((a) => a.status === 'Half Day').length,
    };

    $('#empAttSummary').innerHTML = `
      <div class="ps-cell green"><div class="ps-n">${counts.Present}</div><div class="ps-l">Present</div></div>
      <div class="ps-cell amber"><div class="ps-n">${counts.Late}</div><div class="ps-l">Late Mark</div></div>
      <div class="ps-cell red"><div class="ps-n">${counts.Absent}</div><div class="ps-l">Absent</div></div>
      <div class="ps-cell sky"><div class="ps-n">${counts.Half}</div><div class="ps-l">Half Day</div></div>`;

    $('#empAttList').innerHTML = all.length
      ? all
          .map(
            (a) => `
        <div class="emp-list-item">
          <div class="eli-info">
            <div class="eli-t">${fmtDate(a.date)}</div>
            <div class="eli-s">${a.checkIn ? 'Check-in ' + esc(a.checkIn) : 'No check-in time'}</div>
          </div>
          <div class="eli-right">${attBadge(a.status)}</div>
        </div>`
          )
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No attendance records yet.</p></div>`;
  }

  function empCheckIn(empId) {
    const t = todayISO();
    if (attendanceFor(empId, t)) {
      toast('You are already checked in today.', 'error');
      return;
    }
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const tt = getTimetable(empId);
    const status = attendanceStatusFromTimetable(hhmm, tt);
    db.attendance.push({
      id: nextId('att'),
      employeeId: empId,
      date: t,
      status,
      checkIn: hhmm,
      notes: tt ? 'Auto-marked from timetable' : 'Self check-in from employee dashboard',
      createdAt: now.toISOString(),
    });
    save();
    renderEmp(empSection);
    toast(status === 'Present' ? `Checked in at ${hhmm}` : `Checked in at ${hhmm} · marked ${status}`);
  }

  /* ---- My Leaves ---- */
  function renderEmpLeaves(emp) {
    const all = db.leaves.filter((l) => l.employeeId === emp.id).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    $('#empLeaveList').innerHTML = all.length
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
      : `<div class="empty-state empty-inline"><p class="empty-text">No leave requests yet. Tap "Request Leave" to apply.</p></div>`;
  }

  /* ---- My Salary ---- */
  function renderEmpSalary(emp) {
    const all = db.salaries.filter((s) => s.employeeId === emp.id).sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
    const paid = all.filter((s) => s.status === 'Paid');
    const totalPaid = paid.reduce((t, s) => t + num(s.net), 0);
    const pendingAmt = all.filter((s) => s.status === 'Pending').reduce((t, s) => t + num(s.net), 0);
    const totalBonus = all.reduce((t, s) => t + num(s.bonus), 0);

    $('#empSalarySummary').innerHTML = `
      <div class="ps-cell green"><div class="ps-n">${fmtMoney(totalPaid)}</div><div class="ps-l">Total Paid</div></div>
      <div class="ps-cell amber"><div class="ps-n">${fmtMoney(pendingAmt)}</div><div class="ps-l">Pending</div></div>
      <div class="ps-cell"><div class="ps-n">${all.length}</div><div class="ps-l">Records</div></div>
      <div class="ps-cell sky"><div class="ps-n">${fmtMoney(totalBonus)}</div><div class="ps-l">Bonuses</div></div>`;

    $('#empSalaryList').innerHTML = all.length
      ? all
          .map(
            (s) => `
        <div class="emp-list-item">
          <div class="eli-info">
            <div class="eli-t">${esc(fmtMonth(s.month))}</div>
            <div class="eli-s">Basic ${fmtMoney(s.basic)}${num(s.bonus) ? ' · Bonus +' + fmtMoney(s.bonus) : ''}${num(s.deductions) ? ' · Deductions -' + fmtMoney(s.deductions) : ''}</div>
            <div class="eli-s">${s.paidDate ? 'Paid ' + fmtDate(s.paidDate) : ''} · ${esc(s.method || '·')}</div>
          </div>
          <div class="eli-right">
            <span class="eli-amount">${fmtMoney(s.net)}</span>
            ${salaryStatusBadge(s.status)}
          </div>
        </div>`
          )
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No salary records yet.</p></div>`;
  }

  /* ---- My Profile ---- */
  function renderEmpProfile(emp) {
    const visitsDone = db.visits.filter((v) => v.employeeId === emp.id && v.status === 'Completed').length;
    const totalApts = db.appointments.filter((a) => a.employeeId === emp.id).length;

    $('#empProfileHero').innerHTML = `
      <div class="profile-hero">
        ${avatarHTML(emp, 'avatar-xl')}
        <div class="profile-hero-info">
          <h2>${esc(emp.fullName)}</h2>
          <div class="role">${esc(emp.staffRole || 'Employee')} · ${esc(emp.specialties || '')}</div>
          <div class="badges">
            <span class="badge badge-brand">${esc(emp.id)}</span>
            ${empStatusBadge(emp.employmentStatus)}
            <span class="badge badge-gray">${visitsDone} visits · ${totalApts} appointments</span>
          </div>
        </div>
      </div>`;

    $('#empProfilePersonal').innerHTML = `
      <div class="detail-item"><div class="label">Employee ID</div><div class="value"><strong style="color:var(--brand)">${esc(emp.id)}</strong></div></div>
      <div class="detail-item"><div class="label">Date of Birth</div><div class="value">${fmtDate(emp.dob)}${isTodayBirthday(emp.dob) ? ' · 🎂 Today!' : ''}</div></div>
      <div class="detail-item"><div class="label">Gender</div><div class="value">${esc(emp.gender || '·')}</div></div>
      <div class="detail-item"><div class="label">Mobile Number</div><div class="value">${esc(emp.mobile || '·')}</div></div>
      <div class="detail-item span-2"><div class="label">Address</div><div class="value">${esc(emp.address || '·')}</div></div>`;

    $('#empProfileEmployment').innerHTML = `
      <div class="detail-item"><div class="label">Staff Role</div><div class="value">${esc(emp.staffRole || '·')}</div></div>
      <div class="detail-item"><div class="label">Specialties / Services</div><div class="value">${esc(emp.specialties || '·')}</div></div>
      <div class="detail-item"><div class="label">Experience (Years)</div><div class="value">${esc(emp.experienceYears || '·')}</div></div>
      <div class="detail-item"><div class="label">Monthly Salary</div><div class="value">${emp.salary ? fmtMoney(emp.salary) : '·'}</div></div>
      <div class="detail-item"><div class="label">Shift</div><div class="value">${esc(emp.shift || '·')}</div></div>
      <div class="detail-item"><div class="label">Login Username</div><div class="value">${esc(employeeUsername(emp))}</div></div>
      <div class="detail-item"><div class="label">Joining Date</div><div class="value">${fmtDate(emp.joiningDate)}</div></div>
      <div class="detail-item"><div class="label">Employment Status</div><div class="value">${empStatusBadge(emp.employmentStatus)}</div></div>
      <div class="detail-item span-2"><div class="label">Notes</div><div class="value">${esc(emp.notes || '·')}</div></div>`;
  }

  /* ---- My Customers (assigned to this employee) ---- */
  function renderEmpCustomers(emp) {
    const list = db.customers
      .filter((c) => c.employeeId === emp.id)
      .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));

    $('#empCustomersList').innerHTML = list.length
      ? list
          .map((c) => {
            const visits = db.visits.filter((v) => v.customerId === c.id).length;
            const lastVisit = db.visits
              .filter((v) => v.customerId === c.id)
              .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
            return `
        <div class="emp-list-item">
          <div class="eli-info">
            <div class="eli-t">${esc(c.fullName || 'Customer')}</div>
            <div class="eli-s">${esc(c.mobile || '·')}${c.email ? ' · ' + esc(c.email) : ''}</div>
            <div class="eli-s">${visits} visit(s)${lastVisit ? ' · Last: ' + fmtDate(lastVisit.visitDateTime) : ''}</div>
          </div>
          <div class="eli-right">
            <span class="badge badge-brand">#${esc(c.id)}</span>
          </div>
        </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No customers assigned to you yet.</p></div>`;
  }

  /* ---- Notifications (dashboard button) ---- */
  function empNotificationItems(emp) {
    const pendingLeaves = db.leaves.filter((l) => l.employeeId === emp.id && l.status === 'Pending');
    const approvedLeaves = db.leaves.filter((l) => l.employeeId === emp.id && l.status === 'Approved');
    const rejectedLeaves = db.leaves.filter((l) => l.employeeId === emp.id && l.status === 'Rejected');
    const todayRec = attendanceFor(emp.id, todayISO());

    const items = [];

    if (pendingLeaves.length > 0) {
      items.push({
        title: 'Leave Request Pending',
        body: `${pendingLeaves.length} leave request(s) awaiting approval`,
        time: 'Recent',
        type: 'pending',
      });
    }
    if (approvedLeaves.length > 0) {
      items.push({
        title: 'Leave Approved',
        body: `${approvedLeaves.length} leave request(s) approved`,
        time: 'Recent',
        type: 'approved',
      });
    }
    if (rejectedLeaves.length > 0) {
      items.push({
        title: 'Leave Rejected',
        body: `${rejectedLeaves.length} leave request(s) rejected`,
        time: 'Recent',
        type: 'rejected',
      });
    }
    if (!todayRec) {
      items.push({
        title: 'Check-in Reminder',
        body: 'You have not checked in today',
        time: 'Today',
        type: 'reminder',
      });
    }

    return items;
  }

  function openEmpNotifications() {
    const emp = currentEmployee();
    if (!emp) return;
    const items = empNotificationItems(emp);
    const body = items.length
      ? items
          .map((it) => {
            const typeCls = it.type === 'approved' ? 'badge-green' : it.type === 'rejected' ? 'badge-red' : it.type === 'pending' ? 'badge-amber' : 'badge-sky';
            return `
        <div class="emp-list-item">
          <div class="eli-info">
            <div class="eli-t">${esc(it.title)}</div>
            <div class="eli-s">${esc(it.body)}</div>
            <div class="eli-s">${esc(it.time)}</div>
          </div>
          <div class="eli-right">
            <span class="badge ${typeCls}">${esc(it.type.charAt(0).toUpperCase() + it.type.slice(1))}</span>
          </div>
        </div>`;
          })
          .join('')
      : `<div class="empty-state empty-inline"><p class="empty-text">No new notifications.</p></div>`;

    openModal({
      title: 'Notifications',
      subtitle: 'Leave approvals & system alerts',
      size: 'md',
      body,
      footer: `<button class="btn btn-primary" data-act="close">Close</button>`,
      onOpen: (wrap, close) => {
        wrap.querySelector('[data-act="close"]').addEventListener('click', close);
      },
    });
  }

  function closeEmpSidebar() {
    const sb = $('#empSidebar');
    const bd = $('#empSidebarBackdrop');
    if (sb) sb.classList.remove('open');
    if (bd) bd.classList.remove('show');
  }

  /* ================= INIT ================= */
  function init() {
    // Today chips (admin + employee shells)
    const todayStr = new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    $('#todayChip').textContent = todayStr;
    $('#empTodayChip').textContent = todayStr;

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
      salaryEmpty: () => openSalaryForm(),
    };
    $('#content').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-empty-cta]');
      if (!btn) return;
      const fn = emptyCtaActions[btn.dataset.emptyCta];
      if (fn) fn();
    });

    // Global search (admin only)
    $('#globalSearchBtn').addEventListener('click', () => {
      if (isAdmin()) openGlobalSearch();
    });
    document.addEventListener('keydown', (e) => {
      if (!isAdmin()) return;
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

    $('#adminSignoutBtn').addEventListener('click', () => {
      logout();
    });

    // Shared search + filter dropdown behaviour
    const setupFilterDropdown = (wrapId, inputId, dropdownId, chipsSelector, onSelect) => {
      const wrap = $('#' + wrapId);
      const input = $('#' + inputId);
      const dropdown = $('#' + dropdownId);
      if (!wrap || !input || !dropdown) return;
      const setOpen = (open) => {
        dropdown.hidden = !open;
        input.setAttribute('aria-expanded', String(open));
      };
      input.addEventListener('focus', () => setOpen(true));
      input.addEventListener('click', () => setOpen(true));
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) setOpen(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !dropdown.hidden) {
          setOpen(false);
          document.activeElement?.blur?.();
        }
      });
      $$(chipsSelector).forEach((chip) => {
        chip.addEventListener('click', () => {
          $$(chipsSelector).forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          if (onSelect) onSelect(chip);
          setOpen(false);
        });
      });
    };

    // Employee
    $('#addEmployeeBtn').addEventListener('click', () => openEmployeeForm());
    $('#employeeSearch').addEventListener('input', (e) => {
      employeeSearch = e.target.value;
      renderEmployees();
    });
    setupFilterDropdown('employeeSearchWrap', 'employeeSearch', 'employeeFilterDropdown', '#employeeFilters .chip', (chip) => {
      employeeFilterStatus = chip.dataset.status;
      renderEmployees();
    });
    const clearEmployeeFiltersBtn = $('#clearEmployeeFilters');
    if (clearEmployeeFiltersBtn) clearEmployeeFiltersBtn.addEventListener('click', () => {
      employeeSearch = '';
      employeeFilterStatus = 'all';
      const input = $('#employeeSearch');
      if (input) input.value = '';
      $$('#employeeFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      renderEmployees();
    });


    // Customer
    $('#addCustomerBtn').addEventListener('click', () => openCustomerForm());
    $('#customerSearch').addEventListener('input', (e) => {
      customerSearch = e.target.value;
      renderCustomers();
    });
    setupFilterDropdown('customerSearchWrap', 'customerSearch', 'customerFilterDropdown', '#customerFilters .chip', (chip) => {
      customerFilterStatus = chip.dataset.pay;
      renderCustomers();
    });
    const clearCustomerFiltersBtn = $('#clearCustomerFilters');
    if (clearCustomerFiltersBtn) clearCustomerFiltersBtn.addEventListener('click', () => {
      customerSearch = '';
      customerFilterStatus = 'all';
      const input = $('#customerSearch');
      if (input) input.value = '';
      $$('#customerFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.pay === 'all'));
      renderCustomers();
    });

    // Visits
    $('#addVisitBtn').addEventListener('click', () => openVisitForm());

    const visitSearchWrap = $('#visitSearchWrap');
    const visitSearchInput = $('#visitSearch');
    const visitFilterDropdown = $('#visitFilterDropdown');
    const setVisitFilterOpen = (open) => {
      visitFilterDropdown.hidden = !open;
      visitSearchInput.setAttribute('aria-expanded', String(open));
    };

    visitSearchInput.addEventListener('input', (e) => {
      visitSearch = e.target.value;
      renderVisits();
    });
    visitSearchInput.addEventListener('focus', () => setVisitFilterOpen(true));
    visitSearchInput.addEventListener('click', () => setVisitFilterOpen(true));
    document.addEventListener('click', (e) => {
      if (!visitSearchWrap.contains(e.target)) setVisitFilterOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !visitFilterDropdown.hidden) {
        setVisitFilterOpen(false);
        document.activeElement?.blur?.();
      }
    });

    $$( '#visitFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#visitFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        visitFilterStatus = chip.dataset.status;
        setVisitFilterOpen(false);
        renderVisits();
      });
    });
    $('#clearVisitFilters').addEventListener('click', () => {
      visitSearch = '';
      visitFilterStatus = 'all';
      const input = $('#visitSearch');
      if (input) input.value = '';
      $$( '#visitFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      setVisitFilterOpen(false);
      renderVisits();
    });

    // Appointments
    $('#addAppointmentBtn').addEventListener('click', () => openAppointmentForm());
    $('#appointmentSearch').addEventListener('input', (e) => {
      appointmentSearch = e.target.value;
      renderAppointments();
    });
    setupFilterDropdown('appointmentSearchWrap', 'appointmentSearch', 'appointmentFilterDropdown', '#appointmentFilters .chip');
    const clearAppointmentFiltersBtn = $('#clearAppointmentFilters');
    if (clearAppointmentFiltersBtn) clearAppointmentFiltersBtn.addEventListener('click', () => {
      appointmentSearch = '';
      appointmentFilterStatus = 'all';
      const input = $('#appointmentSearch');
      if (input) input.value = '';
      $$('#appointmentFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      renderAppointments();
    });
    $$( '#appointmentFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#appointmentFilters .chip').forEach((c) => c.classList.remove('active'));
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
    setupFilterDropdown('paymentSearchWrap', 'paymentSearch', 'paymentFilterDropdown', '#paymentFilters .chip');
    const clearPaymentFiltersBtn = $('#clearPaymentFilters');
    if (clearPaymentFiltersBtn) clearPaymentFiltersBtn.addEventListener('click', () => {
      paymentSearch = '';
      paymentFilterMethod = 'all';
      paymentFilterStatus = 'all';
      const input = $('#paymentSearch');
      if (input) input.value = '';
      $$('#paymentFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.method === 'all'));
      renderPayments();
    });
    $$( '#paymentFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#paymentFilters .chip').forEach((c) => c.classList.remove('active'));
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
    setupFilterDropdown('expenseSearchWrap', 'expenseSearch', 'expenseFilterDropdown', '#expenseFilters .chip');
    const clearExpenseFiltersBtn = $('#clearExpenseFilters');
    if (clearExpenseFiltersBtn) clearExpenseFiltersBtn.addEventListener('click', () => {
      expenseSearch = '';
      expenseFilterCat = 'all';
      const input = $('#expenseSearch');
      if (input) input.value = '';
      $$('#expenseFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === 'all'));
      renderExpenses();
    });
    $$( '#expenseFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#expenseFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        expenseFilterCat = chip.dataset.cat;
        renderExpenses();
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
    setupFilterDropdown('attendanceSearchWrap', 'attendanceSearch', 'attendanceFilterDropdown', '#attendanceFilters .chip', (chip) => {
      attendanceFilterStatus = chip.dataset.status;
      renderAttendance();
    });
    $('#markAllPresentBtn').addEventListener('click', markAllPresent);
    $('#clearAttendanceFiltersBtn').addEventListener('click', clearAttendanceFilters);

    // Leaves
    $('#leaveSearch').addEventListener('input', (e) => {
      leaveSearch = e.target.value;
      renderLeaves();
    });
    setupFilterDropdown('leaveSearchWrap', 'leaveSearch', 'leaveFilterDropdown', '#leaveFilters .chip');
    const clearLeaveFiltersBtn = $('#clearLeaveFilters');
    if (clearLeaveFiltersBtn) clearLeaveFiltersBtn.addEventListener('click', () => {
      leaveSearch = '';
      leaveFilterStatus = 'all';
      const input = $('#leaveSearch');
      if (input) input.value = '';
      $$('#leaveFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      renderLeaves();
    });
    $$( '#leaveFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#leaveFilters .chip').forEach((c) => c.classList.remove('active'));
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
    setupFilterDropdown('salarySearchWrap', 'salarySearch', 'salaryFilterDropdown', '#salaryFilters .chip');
    const clearSalaryFiltersBtn = $('#clearSalaryFilters');
    if (clearSalaryFiltersBtn) clearSalaryFiltersBtn.addEventListener('click', () => {
      salarySearch = '';
      salaryFilterStatus = 'all';
      const input = $('#salarySearch');
      if (input) input.value = '';
      $$('#salaryFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      renderSalary();
    });
    $$( '#salaryFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#salaryFilters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        salaryFilterStatus = chip.dataset.status;
        renderSalary();
      });
    });

    // Birthdays
    $('#birthdaySearch').addEventListener('input', (e) => {
      birthdaySearch = e.target.value;
      renderBirthdays();
    });
    setupFilterDropdown('birthdaySearchWrap', 'birthdaySearch', 'birthdayFilterDropdown', '#birthdayFilters .chip');
    const clearBirthdayFiltersBtn = $('#clearBirthdayFilters');
    if (clearBirthdayFiltersBtn) clearBirthdayFiltersBtn.addEventListener('click', () => {
      birthdaySearch = '';
      birthdayFilter = 'all';
      const input = $('#birthdaySearch');
      if (input) input.value = '';
      $$('#birthdayFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.btype === 'all'));
      renderBirthdays();
    });
    $$( '#birthdayFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$( '#birthdayFilters .chip').forEach((c) => c.classList.remove('active'));
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
    setupFilterDropdown('serviceSearchWrap', 'serviceSearch', 'serviceFilterDropdown', '#serviceFilters .chip', (chip) => {
      serviceFilterStatus = chip.dataset.status;
      renderServices();
    });
    const clearServiceFiltersBtn = $('#clearServiceFilters');
    if (clearServiceFiltersBtn) clearServiceFiltersBtn.addEventListener('click', () => {
      serviceSearch = '';
      serviceFilterStatus = 'all';
      const input = $('#serviceSearch');
      if (input) input.value = '';
      $$('#serviceFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.status === 'all'));
      renderServices();
    });

    // ---- Login screen ----
    const loginForm = $('#loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = $('#loginUsername').value;
        const password = $('#loginPassword').value;
        if (loginUser(username, password)) {
          loginForm.reset();
          const pw = $('#loginPassword');
          if (pw) pw.type = 'password';
          const show = $('#loginShowBtn');
          if (show) show.textContent = 'Show';
        }
      });
    }

    const loginShowBtn = $('#loginShowBtn');
    if (loginShowBtn) {
      loginShowBtn.addEventListener('click', () => {
        const pw = $('#loginPassword');
        if (!pw) return;
        const reveal = pw.type === 'password';
        pw.type = reveal ? 'text' : 'password';
        loginShowBtn.textContent = reveal ? 'Hide' : 'Show';
      });
    }

    // ---- Employee shell navigation ----
    $$('#empApp .nav-item').forEach((btn) => {
      btn.addEventListener('click', () => empGoto(btn.dataset.empSection));
    });
    $$('#empBottomNav [data-emp-section]').forEach((btn) => {
      btn.addEventListener('click', () => empGoto(btn.dataset.empSection));
    });

    const empNavSignout = $('#empNavSignout');
    if (empNavSignout) {
      empNavSignout.addEventListener('click', (e) => {
        e.stopPropagation();
        logout();
      });
      empNavSignout.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          logout();
        }
      });
    }

    const empSidebar = $('#empSidebar');
    const empBackdrop = $('#empSidebarBackdrop');
    $('#empMenuToggle').addEventListener('click', () => {
      const open = empSidebar.classList.toggle('open');
      empBackdrop.classList.toggle('show', open);
    });
    $('#empBottomMenuBtn').addEventListener('click', () => {
      const open = empSidebar.classList.toggle('open');
      empBackdrop.classList.toggle('show', open);
    });
    empBackdrop.addEventListener('click', closeEmpSidebar);

    // Employee dashboard quick actions
    $('#empQaCheckin').addEventListener('click', () => {
      const emp = currentEmployee();
      if (emp) empCheckIn(emp.id);
    });
    $('#empQaLeave').addEventListener('click', () => {
      const emp = currentEmployee();
      if (emp) openLeaveForm(null, { employeeId: emp.id });
    });
    $('#empQaNotifications').addEventListener('click', () => openEmpNotifications());
    $('#empLeaveRequestBtn').addEventListener('click', () => {
      const emp = currentEmployee();
      if (emp) openLeaveForm(null, { employeeId: emp.id });
    });

    const empAptSearchWrap = $('#empAptSearchWrap');
    const empAptSearchInput = $('#empAptSearch');
    const empAptFilterDropdown = $('#empAptFilterDropdown');
    const setEmpAptFilterOpen = (open) => {
      empAptFilterDropdown.hidden = !open;
      empAptSearchInput.setAttribute('aria-expanded', String(open));
    };

    empAptSearchInput.addEventListener('input', (e) => {
      empAptSearch = e.target.value;
      const emp = currentEmployee();
      if (emp) renderEmpAppointments(emp);
    });
    empAptSearchInput.addEventListener('focus', () => setEmpAptFilterOpen(true));
    empAptSearchInput.addEventListener('click', () => setEmpAptFilterOpen(true));
    document.addEventListener('click', (e) => {
      if (!empAptSearchWrap.contains(e.target)) setEmpAptFilterOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !empAptFilterDropdown.hidden) {
        setEmpAptFilterOpen(false);
        document.activeElement?.blur?.();
      }
    });

    $$('#empAptFilters .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        empAptFilter = chip.dataset.paf;
        setEmpAptFilterOpen(false);
        const emp = currentEmployee();
        if (emp) renderEmpAppointments(emp);
      });
    });
    const clearEmpAptFiltersBtn = $('#clearEmpAptFilters');
    if (clearEmpAptFiltersBtn) clearEmpAptFiltersBtn.addEventListener('click', () => {
      empAptSearch = '';
      empAptFilter = 'today';
      const input = $('#empAptSearch');
      if (input) input.value = '';
      $$('#empAptFilters .chip').forEach((c) => c.classList.toggle('active', c.dataset.paf === 'today'));
      const emp = currentEmployee();
      if (emp) renderEmpAppointments(emp);
    });

    // ---- Boot: route by role ----
    route();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
