import {
  auth, registerAccount, login, logout, watchAuthState, getUserProfile,
  createCharacter, updateCharacter, deleteCharacter, getCharacter, listAllCharacters,
  listAllUsers, setUserRole,
  listNavPages, createNavPage, updateNavPage, deleteNavPage,
  listAnuncios, createAnuncio, deleteAnuncio,
  getTheme, setTheme
} from "./db.js";

const SECTIONS = [
  {
    key: "general", title: "General",
    fields: [
      { key: "edad", label: "Edad", type: "text" },
      { key: "genero", label: "Género", type: "text" },
      { key: "aldea", label: "Aldea de origen", type: "text" },
      { key: "clan", label: "Clan", type: "text", optional: true, hint: "N/A si no aplica" },
      { key: "rango", label: "Rango ninja", type: "text" }
    ]
  },
  {
    key: "apariencia", title: "Apariencia",
    fields: [{ key: "descripcionFisica", label: "Descripción física", type: "textarea" }]
  },
  {
    key: "personalidad", title: "Personalidad",
    fields: [
      { key: "personalidad", label: "Personalidad", type: "textarea" },
      { key: "gustos", label: "Gustos", type: "textarea" },
      { key: "disgustos", label: "Disgustos", type: "textarea" },
      { key: "objetivos", label: "Objetivos / Motivaciones", type: "textarea" }
    ]
  },
  {
    key: "habilidades", title: "Habilidades",
    fields: [
      { key: "naturalezaChakra", label: "Naturaleza de chakra", type: "text" },
      { key: "jutsus", label: "Jutsus", type: "textarea", hint: "Uno por línea con una breve descripción. Las invocaciones también van aquí." }
    ]
  },
  {
    key: "herramientas", title: "Herramientas ninja",
    fields: [{ key: "equipo", label: "Equipo que porta", type: "textarea" }]
  },
  {
    key: "lore", title: "Lore",
    fields: [{ key: "historia", label: "Historia del personaje", type: "textarea", big: true }]
  }
];

const state = {
  user: null,
  profile: null,
  view: "auth",
  charId: null,
  pageKey: null,
  authMode: "login",
  authError: "",
  sidebarOpen: window.innerWidth > 768,
  expandedGroups: {},
  navPages: [],
  anuncios: [],
  theme: {}
};

const mainEl = document.getElementById("app-main");
const topbarEl = document.getElementById("topbar-who");
const sidebarEl = document.getElementById("sidebar");
const backdropEl = document.getElementById("sidebar-backdrop");
const sidebarToggleBtn = document.getElementById("btn-sidebar-toggle");

const BLOCK_TYPES = {
  heading: "Título",
  paragraph: "Párrafo",
  list: "Lista",
  image: "Imagen",
  button: "Botón"
};

function newBlock(type) {
  const id = "b" + Date.now() + Math.random().toString(36).slice(2, 7);
  if (type === "image") return { id, type, url: "", alt: "" };
  if (type === "button") return { id, type, text: "", url: "" };
  return { id, type, text: "" };
}

function blocksToHtml(blocks) {
  if (!blocks || !blocks.length) return `<p><em>Contenido en preparación.</em></p>`;
  return blocks.map(b => {
    if (b.type === "heading") return `<h2>${escapeHtml(b.text)}</h2>`;
    if (b.type === "paragraph") return nl2p(b.text);
    if (b.type === "list") return `<ul>${(b.text || "").split("\n").filter(l => l.trim()).map(li => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`;
    if (b.type === "image") return `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt || "")}">`;
    if (b.type === "button") return `<a class="btn link-btn" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.text)}</a>`;
    return "";
  }).join("");
}

let editorBlocks = [];

function isOwner() { return state.profile?.role === "owner"; }
function isStaff() { return state.profile?.role === "owner" || state.profile?.role === "gm"; }

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function nl2p(text) {
  if (!text) return "";
  return escapeHtml(text).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function estadoBadge(estado) {
  const map = {
    pendiente: ["Pendiente", "badge-pendiente"],
    aprobada: ["Aprobada", "badge-aprobada"],
    rechazada: ["Rechazada", "badge-rechazada"]
  };
  const [label, cls] = map[estado] || map.pendiente;
  return `<span class="badge-estado ${cls}">${label}</span>`;
}

function goto(view, params = {}) {
  state.view = view;
  state.charId = params.charId ?? null;
  state.pageKey = params.pageKey ?? null;
  state.authMode = params.authMode ?? state.authMode;
  state.authError = "";
  if (window.innerWidth <= 768) state.sidebarOpen = false;
  render();
}

function applyTheme() {
  if (state.theme.orange) document.documentElement.style.setProperty("--orange", state.theme.orange);
  if (state.theme.red) document.documentElement.style.setProperty("--red", state.theme.red);
  if (state.theme.bg) document.documentElement.style.setProperty("--bg", state.theme.bg);
}

async function loadAppData() {
  const [navPages, theme] = await Promise.all([listNavPages(), getTheme()]);
  state.navPages = navPages;
  state.theme = theme || {};
  applyTheme();
  if (isOwner() && navPages.filter(p => p.type !== "fixed").length === 0) {
    await seedDefaultNav();
  }
  if (isOwner()) state.navPages = await listNavPages();
}

async function seedDefaultNav() {
  const mk = async (title, type, order, parentKey = null) => {
    return await createNavPage({
      title, type, order, parentKey,
      blocks: type === "content" ? [] : null
    });
  };
  let o = 0;
  await mk("Reglas", "content", o++);
  await mk("Lore", "content", o++);
  const aldeasId = await mk("Aldeas", "group", o++);
  await mk("Subapartado 1", "content", 0, aldeasId);
  await mk("Subapartado 2", "content", 1, aldeasId);
  await mk("Subapartado 3", "content", 2, aldeasId);
  const clanesId = await mk("Clanes", "group", o++);
  await mk("Subapartado 1", "content", 0, clanesId);
  await mk("Subapartado 2", "content", 1, clanesId);
  await mk("Subapartado 3", "content", 2, clanesId);
  const jutsusId = await mk("Jutsus", "group", o++);
  for (let i = 1; i <= 5; i++) await mk(`Subapartado ${i}`, "content", i - 1, jutsusId);
  const chakraId = await mk("Chakra", "group", o++);
  await mk("Subapartado 1", "content", 0, chakraId);
  await mk("Subapartado 2", "content", 1, chakraId);
  await mk("Subapartado 3", "content", 2, chakraId);
  const herrId = await mk("Herramientas ninja", "group", o++);
  await mk("Subapartado 1", "content", 0, herrId);
  await mk("Subapartado 2", "content", 1, herrId);
  await mk("Subapartado 3", "content", 2, herrId);
  await mk("Economía", "content", o++);
}

function renderTopbar() {
  sidebarToggleBtn.classList.toggle("hidden", !state.user);
  if (!state.user || !state.profile) {
    topbarEl.innerHTML = "";
    return;
  }
  const roleBadge = state.profile.role === "owner" ? '<span class="badge-gm">DUEÑO</span>'
    : state.profile.role === "gm" ? '<span class="badge-gm">GM</span>' : "";
  topbarEl.innerHTML = `
    <span>${escapeHtml(state.profile.username)}</span>
    ${roleBadge}
    <button id="btn-logout" class="secondary">Cerrar sesión</button>
  `;
  document.getElementById("btn-logout").onclick = async () => { await logout(); };
}

function renderSidebarToggle() {
  sidebarToggleBtn.onclick = () => {
    state.sidebarOpen = !state.sidebarOpen;
    renderSidebar();
  };
}

function topLevelPages() {
  return state.navPages.filter(p => !p.parentKey && p.type !== "fixed").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
function childrenOf(id) {
  return state.navPages.filter(p => p.parentKey === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
function findPageById(id) {
  return state.navPages.find(p => p.id === id) || null;
}
function findGroupForPage(pageId) {
  const page = findPageById(pageId);
  return page && page.parentKey ? findPageById(page.parentKey) : null;
}

function renderSidebar() {
  if (!state.user || !state.profile) {
    sidebarEl.innerHTML = "";
    sidebarEl.classList.add("closed");
    backdropEl.classList.remove("open");
    return;
  }

  sidebarEl.classList.toggle("closed", !state.sidebarOpen);
  backdropEl.classList.toggle("open", state.sidebarOpen);

  if (state.view === "page") {
    const group = findGroupForPage(state.pageKey);
    if (group) state.expandedGroups[group.id] = true;
  }

  const fixedTop = `
    <button class="sidebar-item ${state.view === "inicio" ? "active" : ""}" data-fixed="inicio">Inicio</button>
    <button class="sidebar-item ${["dashboard", "view", "edit"].includes(state.view) ? "active" : ""}" data-fixed="fichas">Fichas</button>
  `;

  const dynamicHtml = topLevelPages().map(item => {
    if (item.type === "group") {
      const expanded = !!state.expandedGroups[item.id];
      const kids = childrenOf(item.id).map(child => {
        const isActive = state.view === "page" && state.pageKey === child.id;
        return `<button class="sidebar-item ${isActive ? "active" : ""}" data-nav="${child.id}">${escapeHtml(child.title)}</button>`;
      }).join("");
      return `
        <button class="sidebar-group-toggle ${expanded ? "expanded" : ""}" data-group="${item.id}">
          ${escapeHtml(item.title)} <span class="chevron">›</span>
        </button>
        <div class="sidebar-children ${expanded ? "" : "hidden"}">${kids}</div>
      `;
    }
    const isActive = state.view === "page" && state.pageKey === item.id;
    return `<button class="sidebar-item ${isActive ? "active" : ""}" data-nav="${item.id}">${escapeHtml(item.title)}</button>`;
  }).join("");

  const adminHtml = isOwner() ? `
    <div class="divider"><span class="mark">◆</span></div>
    <button class="sidebar-item ${state.view === "admin-nav" ? "active" : ""}" data-fixed="admin-nav">Apartados</button>
    <button class="sidebar-item ${state.view === "admin-users" ? "active" : ""}" data-fixed="admin-users">Usuarios</button>
    <button class="sidebar-item ${state.view === "admin-theme" ? "active" : ""}" data-fixed="admin-theme">Apariencia</button>
  ` : "";

  sidebarEl.innerHTML = fixedTop + dynamicHtml + adminHtml;

  sidebarEl.querySelectorAll("[data-fixed]").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.fixed;
      if (key === "fichas") goto("dashboard");
      else if (key === "inicio") goto("inicio");
      else goto(key);
    };
  });
  sidebarEl.querySelectorAll("[data-nav]").forEach(btn => {
    btn.onclick = () => goto("page", { pageKey: btn.dataset.nav });
  });
  sidebarEl.querySelectorAll("[data-group]").forEach(btn => {
    btn.onclick = () => {
      state.expandedGroups[btn.dataset.group] = !state.expandedGroups[btn.dataset.group];
      renderSidebar();
    };
  });
  backdropEl.onclick = () => { state.sidebarOpen = false; renderSidebar(); };
}

function renderPage() {
  const item = findPageById(state.pageKey);
  if (!item) { mainEl.innerHTML = `<p class="empty-note">Esta página no existe.</p>`; return; }
  mainEl.innerHTML = `
    <div class="page content-page">
      <div class="section-title"><h1>${escapeHtml(item.title)}</h1>${isOwner() ? '<button id="btn-edit-page" class="secondary">Editar</button>' : ""}</div>
      ${blocksToHtml(item.blocks)}
    </div>
  `;
  if (isOwner()) {
    document.getElementById("btn-edit-page").onclick = () => goto("page-edit", { pageKey: item.id });
  }
}

function renderPageEdit() {
  const item = findPageById(state.pageKey);
  if (!item) { mainEl.innerHTML = `<p class="empty-note">Esta página no existe.</p>`; return; }
  editorBlocks = (item.blocks || []).map(b => ({ ...b }));

  mainEl.innerHTML = `
    <div class="page">
      <h2>Editar: ${escapeHtml(item.title)}</h2>
      <form id="page-edit-form">
        <div class="field"><label for="pe-title">Título</label>
          <input type="text" id="pe-title" value="${escapeHtml(item.title)}" required></div>
        <div id="pe-blocks"></div>
        <div class="block-add-row">
          <span>Añadir:</span>
          ${Object.entries(BLOCK_TYPES).map(([type, label]) => `<button type="button" class="secondary" data-add="${type}">+ ${label}</button>`).join("")}
        </div>
        <div class="btn-row">
          <button type="submit">Guardar</button>
          <button type="button" id="pe-cancel" class="secondary">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  renderBlockEditorList();

  mainEl.querySelectorAll("[data-add]").forEach(btn => {
    btn.onclick = () => {
      editorBlocks.push(newBlock(btn.dataset.add));
      renderBlockEditorList();
    };
  });

  document.getElementById("pe-cancel").onclick = () => goto("page", { pageKey: item.id });

  document.getElementById("page-edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const title = document.getElementById("pe-title").value.trim();
    await updateNavPage(item.id, { title, blocks: editorBlocks });
    state.navPages = await listNavPages();
    toast("Página guardada.");
    goto("page", { pageKey: item.id });
  };
}

function renderBlockEditorList() {
  const container = document.getElementById("pe-blocks");
  if (!editorBlocks.length) {
    container.innerHTML = `<p class="empty-note">Sin bloques todavía. Añade uno abajo.</p>`;
  } else {
    container.innerHTML = editorBlocks.map((b, i) => blockEditorRow(b, i)).join("");
  }

  container.querySelectorAll("[data-field]").forEach(inputEl => {
    inputEl.oninput = () => {
      const i = Number(inputEl.dataset.i);
      editorBlocks[i][inputEl.dataset.field] = inputEl.value;
    };
  });
  container.querySelectorAll("[data-del-block]").forEach(btn => {
    btn.onclick = () => { editorBlocks.splice(Number(btn.dataset.delBlock), 1); renderBlockEditorList(); };
  });
  container.querySelectorAll("[data-up-block]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.upBlock);
      if (i === 0) return;
      [editorBlocks[i - 1], editorBlocks[i]] = [editorBlocks[i], editorBlocks[i - 1]];
      renderBlockEditorList();
    };
  });
  container.querySelectorAll("[data-down-block]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.downBlock);
      if (i === editorBlocks.length - 1) return;
      [editorBlocks[i + 1], editorBlocks[i]] = [editorBlocks[i], editorBlocks[i + 1]];
      renderBlockEditorList();
    };
  });
}

function blockEditorRow(b, i) {
  let fields = "";
  if (b.type === "heading") {
    fields = `<input type="text" data-field="text" data-i="${i}" value="${escapeHtml(b.text)}" placeholder="Texto del título">`;
  } else if (b.type === "paragraph") {
    fields = `<textarea data-field="text" data-i="${i}" rows="4" placeholder="Texto del párrafo">${escapeHtml(b.text)}</textarea>`;
  } else if (b.type === "list") {
    fields = `<textarea data-field="text" data-i="${i}" rows="4" placeholder="Un elemento por línea">${escapeHtml(b.text)}</textarea>`;
  } else if (b.type === "image") {
    fields = `
      <input type="url" data-field="url" data-i="${i}" value="${escapeHtml(b.url)}" placeholder="URL de la imagen" style="margin-bottom:.5em;">
      <input type="text" data-field="alt" data-i="${i}" value="${escapeHtml(b.alt)}" placeholder="Descripción breve (opcional)">
    `;
  } else if (b.type === "button") {
    fields = `
      <input type="text" data-field="text" data-i="${i}" value="${escapeHtml(b.text)}" placeholder="Texto del botón" style="margin-bottom:.5em;">
      <input type="url" data-field="url" data-i="${i}" value="${escapeHtml(b.url)}" placeholder="URL de destino">
    `;
  }
  return `
    <div class="block-editor-row">
      <div class="block-editor-head">
        <span class="block-editor-type">${BLOCK_TYPES[b.type] || b.type}</span>
        <span class="admin-row-actions">
          <button type="button" class="secondary" data-up-block="${i}">↑</button>
          <button type="button" class="secondary" data-down-block="${i}">↓</button>
          <button type="button" class="danger" data-del-block="${i}">Eliminar</button>
        </span>
      </div>
      ${fields}
    </div>
  `;
}

async function renderAdminNav() {
  mainEl.innerHTML = `<p class="empty-note">Cargando...</p>`;
  state.navPages = await listNavPages();

  const rowsFor = (items, indent) => items.map(item => `
    <div class="admin-row" style="padding-left:${indent}rem">
      <span>${item.type === "group" ? "▸ " : ""}${escapeHtml(item.title)}</span>
      <span class="admin-row-actions">
        <button class="secondary" data-up="${item.id}">↑</button>
        <button class="secondary" data-down="${item.id}">↓</button>
        <button class="secondary" data-rename="${item.id}">Renombrar</button>
        ${item.type === "group" ? `<button class="secondary" data-addchild="${item.id}">+ Subapartado</button>` : ""}
        <button class="danger" data-delete="${item.id}">Eliminar</button>
      </span>
    </div>
  `).join("");

  let html = "";
  topLevelPages().forEach(item => {
    html += rowsFor([item], 0);
    if (item.type === "group") html += rowsFor(childrenOf(item.id), 1.4);
  });

  mainEl.innerHTML = `
    <div class="page">
      <div class="section-title"><h2>Gestión de apartados</h2></div>
      <div class="btn-row">
        <button id="btn-add-page">+ Página</button>
        <button id="btn-add-group">+ Grupo</button>
      </div>
      <div class="divider"><span class="mark">◆</span></div>
      <div class="admin-list">${html || '<p class="empty-note">No hay apartados todavía.</p>'}</div>
    </div>
  `;

  document.getElementById("btn-add-page").onclick = async () => {
    const title = prompt("Título de la nueva página:");
    if (!title) return;
    const maxOrder = Math.max(0, ...topLevelPages().map(p => p.order ?? 0));
    await createNavPage({ title, type: "content", order: maxOrder + 1, parentKey: null, blocks: [] });
    renderAdminNav();
  };
  document.getElementById("btn-add-group").onclick = async () => {
    const title = prompt("Título del nuevo grupo:");
    if (!title) return;
    const maxOrder = Math.max(0, ...topLevelPages().map(p => p.order ?? 0));
    await createNavPage({ title, type: "group", order: maxOrder + 1, parentKey: null, blocks: null });
    renderAdminNav();
  };

  mainEl.querySelectorAll("[data-rename]").forEach(btn => {
    btn.onclick = async () => {
      const item = findPageById(btn.dataset.rename);
      const title = prompt("Nuevo título:", item.title);
      if (!title) return;
      await updateNavPage(item.id, { title });
      renderAdminNav();
    };
  });
  mainEl.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = async () => {
      const item = findPageById(btn.dataset.delete);
      const hasKids = item.type === "group" && childrenOf(item.id).length > 0;
      if (!confirm(hasKids ? "Este grupo tiene subapartados dentro, que también se borrarán. ¿Seguro?" : "¿Eliminar este apartado?")) return;
      if (hasKids) {
        for (const child of childrenOf(item.id)) await deleteNavPage(child.id);
      }
      await deleteNavPage(item.id);
      renderAdminNav();
    };
  });
  mainEl.querySelectorAll("[data-addchild]").forEach(btn => {
    btn.onclick = async () => {
      const title = prompt("Título del nuevo subapartado:");
      if (!title) return;
      const parentId = btn.dataset.addchild;
      const maxOrder = Math.max(0, ...childrenOf(parentId).map(p => p.order ?? 0));
      await createNavPage({ title, type: "content", order: maxOrder + 1, parentKey: parentId, blocks: [] });
      renderAdminNav();
    };
  });
  mainEl.querySelectorAll("[data-up], [data-down]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.up || btn.dataset.down;
      const dir = btn.dataset.up ? -1 : 1;
      const item = findPageById(id);
      const siblings = (item.parentKey ? childrenOf(item.parentKey) : topLevelPages());
      const idx = siblings.findIndex(s => s.id === id);
      const swapWith = siblings[idx + dir];
      if (!swapWith) return;
      await updateNavPage(item.id, { order: swapWith.order ?? 0 });
      await updateNavPage(swapWith.id, { order: item.order ?? 0 });
      renderAdminNav();
    };
  });
}

async function renderAdminUsers() {
  mainEl.innerHTML = `<p class="empty-note">Cargando...</p>`;
  const users = await listAllUsers();
  mainEl.innerHTML = `
    <div class="page">
      <h2>Gestión de usuarios</h2>
      <div class="admin-list">
        ${users.map(u => `
          <div class="admin-row">
            <span>${escapeHtml(u.username)} ${u.role === "owner" ? '<span class="badge-gm">DUEÑO</span>' : u.role === "gm" ? '<span class="badge-gm">GM</span>' : ""}</span>
            ${u.role !== "owner" ? `
              <span class="admin-row-actions">
                ${u.role === "gm"
                  ? `<button class="secondary" data-demote="${u.uid}">Quitar GM</button>`
                  : `<button class="secondary" data-promote="${u.uid}">Hacer GM</button>`}
              </span>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
  mainEl.querySelectorAll("[data-promote]").forEach(btn => {
    btn.onclick = async () => { await setUserRole(btn.dataset.promote, "gm"); toast("Usuario ascendido a GM."); renderAdminUsers(); };
  });
  mainEl.querySelectorAll("[data-demote]").forEach(btn => {
    btn.onclick = async () => { await setUserRole(btn.dataset.demote, "player"); toast("GM retirado."); renderAdminUsers(); };
  });
}

function renderAdminTheme() {
  const t = state.theme;
  mainEl.innerHTML = `
    <div class="page">
      <h2>Apariencia</h2>
      <form id="theme-form">
        <div class="field"><label for="th-orange">Color principal</label>
          <input type="color" id="th-orange" value="${t.orange || '#f5790b'}"></div>
        <div class="field"><label for="th-red">Color secundario</label>
          <input type="color" id="th-red" value="${t.red || '#9c1f1f'}"></div>
        <div class="field"><label for="th-bg">Fondo</label>
          <input type="color" id="th-bg" value="${t.bg || '#0d0d0d'}"></div>
        <div class="btn-row"><button type="submit">Guardar</button></div>
      </form>
    </div>
  `;
  document.getElementById("theme-form").onsubmit = async (e) => {
    e.preventDefault();
    const theme = {
      orange: document.getElementById("th-orange").value,
      red: document.getElementById("th-red").value,
      bg: document.getElementById("th-bg").value
    };
    await setTheme(theme);
    state.theme = theme;
    applyTheme();
    toast("Apariencia actualizada.");
  };
}

async function renderInicio() {
  mainEl.innerHTML = `<p class="empty-note">Cargando...</p>`;
  state.anuncios = await listAnuncios();
  mainEl.innerHTML = `
    <div class="page">
      <h2>Anuncios</h2>
      ${isStaff() ? `
        <form id="anuncio-form">
          <div class="field"><label for="an-texto">Nuevo anuncio</label>
            <textarea id="an-texto" rows="3" required></textarea></div>
          <div class="field"><label for="an-imagen">Imagen (URL, opcional)</label>
            <input type="url" id="an-imagen" placeholder="https://..."></div>
          <button type="submit">Publicar</button>
        </form>
        <div class="divider"><span class="mark">◆</span></div>
      ` : ""}
      ${state.anuncios.length ? state.anuncios.map(a => `
        <div class="text-block">
          <div class="text-block-label">${escapeHtml(a.autor || "")}</div>
          ${a.imagen ? `<img src="${escapeHtml(a.imagen)}" style="max-width:100%;border-radius:4px;margin:.5em 0;">` : ""}
          ${nl2p(a.texto)}
          ${isStaff() ? `<button class="secondary" data-del-anuncio="${a.id}">Eliminar</button>` : ""}
        </div>
        <div class="divider"><span class="mark">◆</span></div>
      `).join("") : `<p class="empty-note">Sin anuncios todavía.</p>`}
    </div>
  `;
  if (isStaff()) {
    document.getElementById("anuncio-form").onsubmit = async (e) => {
      e.preventDefault();
      const texto = document.getElementById("an-texto").value.trim();
      const imagen = document.getElementById("an-imagen").value.trim();
      await createAnuncio({ texto, imagen, autor: state.profile.username });
      toast("Anuncio publicado.");
      renderInicio();
    };
    mainEl.querySelectorAll("[data-del-anuncio]").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("¿Eliminar este anuncio?")) return;
        await deleteAnuncio(btn.dataset.delAnuncio);
        renderInicio();
      };
    });
  }
}

function renderAuth() {
  const isLogin = state.authMode === "login";
  mainEl.innerHTML = `
    <div class="auth-wrap">
      <div class="page">
        <h1 style="font-size:1.6rem; color: var(--orange);">Shinobi Wars</h1>
        <div class="auth-tabs">
          <button class="tab ${isLogin ? "active" : ""}" id="tab-login">Entrar</button>
          <button class="tab ${!isLogin ? "active" : ""}" id="tab-register">Crear cuenta</button>
        </div>
        ${isLogin ? renderLoginForm() : renderRegisterForm()}
        ${state.authError ? `<div class="error-msg">${escapeHtml(state.authError)}</div>` : ""}
      </div>
    </div>
  `;
  document.getElementById("tab-login").onclick = () => goto("auth", { authMode: "login" });
  document.getElementById("tab-register").onclick = () => goto("auth", { authMode: "register" });

  if (isLogin) {
    document.getElementById("form-login").onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById("login-user").value.trim();
      const pass = document.getElementById("login-pass").value;
      try { await login(username, pass); }
      catch (err) { state.authError = "Usuario o contraseña incorrectos."; render(); }
    };
  } else {
    document.getElementById("form-register").onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById("reg-user").value.trim();
      const pass = document.getElementById("reg-pass").value;
      const pass2 = document.getElementById("reg-pass2").value;
      if (username.length < 2) { state.authError = "Pon un nombre de usuario."; render(); return; }
      if (pass.length < 6) { state.authError = "La contraseña debe tener al menos 6 caracteres."; render(); return; }
      if (pass !== pass2) { state.authError = "Las contraseñas no coinciden."; render(); return; }
      try { await registerAccount(username, pass); }
      catch (err) {
        state.authError = err.message === "username-taken" ? "Ese nombre de usuario ya está en uso." : "No se pudo crear la cuenta. Inténtalo de nuevo.";
        render();
      }
    };
  }
}

function renderLoginForm() {
  return `
    <form id="form-login">
      <div class="field"><label for="login-user">Usuario</label>
        <input type="text" id="login-user" required autocomplete="username"></div>
      <div class="field"><label for="login-pass">Contraseña</label>
        <input type="password" id="login-pass" required autocomplete="current-password"></div>
      <button type="submit">Entrar</button>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form id="form-register">
      <div class="field"><label for="reg-user">Nombre de usuario</label>
        <input type="text" id="reg-user" required autocomplete="username"></div>
      <div class="field"><label for="reg-pass">Contraseña (mín. 6 caracteres)</label>
        <input type="password" id="reg-pass" required minlength="6" autocomplete="new-password"></div>
      <div class="field"><label for="reg-pass2">Repite la contraseña</label>
        <input type="password" id="reg-pass2" required minlength="6" autocomplete="new-password"></div>
      <button type="submit">Crear cuenta</button>
    </form>
  `;
}

async function renderDashboard() {
  mainEl.innerHTML = `<p class="empty-note">Cargando fichas...</p>`;
  const all = await listAllCharacters();
  const staff = isStaff();
  const mine = all.filter(c => c.ownerId === state.user.uid);
  const others = all.filter(c => c.ownerId !== state.user.uid);
  const approvedOthers = others.filter(c => c.estado === "aprobada");
  const pending = staff ? all.filter(c => c.estado === "pendiente") : [];

  mainEl.innerHTML = `
    <div class="page">
    ${staff ? `
      <div class="section-title"><h2>Solicitudes pendientes</h2></div>
      ${pending.length ? `<div class="card-grid">${pending.map(c => charCard(c, c.ownerId === state.user.uid)).join("")}</div>`
                       : `<p class="empty-note">No hay solicitudes pendientes.</p>`}
      <div class="divider"><span class="mark">◆</span></div>
    ` : ""}
    <div class="section-title">
      <h2>Tus fichas</h2>
      <button id="btn-new">+ Nueva ficha</button>
    </div>
    ${mine.length ? `<div class="card-grid">${mine.map(c => charCard(c, true)).join("")}</div>`
                  : `<p class="empty-note">Aún no tienes ninguna ficha. Crea la primera.</p>`}
    <div class="divider"><span class="mark">◆</span></div>
    <h2>Fichas del grupo</h2>
    ${approvedOthers.length ? `<div class="card-grid">${approvedOthers.map(c => charCard(c, false)).join("")}</div>`
                    : `<p class="empty-note">Ninguna ficha aprobada todavía.</p>`}
    </div>
  `;

  document.getElementById("btn-new").onclick = () => goto("edit", { charId: null });
  mainEl.querySelectorAll("[data-open]").forEach(elm => {
    elm.onclick = (e) => { e.preventDefault(); goto("view", { charId: elm.dataset.open }); };
  });
}

function charCard(c, mine) {
  return `
    <a href="#" class="char-card" data-open="${c.id}">
      <div class="section-title"><h3>${escapeHtml(c.nombre || "Sin nombre")}</h3>${estadoBadge(c.estado)}</div>
      <div class="meta">${escapeHtml(c.ownerUsername || "")}${mine ? " (tú)" : ""} · ${escapeHtml(c.general?.aldea || "")}</div>
      ${c.apodo ? `<div class="quote">“${escapeHtml(c.apodo)}”</div>` : ""}
    </a>
  `;
}

async function renderView() {
  mainEl.innerHTML = `<p class="empty-note">Cargando...</p>`;
  const char = await getCharacter(state.charId);
  if (!char) { mainEl.innerHTML = `<p class="empty-note">Esa ficha ya no existe.</p>`; return; }

  const staff = isStaff();
  const canEdit = char.ownerId === state.user.uid || staff;

  mainEl.innerHTML = `
    <div class="page">
      <div class="owner-strip">
        <span>${escapeHtml(char.ownerUsername || "")} ${estadoBadge(char.estado)}</span>
        <a href="#" id="back-dash">&larr; Volver a fichas</a>
      </div>
      <div class="sheet-header">
        ${char.imagenPortada ? `<img class="portrait" src="${escapeHtml(char.imagenPortada)}" alt="Retrato de ${escapeHtml(char.nombre)}">` : ""}
        <h1>${escapeHtml(char.nombre || "Sin nombre")}</h1>
        ${char.apodo ? `<div class="quote">“${escapeHtml(char.apodo)}”</div>` : ""}
      </div>
      ${SECTIONS.map(section => renderSectionRead(char, section)).join("")}
      <div class="btn-row">
        ${staff ? `<button id="btn-aprobar" class="secondary">Aprobar</button><button id="btn-rechazar" class="secondary">Rechazar</button>` : ""}
        ${canEdit ? `<button id="btn-edit">Editar ficha</button><button id="btn-del" class="danger">Eliminar ficha</button>` : ""}
      </div>
    </div>
  `;

  document.getElementById("back-dash").onclick = (e) => { e.preventDefault(); goto("dashboard"); };
  if (canEdit) {
    document.getElementById("btn-edit").onclick = () => goto("edit", { charId: char.id });
    document.getElementById("btn-del").onclick = async () => {
      if (confirm(`¿Seguro que quieres eliminar la ficha de ${char.nombre}? Esto no se puede deshacer.`)) {
        await deleteCharacter(char.id);
        toast("Ficha eliminada.");
        goto("dashboard");
      }
    };
  }
  if (staff) {
    document.getElementById("btn-aprobar").onclick = async () => {
      await updateCharacter(char.id, { estado: "aprobada" });
      toast("Ficha aprobada.");
      goto("view", { charId: char.id });
    };
    document.getElementById("btn-rechazar").onclick = async () => {
      await updateCharacter(char.id, { estado: "rechazada" });
      toast("Ficha rechazada.");
      goto("view", { charId: char.id });
    };
  }
}

function renderSectionRead(char, section) {
  const data = char[section.key] || {};
  const visibleFields = section.fields.filter(f => data[f.key]);
  if (!visibleFields.length) return "";
  const shortFields = visibleFields.filter(f => f.type !== "textarea");
  const longFields = visibleFields.filter(f => f.type === "textarea");
  return `
    <div class="sheet-section">
      <div class="divider"><span class="mark">◆</span></div>
      <h2>${section.title}</h2>
      ${shortFields.length ? `<dl class="kv">${shortFields.map(f => `<dt>${f.label}</dt><dd>${escapeHtml(data[f.key])}</dd>`).join("")}</dl>` : ""}
      ${longFields.map(f => `<div class="text-block"><div class="text-block-label">${f.label}</div>${nl2p(data[f.key])}</div>`).join("")}
    </div>
  `;
}

async function renderEdit() {
  let char = null;
  if (state.charId) {
    mainEl.innerHTML = `<p class="empty-note">Cargando...</p>`;
    char = await getCharacter(state.charId);
    if (!char) { mainEl.innerHTML = `<p class="empty-note">Esa ficha ya no existe.</p>`; return; }
    const canEdit = char.ownerId === state.user.uid || isStaff();
    if (!canEdit) { mainEl.innerHTML = `<p class="empty-note">No tienes permiso para editar esta ficha.</p>`; return; }
  }

  mainEl.innerHTML = `
    <div class="page">
      <h2>${char ? "Editar ficha" : "Nueva ficha"}</h2>
      <form id="char-form">
        <fieldset>
          <legend>Portada</legend>
          <div class="field"><label for="f-nombre">Nombre del PJ</label>
            <input type="text" id="f-nombre" required value="${escapeHtml(char?.nombre)}"></div>
          <div class="field"><label for="f-apodo">Apodo / Alias</label>
            <input type="text" id="f-apodo" value="${escapeHtml(char?.apodo)}"></div>
          <div class="field"><label for="f-portada">Imagen del PJ (URL)</label>
            <input type="url" id="f-portada" value="${escapeHtml(char?.imagenPortada)}" placeholder="https://...">
            <span class="hint">Pega el link a una imagen ya subida (Discord, Imgur, Drive público...)</span></div>
        </fieldset>
        ${SECTIONS.map(s => renderSectionForm(char, s)).join("")}
        <div class="btn-row">
          <button type="submit">${char ? "Guardar cambios" : "Crear ficha"}</button>
          <button type="button" id="btn-cancel" class="secondary">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById("btn-cancel").onclick = () => goto(char ? "view" : "dashboard", { charId: char?.id });
  document.getElementById("char-form").onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById("f-nombre").value.trim(),
      apodo: document.getElementById("f-apodo").value.trim(),
      imagenPortada: document.getElementById("f-portada").value.trim()
    };
    SECTIONS.forEach(section => {
      payload[section.key] = {};
      section.fields.forEach(f => {
        payload[section.key][f.key] = document.getElementById(`f-${section.key}-${f.key}`).value.trim();
      });
    });
    try {
      if (char) {
        if (!isStaff()) payload.estado = "pendiente";
        await updateCharacter(char.id, payload);
        toast("Cambios guardados.");
        goto("view", { charId: char.id });
      } else {
        payload.estado = "pendiente";
        const newId = await createCharacter(state.user.uid, state.profile.username, payload);
        toast("Ficha creada, pendiente de aprobación.");
        goto("view", { charId: newId });
      }
    } catch (err) {
      alert("Algo falló guardando la ficha. Revisa la consola (F12) y prueba otra vez.");
      console.error(err);
    }
  };
}

function renderSectionForm(char, section) {
  const data = (char && char[section.key]) || {};
  return `
    <fieldset>
      <legend>${section.title}</legend>
      ${section.fields.map(f => `
        <div class="field">
          <label for="f-${section.key}-${f.key}">${f.label}${f.optional ? " (opcional)" : ""}</label>
          ${f.type === "textarea"
            ? `<textarea id="f-${section.key}-${f.key}" rows="${f.big ? 8 : 3}">${escapeHtml(data[f.key])}</textarea>`
            : `<input type="text" id="f-${section.key}-${f.key}" value="${escapeHtml(data[f.key])}">`}
          ${f.hint ? `<span class="hint">${f.hint}</span>` : ""}
        </div>
      `).join("")}
    </fieldset>
  `;
}

async function render() {
  renderTopbar();
  renderSidebarToggle();
  renderSidebar();
  if (!state.user) { renderAuth(); return; }
  if (state.view === "dashboard" || state.view === "auth") { await renderDashboard(); return; }
  if (state.view === "view") { await renderView(); return; }
  if (state.view === "edit") { await renderEdit(); return; }
  if (state.view === "page") { renderPage(); return; }
  if (state.view === "page-edit") { renderPageEdit(); return; }
  if (state.view === "inicio") { await renderInicio(); return; }
  if (state.view === "admin-nav") { await renderAdminNav(); return; }
  if (state.view === "admin-users") { await renderAdminUsers(); return; }
  if (state.view === "admin-theme") { renderAdminTheme(); return; }
}

watchAuthState(async (user) => {
  state.user = user;
  if (user) {
    state.profile = await getUserProfile(user.uid);
    await loadAppData();
    state.view = "inicio";
  } else {
    state.profile = null;
    state.view = "auth";
  }
  render();
});
