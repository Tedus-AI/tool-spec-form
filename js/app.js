// ===================================================================
// Tool Spec Form — Main Application Logic
// ===================================================================

// ===== Firebase Config =====
const firebaseConfig = {
  apiKey: "AIzaSyAh_Abq-q9gJz40KN0bBJ6hfOLQ0y36Ugs",
  authDomain: "tool-spec-form.firebaseapp.com",
  projectId: "tool-spec-form",
  storageBucket: "tool-spec-form.firebasestorage.app",
  messagingSenderId: "918692000904",
  appId: "1:918692000904:web:d31b8730e3cbbeb7e95b3d"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const COLLECTION = 'projects';

// ===== Phase Definitions =====
const PHASES = [
  { id: 0, name: '需求定義', color: '#E8725A' },
  { id: 1, name: '規格設計', color: '#D4852F' },
  { id: 2, name: '技術架構', color: '#2D9B6E' },
  { id: 3, name: 'Skill 選擇', color: '#8E44AD' },
  { id: 4, name: '測試計畫', color: '#2E86C1' },
  { id: 5, name: '部署計畫', color: '#27AE60' },
  { id: 6, name: '預覽推送', color: '#E74C3C' },
];
const TOTAL_PHASES = PHASES.length;

// ===== Global State =====
let currentPhase = 0;
let currentProjectId = null;
let pendingDeleteId = null;
let saveTimer = null;
let isLoading = false;
let selectedSkills = [];
let parsedSkillFiles = [];
let allSkillsFromRepo = [];
let skillOnlyMode = false;
let referenceFiles = []; // Parsed reference files for AI context

// ===================================================================
// SIDEBAR & NAVIGATION
// ===================================================================

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// Sidebar drag-to-resize
(function initSidebarResize() {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main-content');
  if (!handle || !sidebar) return;

  // Restore saved width
  const saved = localStorage.getItem('sidebarWidth');
  if (saved) {
    const w = parseInt(saved, 10);
    if (w >= 200 && w <= 600) {
      sidebar.style.width = w + 'px';
      handle.style.left = w + 'px';
      if (main) main.style.marginLeft = w + 'px';
    }
  }

  let isDragging = false;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    handle.classList.add('dragging');
    sidebar.style.transition = 'none';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let w = Math.max(200, Math.min(600, e.clientX));
    sidebar.style.width = w + 'px';
    handle.style.left = w + 'px';
    if (main) main.style.marginLeft = w + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    handle.classList.remove('dragging');
    sidebar.style.transition = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('sidebarWidth', parseInt(sidebar.style.width, 10));
  });
})();

// ===================================================================
// MODAL HELPERS
// ===================================================================

function showModal(id) {
  document.getElementById(id).classList.add('active');
  const firstInput = document.querySelector(`#${id} input[type="text"]`);
  if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function hideModal(id) {
  document.getElementById(id).classList.remove('active');
}

function showNewProjectModal() {
  document.getElementById('new-project-name').value = '';
  showModal('new-project-modal');
}

// ===================================================================
// PROGRESS BAR
// ===================================================================

function updateProgress() {
  // Desktop/Tablet progress
  const container = document.getElementById('progress-steps');
  const visiblePhases = skillOnlyMode ? [3, 6] : [...Array(TOTAL_PHASES).keys()];
  let html = '';
  visiblePhases.forEach((i, idx) => {
    const phase = PHASES[i];
    let dotClass = 'progress-step-dot';
    let labelClass = '';
    if (skillOnlyMode) {
      if (i === currentPhase) { dotClass += ' active'; labelClass = 'active'; }
      else if (i < currentPhase) { dotClass += ' done clickable'; labelClass = 'done'; }
      dotClass += ' clickable';
    } else {
      if (i < currentPhase) { dotClass += ' done clickable'; labelClass = 'done'; }
      else if (i === currentPhase) { dotClass += ' active'; labelClass = 'active'; }
    }

    html += `<div class="progress-step-item ${labelClass}">`;
    html += `<div class="${dotClass}" onclick="goToPhase(${i})" title="${phase.name}">`;
    html += (i < currentPhase && !skillOnlyMode) ? '&#10003;' : (skillOnlyMode ? (idx + 1) : i);
    html += `</div>`;
    html += `<span class="progress-step-label">${phase.name}</span>`;
    if (idx < visiblePhases.length - 1) {
      html += `<div class="progress-step-line ${i < currentPhase ? 'done' : ''}"></div>`;
    }
    html += `</div>`;
  });
  container.innerHTML = html;

  // Mobile progress
  const mobileText = document.getElementById('progress-mobile-text');
  const mobileFill = document.getElementById('progress-mobile-fill');
  if (skillOnlyMode) {
    const stepNum = currentPhase === 3 ? 1 : 2;
    mobileText.textContent = `Step ${stepNum} / 2 — ${PHASES[currentPhase].name}`;
    mobileFill.style.width = `${stepNum * 50}%`;
  } else {
    mobileText.textContent = `Step ${currentPhase + 1} / ${TOTAL_PHASES} — ${PHASES[currentPhase].name}`;
    mobileFill.style.width = `${((currentPhase + 1) / TOTAL_PHASES) * 100}%`;
  }
}

function showPhase(phase) {
  for (let i = 0; i < TOTAL_PHASES; i++) {
    const el = document.getElementById(`phase-${i}`);
    if (el) el.style.display = i === phase ? 'block' : 'none';
  }

  const navBar = document.getElementById('nav-bar');
  navBar.style.display = (currentProjectId || skillOnlyMode) ? 'flex' : 'none';

  document.getElementById('prev-btn').disabled = skillOnlyMode ? (phase === 3) : (phase === 0);
  const nextBtn = document.getElementById('next-btn');
  if (phase === TOTAL_PHASES - 1) {
    nextBtn.textContent = '\u{1F680} 推送到 GitHub';
    nextBtn.style.background = '#E74C3C';
  } else if (skillOnlyMode) {
    nextBtn.innerHTML = '前往推送 &#8594;';
    nextBtn.style.background = '#8E44AD';
  } else {
    nextBtn.innerHTML = '下一步 &#8594;';
    nextBtn.style.background = '#2D9B6E';
  }

  updateProgress();

  if (phase === 6) {
    generatePreview();
    refreshSkillPushList();
    updatePushButtonText();
  }
}

function validatePhase(phase) {
  if (phase === 0) {
    const toolName = getVal('f-toolName');
    const oneLiner = getVal('f-oneLiner');
    if (!toolName || !oneLiner) {
      const missing = [];
      if (!toolName) missing.push('工具名稱');
      if (!oneLiner) missing.push('工具概述');
      alert(`請先填寫必填欄位：${missing.join('、')}`);
      if (!toolName) document.getElementById('f-toolName').focus();
      else document.getElementById('f-oneLiner').focus();
      return false;
    }
  }
  return true;
}

function nextPhase() {
  if (!validatePhase(currentPhase)) return;
  if (currentPhase === TOTAL_PHASES - 1) {
    const pushMode = document.querySelector('input[name="pushMode"]:checked');
    if (pushMode && pushMode.value === 'skill') {
      pushSkillsOnly();
    } else {
      pushToGitHub();
    }
    return;
  }
  if (skillOnlyMode) {
    // Skill-only: Phase 3 → Phase 6
    currentPhase = TOTAL_PHASES - 1;
  } else {
    currentPhase = Math.min(TOTAL_PHASES - 1, currentPhase + 1);
  }
  showPhase(currentPhase);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  saveCurrentPhase();
}

function prevPhase() {
  if (skillOnlyMode) {
    // Skill-only: Phase 6 → Phase 3
    currentPhase = 3;
  } else {
    currentPhase = Math.max(0, currentPhase - 1);
  }
  showPhase(currentPhase);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToPhase(phase) {
  if (skillOnlyMode) {
    if (phase === 3 || phase === TOTAL_PHASES - 1) {
      currentPhase = phase;
      showPhase(currentPhase);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  if (phase <= currentPhase || phase < currentPhase) {
    currentPhase = phase;
    showPhase(currentPhase);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function saveCurrentPhase() {
  if (!currentProjectId) return;
  db.collection(COLLECTION).doc(currentProjectId).update({
    currentPhase: currentPhase,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

// ===================================================================
// SAVE STATUS
// ===================================================================

function setSaveStatus(status) {
  const el = document.getElementById('save-status');
  switch (status) {
    case 'saved':
      el.textContent = '\u2705 已儲存';
      el.className = 'save-status saved';
      break;
    case 'saving':
      el.textContent = '儲存中...';
      el.className = 'save-status saving';
      break;
    case 'error':
      el.textContent = '\u274C 儲存失敗';
      el.className = 'save-status error';
      break;
    case 'synced':
      el.textContent = '\u2705 已同步';
      el.className = 'save-status synced';
      break;
    case 'offline':
      el.textContent = '\u26A0\uFE0F 離線中';
      el.className = 'save-status offline';
      break;
    default:
      el.textContent = '未連線';
      el.className = 'save-status offline';
  }
}

// ===================================================================
// FEATURE LIST
// ===================================================================

function addFeature(name, priority, hours) {
  const list = document.getElementById('feature-list');
  const count = list.children.length + 1;
  const div = document.createElement('div');
  div.className = 'feature-item';
  div.innerHTML = `
    <span class="num">${count}</span>
    <input type="text" class="feature-input" placeholder="功能描述..." value="${escapeHtml(name || '')}" data-phase="2" data-key="features">
    <select class="priority-select" data-phase="2" data-key="featurePriority">
      <option value="High" ${priority === 'High' ? 'selected' : ''}>High</option>
      <option value="Mid" ${priority === 'Mid' || !priority ? 'selected' : ''}>Mid</option>
      <option value="Low" ${priority === 'Low' ? 'selected' : ''}>Low</option>
    </select>
    <input type="number" class="hours-input" placeholder="hr" min="0" step="0.5" value="${hours || ''}" data-phase="2" data-key="featureHours">
    <div class="feature-actions">
      <button class="move-btn" onclick="moveFeature(this,-1)" title="上移">&#9650;</button>
      <button class="move-btn" onclick="moveFeature(this,1)" title="下移">&#9660;</button>
      <button class="remove-feature-btn" onclick="removeFeature(this)" title="移除">&times;</button>
    </div>
  `;
  list.appendChild(div);
  attachFeatureListeners(div);
  return div;
}

function removeFeature(btn) {
  const item = btn.closest('.feature-item');
  const list = document.getElementById('feature-list');
  if (list.children.length <= 1) return;
  item.remove();
  renumberFeatures();
  scheduleSave();
}

function moveFeature(btn, direction) {
  const item = btn.closest('.feature-item');
  const list = document.getElementById('feature-list');
  const items = Array.from(list.children);
  const index = items.indexOf(item);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= items.length) return;
  if (direction === -1) {
    list.insertBefore(item, items[newIndex]);
  } else {
    list.insertBefore(item, items[newIndex].nextSibling);
  }
  renumberFeatures();
  scheduleSave();
}

function renumberFeatures() {
  const list = document.getElementById('feature-list');
  Array.from(list.children).forEach((child, i) => {
    child.querySelector('.num').textContent = i + 1;
  });
}

function attachFeatureListeners(div) {
  div.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => scheduleSave());
    el.addEventListener('change', () => scheduleSave());
  });
}

// ===================================================================
// TEST CASE LIST
// ===================================================================

function addTestCase(inputVal, expectedVal, status) {
  const list = document.getElementById('test-case-list');
  const div = document.createElement('div');
  div.className = 'test-case-item';
  div.innerHTML = `
    <input type="text" placeholder="輸入值" value="${escapeHtml(inputVal || '')}" data-phase="4" data-key="testInput">
    <input type="text" placeholder="預期輸出" value="${escapeHtml(expectedVal || '')}" data-phase="4" data-key="testExpected">
    <select data-phase="4" data-key="testStatus">
      <option value="未測試" ${status === '未測試' || !status ? 'selected' : ''}>未測試</option>
      <option value="Pass" ${status === 'Pass' ? 'selected' : ''}>Pass</option>
      <option value="Fail" ${status === 'Fail' ? 'selected' : ''}>Fail</option>
    </select>
    <button class="remove-feature-btn" onclick="removeTestCase(this)" title="移除">&times;</button>
  `;
  list.appendChild(div);
  div.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => scheduleSave());
    el.addEventListener('change', () => scheduleSave());
  });
}

function removeTestCase(btn) {
  const item = btn.closest('.test-case-item');
  const list = document.getElementById('test-case-list');
  if (list.children.length <= 1) return;
  item.remove();
  scheduleSave();
}

// ===================================================================
// COLLECT / RESTORE FORM DATA
// ===================================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function getRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

function collectFormData() {
  // Phase 0
  const phase0 = {
    toolName: getVal('f-toolName'),
    repoName: getVal('f-repoName'),
    oneLiner: getVal('f-oneLiner'),
    users: getVal('f-users'),
    trigger: getVal('f-trigger'),
    inputSpec: getVal('f-inputSpec'),
    outputSpec: getVal('f-outputSpec'),
    successDef: getVal('f-successDef'),
  };

  // Phase 1
  const inputFormatEls = document.querySelectorAll('input[data-key="inputFormat"]:checked');
  const phase1 = {
    inputFormat: Array.from(inputFormatEls).map(el => el.value),
    inputFields: getVal('f-inputFields'),
    outputFormat: Array.from(document.querySelectorAll('input[data-key="outputFormat"]:checked')).map(el => el.value),
    calcLogic: getVal('f-calcLogic'),
    boundary: getVal('f-boundary'),
    limits: getVal('f-limits'),
  };

  // Phase 2
  const features = [];
  document.querySelectorAll('#feature-list .feature-item').forEach(item => {
    const nameEl = item.querySelector('.feature-input');
    const priorityEl = item.querySelector('.priority-select');
    const hoursEl = item.querySelector('.hours-input');
    features.push({
      name: nameEl ? nameEl.value : '',
      priority: priorityEl ? priorityEl.value : 'Mid',
      hours: hoursEl ? hoursEl.value : '',
    });
  });
  const phase2 = {
    frontend: getRadio('frontend'),
    database: getRadio('database'),
    uiNeed: getRadio('uiNeed'),
    features: features,
  };

  // Phase 3 (skills)
  const phase3 = {
    selectedSkills: selectedSkills.slice(),
  };

  // Phase 4
  const testCases = [];
  document.querySelectorAll('#test-case-list .test-case-item').forEach(item => {
    const inputs = item.querySelectorAll('input[type="text"]');
    const sel = item.querySelector('select');
    testCases.push({
      input: inputs[0] ? inputs[0].value : '',
      expected: inputs[1] ? inputs[1].value : '',
      status: sel ? sel.value : '未測試',
    });
  });
  const phase4 = {
    testCases: testCases,
    boundaryTest: getVal('f-boundaryTest'),
    knownLimitations: getVal('f-knownLimitations'),
  };

  // Phase 5
  const phase5 = {
    deployPlatform: Array.from(document.querySelectorAll('input[data-key="deployPlatform"]:checked')).map(el => el.value),
    updateFreq: getRadio('updateFreq'),
    accessLevel: getRadio('accessLevel'),
    notifyMethod: getRadio('notifyMethod'),
  };

  return {
    name: phase0.toolName || '未命名工具',
    phase0, phase1, phase2, phase3, phase4, phase5,
    currentPhase: currentPhase,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
}

function restoreFormData(data) {
  isLoading = true;

  // Phase 0
  if (data.phase0) {
    const p = data.phase0;
    setVal('f-toolName', p.toolName);
    setVal('f-repoName', p.repoName);
    setVal('f-oneLiner', p.oneLiner);
    setVal('f-users', p.users);
    setVal('f-trigger', p.trigger);
    setVal('f-inputSpec', p.inputSpec);
    setVal('f-outputSpec', p.outputSpec);
    setVal('f-successDef', p.successDef);
  }

  // Phase 1
  if (data.phase1) {
    const p = data.phase1;
    // Checkboxes
    document.querySelectorAll('input[data-key="inputFormat"]').forEach(cb => {
      cb.checked = p.inputFormat && p.inputFormat.includes(cb.value);
    });
    setVal('f-inputFields', p.inputFields);
    // outputFormat checkboxes
    document.querySelectorAll('input[data-key="outputFormat"]').forEach(cb => {
      cb.checked = p.outputFormat && p.outputFormat.includes(cb.value);
    });
    setVal('f-calcLogic', p.calcLogic);
    setVal('f-boundary', p.boundary);
    setVal('f-limits', p.limits);
  }

  // Phase 2
  if (data.phase2) {
    const p = data.phase2;
    setRadio('frontend', p.frontend);
    setRadio('database', p.database);
    setRadio('uiNeed', p.uiNeed);
    // Features
    const list = document.getElementById('feature-list');
    list.innerHTML = '';
    if (p.features && p.features.length > 0) {
      p.features.forEach(f => addFeature(f.name, f.priority, f.hours));
    } else {
      addFeature(); addFeature(); addFeature();
    }
  } else {
    const list = document.getElementById('feature-list');
    list.innerHTML = '';
    addFeature(); addFeature(); addFeature();
  }

  // Phase 3 (skills)
  if (data.phase3 && data.phase3.selectedSkills) {
    selectedSkills = data.phase3.selectedSkills.slice();
  } else {
    selectedSkills = [];
  }

  // Phase 4
  const tcList = document.getElementById('test-case-list');
  tcList.innerHTML = '';
  if (data.phase4) {
    const p = data.phase4;
    if (p.testCases && p.testCases.length > 0) {
      p.testCases.forEach(tc => addTestCase(tc.input, tc.expected, tc.status));
    } else {
      addTestCase();
    }
    setVal('f-boundaryTest', p.boundaryTest);
    setVal('f-knownLimitations', p.knownLimitations);
  } else {
    addTestCase();
  }

  // Phase 5
  if (data.phase5) {
    const p = data.phase5;
    // deployPlatform checkboxes
    document.querySelectorAll('input[data-key="deployPlatform"]').forEach(cb => {
      cb.checked = p.deployPlatform && p.deployPlatform.includes(cb.value);
    });
    setRadio('updateFreq', p.updateFreq);
    setRadio('accessLevel', p.accessLevel);
    setRadio('notifyMethod', p.notifyMethod);
  }

  // Current phase
  if (data.currentPhase !== undefined && data.currentPhase !== null) {
    currentPhase = data.currentPhase;
  } else {
    currentPhase = 0;
  }

  isLoading = false;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function setRadio(name, val) {
  if (!val) return;
  const el = document.querySelector(`input[name="${name}"][value="${CSS.escape(val)}"]`);
  if (el) el.checked = true;
}

function clearForm() {
  // Clear all text/textarea inputs
  document.querySelectorAll('input[type="text"][data-phase], textarea[data-phase]').forEach(el => {
    el.value = '';
  });
  document.querySelectorAll('input[type="number"][data-phase]').forEach(el => {
    el.value = '';
  });
  // Clear radios & checkboxes
  document.querySelectorAll('input[type="radio"][data-phase]').forEach(r => r.checked = false);
  document.querySelectorAll('input[type="checkbox"][data-phase]').forEach(cb => cb.checked = false);
  // Reset features
  const list = document.getElementById('feature-list');
  list.innerHTML = '';
  addFeature(); addFeature(); addFeature();
  // Reset test cases
  const tcList = document.getElementById('test-case-list');
  tcList.innerHTML = '';
  addTestCase();
  // Reset skills
  selectedSkills = [];
  // Reset preview
  document.getElementById('preview-content').textContent = '';
  document.getElementById('push-progress').style.display = 'none';
  document.getElementById('push-complete').style.display = 'none';
  document.getElementById('status-msg').className = 'status-msg';
}

// ===================================================================
// FIREBASE: AUTO-SAVE WITH DEBOUNCE
// ===================================================================

function scheduleSave() {
  if (isLoading || !currentProjectId) return;
  if (saveTimer) clearTimeout(saveTimer);
  setSaveStatus('saving');
  saveTimer = setTimeout(() => saveToFirebase(), 800);
}

async function saveToFirebase() {
  if (!currentProjectId) return;
  try {
    const data = collectFormData();
    await db.collection(COLLECTION).doc(currentProjectId).update(data);
    setSaveStatus('saved');
    // Update sidebar project name
    updateSidebarProjectName(currentProjectId, data.name);
  } catch (e) {
    setSaveStatus('error');
  }
}

function updateSidebarProjectName(id, name) {
  const items = document.querySelectorAll(`.project-item[data-id="${id}"] .project-item-name`);
  items.forEach(item => {
    const prefix = item.textContent.startsWith('\u{1F517}') ? '\u{1F517} ' : '';
    item.textContent = prefix + (name || '未命名工具');
  });
}

// ===================================================================
// FIREBASE: PROJECT MANAGEMENT
// ===================================================================

async function loadProjectList() {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy('updatedAt', 'desc').get();
    const ghListEl = document.getElementById('github-repos-list');
    const draftListEl = document.getElementById('draft-projects-list');
    const ghSection = document.getElementById('github-repos-section');

    ghListEl.innerHTML = '';
    draftListEl.innerHTML = '';

    let ghCount = 0;
    let draftCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      item.className = 'project-item' + (doc.id === currentProjectId ? ' active' : '');
      item.dataset.id = doc.id;
      item.onclick = (e) => {
        if (e.target.closest('.project-item-delete')) return;
        selectProject(doc.id);
      };

      const updatedAt = data.updatedAt ? data.updatedAt.toDate() : new Date();
      const timeStr = formatRelativeTime(updatedAt);
      const isPushed = !!data.githubRepo;

      item.innerHTML = `
        <div class="project-item-info">
          <div class="project-item-name">${isPushed ? '\u{1F517} ' : ''}${escapeHtml(data.name || '未命名工具')}</div>
          <div class="project-item-time">${isPushed ? data.githubRepo + ' · ' : ''}${timeStr}</div>
        </div>
        <button class="project-item-delete" onclick="showDeleteConfirm('${doc.id}', '${escapeHtml(data.name || '未命名工具')}')" title="刪除">&#128465;</button>
      `;

      if (isPushed) {
        ghListEl.appendChild(item);
        ghCount++;
      } else {
        draftListEl.appendChild(item);
        draftCount++;
      }
    });

    // Update counts
    document.getElementById('github-repos-count').textContent = ghCount;
    document.getElementById('draft-projects-count').textContent = draftCount;
    ghSection.style.display = ghCount > 0 ? 'block' : 'none';

    if (draftCount === 0 && ghCount === 0) {
      draftListEl.innerHTML = '<div class="sidebar-empty" style="display:block">尚無專案，點擊上方新增</div>';
    }

    // Also load GitHub repos that are NOT in our database
    loadGitHubRepoList();
  } catch (e) {
    setSaveStatus('offline');
  }
}

async function loadGitHubRepoList() {
  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  if (!token || !username) return;

  const ghListEl = document.getElementById('github-repos-list');
  const ghSection = document.getElementById('github-repos-section');

  // Get existing project repo names from the current list
  const existingRepos = new Set();
  ghListEl.querySelectorAll('.project-item').forEach(item => {
    const timeEl = item.querySelector('.project-item-time');
    if (timeEl) {
      const repoName = timeEl.textContent.split(' · ')[0];
      if (repoName) existingRepos.add(repoName);
    }
  });

  try {
    const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return;
    const repos = await res.json();

    repos.forEach(repo => {
      if (existingRepos.has(repo.name)) return; // Already shown via Firestore
      const item = document.createElement('div');
      item.className = 'project-item github-repo-item';
      item.dataset.repo = repo.name;
      item.onclick = () => selectGitHubRepo(repo.name, repo.description);

      item.innerHTML = `
        <div class="project-item-info">
          <div class="project-item-name">\u{1F4C1} ${escapeHtml(repo.name)}</div>
          <div class="project-item-time">${escapeHtml(repo.description || '無描述')}</div>
        </div>
      `;
      ghListEl.appendChild(item);
    });

    const totalCount = ghListEl.children.length;
    document.getElementById('github-repos-count').textContent = totalCount;
    ghSection.style.display = totalCount > 0 ? 'block' : 'none';
  } catch (e) {
    // Silent fail
  }
}

function selectGitHubRepo(repoName, description) {
  // Clear form and set up for skill-only push
  clearForm();
  currentProjectId = null;
  skillOnlyMode = true;
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('nav-bar').style.display = 'flex';
  document.getElementById('top-bar-title').textContent = repoName;

  // Start at Phase 3 (Skill selection) so user can pick skills first
  currentPhase = 3;
  showPhase(currentPhase);

  // Set push mode to skill-only
  setTimeout(() => {
    togglePushMode('skill');
    // Pre-fill the repo dropdown
    const select = document.getElementById('skill-push-repo');
    if (select) {
      // Ensure repo is in the dropdown, add if not
      let found = false;
      for (const opt of select.options) {
        if (opt.value === repoName) { found = true; break; }
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = repoName;
        opt.textContent = repoName + (description ? ` — ${description}` : '');
        select.appendChild(opt);
      }
      select.value = repoName;
    }
  }, 100);

  // Update sidebar active state
  document.querySelectorAll('.project-item').forEach(item => item.classList.remove('active'));
  const repoItem = document.querySelector(`.project-item[data-repo="${repoName}"]`);
  if (repoItem) repoItem.classList.add('active');

  closeSidebar();
}

function toggleSidebarSection(sectionId) {
  const body = document.getElementById(sectionId + '-list');
  const icon = document.querySelector(`#${sectionId}-section .sidebar-section-icon`);
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? 'block' : 'none';
  if (icon) icon.textContent = isCollapsed ? '\u25BC' : '\u25B6';
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  if (hours < 24) return `${hours} 小時前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString('zh-TW');
}

async function selectProject(docId) {
  skillOnlyMode = false;
  // Force save current project before switching
  if (currentProjectId && saveTimer) {
    clearTimeout(saveTimer);
    await saveToFirebase();
  }

  try {
    const doc = await db.collection(COLLECTION).doc(docId).get();
    if (doc.exists) {
      currentProjectId = docId;
      clearForm();
      restoreFormData(doc.data());
      showPhase(currentPhase);
      setSaveStatus('saved');
      document.getElementById('empty-state').style.display = 'none';
      document.getElementById('nav-bar').style.display = 'flex';

      // Update sidebar active state
      document.querySelectorAll('.project-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === docId);
      });

      // Update title
      const name = doc.data().name || doc.data().phase0?.toolName || '未命名工具';
      document.getElementById('top-bar-title').textContent = name;

      closeSidebar();

      // Load skills if on phase 3
      if (currentPhase === 3) refreshSkills();
    }
  } catch (e) {
    setSaveStatus('offline');
  }
}

async function createNewProject() {
  skillOnlyMode = false;
  const nameInput = document.getElementById('new-project-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.style.borderColor = '#E8725A';
    return;
  }

  try {
    const docRef = await db.collection(COLLECTION).add({
      name: name,
      phase0: { toolName: name },
      phase1: {},
      phase2: { features: [] },
      phase3: { selectedSkills: [] },
      phase4: { testCases: [] },
      phase5: {},
      currentPhase: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    currentProjectId = docRef.id;
    hideModal('new-project-modal');
    clearForm();
    document.getElementById('f-toolName').value = name;
    currentPhase = 0;
    showPhase(0);
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('nav-bar').style.display = 'flex';
    document.getElementById('top-bar-title').textContent = name;
    setSaveStatus('saved');

    await loadProjectList();

    // Focus first field
    setTimeout(() => document.getElementById('f-toolName').focus(), 200);
  } catch (e) {
    alert('\u5EFA\u7ACB\u5931\u6557\uFF1A' + e.message);
  }
}

function showDeleteConfirm(id, name) {
  pendingDeleteId = id;
  document.getElementById('delete-confirm-msg').textContent =
    `確定刪除「${name}」？此操作無法復原。`;
  showModal('delete-confirm-modal');
}

async function confirmDeleteProject() {
  if (!pendingDeleteId) return;
  try {
    await db.collection(COLLECTION).doc(pendingDeleteId).delete();

    if (pendingDeleteId === currentProjectId) {
      currentProjectId = null;
      clearForm();
      currentPhase = 0;
      document.getElementById('top-bar-title').textContent = '工具開發規格表';
      document.getElementById('nav-bar').style.display = 'none';
      // Hide all phases, show empty state
      for (let i = 0; i < TOTAL_PHASES; i++) {
        const el = document.getElementById(`phase-${i}`);
        if (el) el.style.display = 'none';
      }
      document.getElementById('empty-state').style.display = 'block';
      setSaveStatus('offline');
    }

    pendingDeleteId = null;
    hideModal('delete-confirm-modal');
    await loadProjectList();
  } catch (e) {
    alert('\u522A\u9664\u5931\u6557\uFF1A' + e.message);
  }
}

// ===================================================================
// SETTINGS
// ===================================================================

function openSettings() {
  loadSettingsValues();
  showModal('settings-modal');
}

function loadSettingsValues() {
  document.getElementById('settings-gh-token').value = localStorage.getItem('ghToken') || '';
  document.getElementById('settings-gh-username').value = localStorage.getItem('ghUsername') || '';
  document.getElementById('settings-skills-repo').value = localStorage.getItem('skillsRepo') || 'claude-skills';

  const provider = localStorage.getItem('aiProvider') || 'gemini';
  selectProvider(provider);

  const keyMap = { gemini: 'geminiKey', openrouter: 'openrouterKey', groq: 'groqKey', anthropic: 'anthropicKey' };
  document.getElementById('ai-api-key').value = localStorage.getItem(keyMap[provider]) || '';

  const orModel = localStorage.getItem('openrouterModel');
  if (orModel) document.getElementById('openrouter-model').value = orModel;

  // Auto-fetch username if token exists
  const token = localStorage.getItem('ghToken');
  if (token && !localStorage.getItem('ghUsername')) {
    fetchGitHubUsername(token);
  }
}

function saveSettings() {
  const token = document.getElementById('settings-gh-token').value.trim();
  localStorage.setItem('ghToken', token);

  const skillsRepo = document.getElementById('settings-skills-repo').value.trim() || 'claude-skills';
  localStorage.setItem('skillsRepo', skillsRepo);

  const provider = document.querySelector('.provider-card.selected')?.id?.replace('provider-', '') || 'gemini';
  localStorage.setItem('aiProvider', provider);

  const apiKey = document.getElementById('ai-api-key').value.trim();
  const keyMap = { gemini: 'geminiKey', openrouter: 'openrouterKey', groq: 'groqKey', anthropic: 'anthropicKey' };
  localStorage.setItem(keyMap[provider], apiKey);

  if (provider === 'openrouter') {
    localStorage.setItem('openrouterModel', document.getElementById('openrouter-model').value);
  }

  // Fetch username
  if (token) fetchGitHubUsername(token);
}

function selectProvider(provider) {
  document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`provider-${provider}`);
  if (card) card.classList.add('selected');

  const labels = {
    gemini: 'Google Gemini API Key',
    openrouter: 'OpenRouter API Key',
    groq: 'Groq API Key',
    anthropic: 'Anthropic API Key'
  };
  document.getElementById('ai-key-label').textContent = labels[provider] || 'API Key';
  document.getElementById('openrouter-model-section').style.display = provider === 'openrouter' ? 'block' : 'none';

  // Load saved key for this provider
  const keyMap = { gemini: 'geminiKey', openrouter: 'openrouterKey', groq: 'groqKey', anthropic: 'anthropicKey' };
  document.getElementById('ai-api-key').value = localStorage.getItem(keyMap[provider]) || '';
}

function toggleSettingsTokenVisibility() {
  const input = document.getElementById('settings-gh-token');
  const btn = document.getElementById('settings-toggle-eye');
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '&#128274;';
  } else {
    input.type = 'password';
    btn.innerHTML = '&#128065;';
  }
}

async function fetchGitHubUsername(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('ghUsername', data.login);
      document.getElementById('settings-gh-username').value = data.login;
    }
  } catch (e) { /* silent */ }
}

// ===================================================================
// AI: callAI() Unified Function
// ===================================================================

async function callAI(prompt) {
  const provider = localStorage.getItem('aiProvider') || 'gemini';
  const keyMap = { gemini: 'geminiKey', openrouter: 'openrouterKey', groq: 'groqKey', anthropic: 'anthropicKey' };
  const apiKey = localStorage.getItem(keyMap[provider]);

  if (!apiKey) {
    throw new Error('請先在設定頁填入 AI API Key');
  }

  switch (provider) {
    case 'gemini': {
      const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
      let lastErr = null;
      for (const gModel of geminiModels) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (res.status === 404) { lastErr = '模型不存在，嘗試下一個'; continue; }
        if (res.status === 429) { lastErr = '429 速率限制，稍後再試'; continue; }
        if (res.status === 403) throw new Error('Gemini API Key 無權限（403）。請到 Google AI Studio 重新產生 Key，或確認已啟用 Generative Language API');
        if (!res.ok) throw new Error(`Gemini API 錯誤: ${res.status}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      throw new Error(`Gemini: ${lastErr || '所有模型都失敗'}`);
    }
    case 'openrouter': {
      const model = localStorage.getItem('openrouterModel') || 'google/gemma-3n-e4b-it:free';
      const fallbackModels = ['google/gemma-3n-e4b-it:free', 'nvidia/nemotron-nano-9b-v2:free', 'stepfun/step-3.5-flash:free', 'openrouter/free'];
      const modelsToTry = [model, ...fallbackModels.filter(m => m !== model)];
      for (const tryModel of modelsToTry) {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://tedus-ai.github.io/tool-spec-form/',
          },
          body: JSON.stringify({ model: tryModel, messages: [{ role: 'user', content: prompt }], max_tokens: 4096 })
        });
        if (res.status === 429) continue;
        if (!res.ok) throw new Error(`OpenRouter API 錯誤: ${res.status}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
      throw new Error('OpenRouter: 所有免費模型都被限流，請稍後再試');
    }
    case 'groq': {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 4096 })
      });
      if (!res.ok) throw new Error(`Groq API 錯誤: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic API 錯誤: ${res.status}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }
    default:
      throw new Error('未知的 AI 提供商');
  }
}

async function testAIConnection() {
  const resultEl = document.getElementById('ai-test-result');
  resultEl.innerHTML = '<span class="spinner"></span> 測試中...';
  resultEl.style.color = '#2E86C1';

  // Save current settings first
  saveSettings();

  try {
    const result = await callAI('回答「連線成功」四個字即可。');
    resultEl.innerHTML = '\u2705 連線成功！回應：' + escapeHtml(result.substring(0, 100));
    resultEl.style.color = '#2D9B6E';
  } catch (e) {
    resultEl.innerHTML = '\u274C ' + escapeHtml(e.message);
    resultEl.style.color = '#E8725A';
  }
}

// ===================================================================
// AI: Level 1 — Fill Phase
// ===================================================================

async function aiFillPhase(phaseNum) {
  // Phase 0: require toolName & oneLiner before AI fill
  if (phaseNum === 0) {
    const toolName = getVal('f-toolName');
    const oneLiner = getVal('f-oneLiner');
    if (!toolName || !oneLiner) {
      const missing = [];
      if (!toolName) missing.push('工具名稱');
      if (!oneLiner) missing.push('工具概述');
      alert(`請先填寫必填欄位：${missing.join('、')}，AI 才能根據你的描述自動填入其他欄位`);
      if (!toolName) document.getElementById('f-toolName').focus();
      else document.getElementById('f-oneLiner').focus();
      return;
    }
  }
  const btn = document.getElementById(`ai-fill-${phaseNum}`);
  if (!btn) return;
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> AI 思考中...';

  try {
    const formData = collectFormData();
    const phaseKey = `phase${phaseNum}`;
    const filledFields = formData[phaseKey] || {};

    const phaseFieldDefs = {
      0: ['toolName（工具名稱）', 'oneLiner（工具概述）', 'users（使用者）', 'trigger（觸發情境）', 'inputSpec（輸入）', 'outputSpec（輸出）', 'successDef（成功定義）'],
      1: ['inputFormat（輸入格式）', 'inputFields（輸入欄位定義）', 'outputFormat（輸出格式）', 'calcLogic（計算邏輯）', 'boundary（邊界條件）', 'limits（限制與假設）'],
      2: ['frontend（前端框架）', 'database（資料庫）', 'uiNeed（UI需求）', 'features（功能拆解清單）'],
      4: ['testCases（測試案例）', 'boundaryTest（邊界值測試）', 'knownLimitations（已知限制）'],
      5: ['deployPlatform（部署平台）', 'updateFreq（更新頻率）', 'accessLevel（使用權限）', 'notifyMethod（通知方式）'],
    };

    const prompt = `你是一個資深工程師，協助使用者填寫工具開發規格表。
已填內容：${JSON.stringify(filledFields, null, 2)}
全部專案資料（供參考）：
Phase 0 需求定義：${JSON.stringify(formData.phase0)}
Phase 1 規格設計：${JSON.stringify(formData.phase1)}
Phase 2 技術架構：${JSON.stringify(formData.phase2)}

使用者在「工具概述」中描述了他們的工具構想：「${formData.phase0?.oneLiner || ''}」
${buildRefFileContext()}
請根據這段概述${referenceFiles.length > 0 ? '以及使用者提供的參考檔案' : ''}，拆解並補全 Phase ${phaseNum} 的以下欄位（只輸出 JSON，不要說明文字）：
${(phaseFieldDefs[phaseNum] || []).join(', ')}

輸出格式：一個 JSON 物件，key 為欄位英文名。`;

    const result = await callAI(prompt);
    // Parse JSON from AI response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiData = JSON.parse(jsonMatch[0]);
      applyAIData(phaseNum, aiData);
      scheduleSave();
    }
  } catch (e) {
    alert('AI 填寫失敗：' + e.message);
  }

  btn.disabled = false;
  btn.innerHTML = origText;
}

function applyAIData(phaseNum, aiData) {
  // Map AI data to form fields with AI draft marking
  if (phaseNum === 0) {
    const fieldMap = {
      toolName: 'f-toolName', repoName: 'f-repoName', oneLiner: 'f-oneLiner', users: 'f-users',
      trigger: 'f-trigger', inputSpec: 'f-inputSpec', outputSpec: 'f-outputSpec',
      successDef: 'f-successDef'
    };
    for (const [key, elId] of Object.entries(fieldMap)) {
      const el = document.getElementById(elId);
      if (el && aiData[key] && !el.value.trim()) {
        el.value = aiData[key];
        el.classList.add('ai-draft-field');
      }
    }
  } else if (phaseNum === 1) {
    const fieldMap = {
      inputFields: 'f-inputFields', calcLogic: 'f-calcLogic',
      boundary: 'f-boundary', limits: 'f-limits'
    };
    for (const [key, elId] of Object.entries(fieldMap)) {
      const el = document.getElementById(elId);
      if (el && aiData[key] && !el.value.trim()) {
        el.value = aiData[key];
        el.classList.add('ai-draft-field');
      }
    }
    if (aiData.outputFormat) {
      const formats = Array.isArray(aiData.outputFormat) ? aiData.outputFormat : [aiData.outputFormat];
      document.querySelectorAll('input[data-key="outputFormat"]').forEach(cb => {
        if (formats.includes(cb.value)) cb.checked = true;
      });
    }
  } else if (phaseNum === 2) {
    if (aiData.frontend) setRadio('frontend', aiData.frontend);
    if (aiData.database) setRadio('database', aiData.database);
    if (aiData.uiNeed) setRadio('uiNeed', aiData.uiNeed);
    if (aiData.features && Array.isArray(aiData.features)) {
      const list = document.getElementById('feature-list');
      list.innerHTML = '';
      aiData.features.forEach(f => {
        if (typeof f === 'string') addFeature(f, 'Mid', '');
        else addFeature(f.name || f, f.priority || 'Mid', f.hours || '');
      });
    }
  } else if (phaseNum === 4) {
    const fieldMap = { boundaryTest: 'f-boundaryTest', knownLimitations: 'f-knownLimitations' };
    for (const [key, elId] of Object.entries(fieldMap)) {
      const el = document.getElementById(elId);
      if (el && aiData[key] && !el.value.trim()) {
        el.value = aiData[key];
        el.classList.add('ai-draft-field');
      }
    }
    if (aiData.testCases && Array.isArray(aiData.testCases)) {
      const list = document.getElementById('test-case-list');
      list.innerHTML = '';
      aiData.testCases.forEach(tc => addTestCase(tc.input, tc.expected, tc.status));
    }
  } else if (phaseNum === 5) {
    if (aiData.deployPlatform) {
      const platforms = Array.isArray(aiData.deployPlatform) ? aiData.deployPlatform : [aiData.deployPlatform];
      document.querySelectorAll('input[data-key="deployPlatform"]').forEach(cb => {
        if (platforms.includes(cb.value)) cb.checked = true;
      });
    }
    if (aiData.updateFreq) setRadio('updateFreq', aiData.updateFreq);
    if (aiData.accessLevel) setRadio('accessLevel', aiData.accessLevel);
    if (aiData.notifyMethod) setRadio('notifyMethod', aiData.notifyMethod);
  }
}

// AI Level 2: Instant suggestions for Phase 0
let aiSuggestionTimer = null;
function triggerAISuggestion() {
  const toolName = getVal('f-toolName');
  const oneLiner = getVal('f-oneLiner');
  if (!toolName || !oneLiner) return;

  if (aiSuggestionTimer) clearTimeout(aiSuggestionTimer);
  aiSuggestionTimer = setTimeout(async () => {
    try {
      const prompt = `根據以下工具資訊，簡短建議：
工具名稱：${toolName}
描述：${oneLiner}
${buildRefFileContext()}
請用 JSON 格式回答：
{"users":"可能的使用者","scenarios":"常見觸發情境","inputs":"建議的輸入欄位"}
只輸出 JSON，不要其他文字。`;

      const result = await callAI(prompt);
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const suggestion = JSON.parse(jsonMatch[0]);
        showAISuggestion(suggestion);
      }
    } catch (e) { /* silent */ }
  }, 2000);
}

function showAISuggestion(suggestion) {
  const card = document.getElementById('ai-suggestion-0');
  card.style.display = 'block';
  card.innerHTML = `
    <h4>&#128161; AI 建議</h4>
    <p><strong>可能的使用者：</strong>${escapeHtml(suggestion.users || '')}</p>
    <p><strong>常見觸發情境：</strong>${escapeHtml(suggestion.scenarios || '')}</p>
    <p><strong>建議輸入欄位：</strong>${escapeHtml(suggestion.inputs || '')}</p>
    <div class="ai-suggestion-actions">
      <button class="btn-apply" onclick="applyAISuggestion()">套用建議</button>
      <button class="btn-ignore" onclick="document.getElementById('ai-suggestion-0').style.display='none'">忽略</button>
    </div>
  `;
}

function applyAISuggestion() {
  const card = document.getElementById('ai-suggestion-0');
  const texts = card.querySelectorAll('p');
  texts.forEach(p => {
    const text = p.textContent;
    if (text.includes('使用者：') && !getVal('f-users')) {
      document.getElementById('f-users').value = text.replace('可能的使用者：', '');
    }
    if (text.includes('觸發情境：') && !getVal('f-trigger')) {
      document.getElementById('f-trigger').value = text.replace('常見觸發情境：', '');
    }
    if (text.includes('輸入欄位：') && !getVal('f-inputSpec')) {
      document.getElementById('f-inputSpec').value = text.replace('建議輸入欄位：', '');
    }
  });
  card.style.display = 'none';
  scheduleSave();
}

// ===================================================================
// SKILLS MANAGEMENT
// ===================================================================

async function refreshSkills() {
  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  const skillsRepo = localStorage.getItem('skillsRepo') || 'claude-skills';

  if (!token || !username) {
    renderSkillCards([]);
    return;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${username}/${skillsRepo}/contents/`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!res.ok) {
      renderSkillCards([]);
      return;
    }

    const files = await res.json();
    const mdFiles = files.filter(f => f.type === 'file' && f.name.endsWith('.md') && f.name !== 'README.md');

    allSkillsFromRepo = [];
    const seen = new Set();
    for (const file of mdFiles) {
      if (seen.has(file.name)) continue;
      seen.add(file.name);
      try {
        const contentRes = await fetch(file.download_url);
        const content = await contentRes.text();
        const frontmatter = parseFrontmatter(content);
        allSkillsFromRepo.push({
          name: frontmatter.name || file.name.replace('.md', ''),
          description: frontmatter.description || '',
          filename: file.name,
          content: content,
        });
      } catch (e) {
        allSkillsFromRepo.push({
          name: file.name.replace('.md', ''),
          description: '',
          filename: file.name,
          content: '',
        });
      }
    }

    renderSkillCards(allSkillsFromRepo);
  } catch (e) {
    renderSkillCards([]);
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      fm[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
    }
  });
  return fm;
}

function renderSkillCards(skills) {
  const container = document.getElementById('skill-cards-container');
  const countEl = document.getElementById('skill-selected-count');

  if (skills.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>尚未載入 Skills</h3>
        <p>請先在設定頁配置 Skills Repo 並上傳 .skill 檔案。</p>
        <button onclick="openSettings()">前往設定</button>
      </div>
    `;
    countEl.style.display = 'none';
    return;
  }

  countEl.style.display = 'block';
  countEl.textContent = `已選 ${selectedSkills.length} 個 Skill`;

  // Deduplicate by filename
  const uniqueSkills = [];
  const seenNames = new Set();
  skills.forEach(s => {
    if (!seenNames.has(s.filename)) {
      seenNames.add(s.filename);
      uniqueSkills.push(s);
    }
  });

  let html = '<div class="skill-cards">';
  uniqueSkills.forEach(skill => {
    const isSelected = selectedSkills.includes(skill.filename);
    html += `
      <div class="skill-card ${isSelected ? 'selected' : ''}" onclick="toggleSkill('${escapeHtml(skill.filename)}', this)">
        <div class="skill-card-name">${escapeHtml(skill.name)}</div>
        <div class="skill-card-desc">${escapeHtml(skill.description).substring(0, 100)}</div>
        <button class="skill-card-preview-btn" onclick="event.stopPropagation(); previewSkill('${escapeHtml(skill.filename)}')">&#128065; 預覽全文</button>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

function toggleSkill(filename, el) {
  const idx = selectedSkills.indexOf(filename);
  if (idx >= 0) {
    selectedSkills.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    selectedSkills.push(filename);
    el.classList.add('selected');
  }
  document.getElementById('skill-selected-count').textContent = `已選 ${selectedSkills.length} 個 Skill`;
  scheduleSave();
}

function previewSkill(filename) {
  const skill = allSkillsFromRepo.find(s => s.filename === filename);
  if (!skill) return;
  document.getElementById('skill-preview-title').textContent = skill.name;
  document.getElementById('skill-preview-content').textContent = skill.content;
  showModal('skill-preview-modal');
}

function showAddSkillModal() {
  document.getElementById('manual-skill-name').value = '';
  document.getElementById('manual-skill-desc').value = '';
  document.getElementById('manual-skill-content').value = '';
  showModal('add-skill-modal');
}

async function saveManualSkill() {
  const name = getVal('manual-skill-name');
  const desc = getVal('manual-skill-desc');
  const content = document.getElementById('manual-skill-content').value;
  if (!name) { alert('請輸入 Skill 名稱'); return; }

  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  const skillsRepo = localStorage.getItem('skillsRepo') || 'claude-skills';
  if (!token || !username) { alert('請先設定 GitHub Token'); return; }

  const fullContent = `---\nname: ${name}\ndescription: ${desc}\n---\n\n${content}`;
  const filename = `${name}.md`;

  try {
    await pushFileToRepo(username, skillsRepo, filename, fullContent, `Add skill: ${name}`, token);
    hideModal('add-skill-modal');
    refreshSkills();
  } catch (e) {
    alert('儲存失敗：' + e.message);
  }
}

// ===================================================================
// REFERENCE FILES: Upload & Parse for AI Context
// ===================================================================

const MAX_REF_FILES = 3;
const MAX_REF_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const REF_CONTENT_LIMIT = 8000; // Max chars per file sent to AI

function handleRefFiles(fileList) {
  const files = Array.from(fileList);
  if (referenceFiles.length + files.length > MAX_REF_FILES) {
    alert(`最多只能上傳 ${MAX_REF_FILES} 個參考檔案`);
    return;
  }
  files.forEach(file => {
    if (file.size > MAX_REF_FILE_SIZE) {
      alert(`檔案 "${file.name}" 超過 5MB 限制，已跳過`);
      return;
    }
    parseRefFile(file);
  });
  // Reset input so same file can be re-uploaded
  document.getElementById('ref-file-input').value = '';
}

async function parseRefFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let content = '';
  let sheetNames = [];

  try {
    if (ext === 'xlsx' || ext === 'xls') {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      sheetNames = workbook.SheetNames;
      const parts = [];
      workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        parts.push(`[工作表: ${name}]\n${csv}`);
      });
      content = parts.join('\n\n');
    } else if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      const pageTexts = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        if (text.trim()) pageTexts.push(`[第 ${i} 頁]\n${text}`);
      }
      content = pageTexts.join('\n\n') || '(PDF 無法提取文字，可能是掃描圖檔)';
      sheetNames = [`共 ${totalPages} 頁`];
    } else if (ext === 'pptx') {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const slideTexts = [];
      let slideNum = 1;
      while (true) {
        const slideFile = zip.file(`ppt/slides/slide${slideNum}.xml`);
        if (!slideFile) break;
        const xml = await slideFile.async('text');
        // Extract text from <a:t> tags in slide XML
        const texts = [];
        const regex = /<a:t>([^<]*)<\/a:t>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
          if (match[1].trim()) texts.push(match[1]);
        }
        if (texts.length > 0) slideTexts.push(`[投影片 ${slideNum}]\n${texts.join('\n')}`);
        slideNum++;
      }
      content = slideTexts.join('\n\n') || '(PPTX 無法提取文字)';
      sheetNames = [`共 ${slideNum - 1} 張投影片`];
    } else if (ext === 'ppt') {
      content = '(.ppt 舊格式不支援直接解析，建議轉存為 .pptx 後再上傳)';
    } else if (ext === 'csv' || ext === 'tsv') {
      content = await file.text();
    } else {
      // txt, json, md
      content = await file.text();
    }

    // Truncate if too long
    if (content.length > REF_CONTENT_LIMIT) {
      content = content.substring(0, REF_CONTENT_LIMIT) + '\n... (內容過長，已截斷)';
    }

    referenceFiles.push({
      name: file.name,
      ext: ext,
      size: file.size,
      sheetNames: sheetNames,
      content: content
    });

    renderRefFileList();
  } catch (e) {
    alert(`解析檔案 "${file.name}" 失敗：${e.message}`);
  }
}

function removeRefFile(index) {
  referenceFiles.splice(index, 1);
  renderRefFileList();
}

function previewRefFile(index) {
  const file = referenceFiles[index];
  const modal = document.getElementById('skill-preview-modal');
  document.getElementById('skill-preview-title').textContent = `參考檔案：${file.name}`;
  document.getElementById('skill-preview-content').textContent = file.content;
  showModal('skill-preview-modal');
}

function renderRefFileList() {
  const container = document.getElementById('ref-file-list');
  const zone = document.getElementById('ref-upload-zone');

  if (referenceFiles.length === 0) {
    container.innerHTML = '';
    zone.classList.remove('has-files');
    return;
  }

  zone.classList.add('has-files');
  const iconMap = { xlsx: '\uD83D\uDCCA', xls: '\uD83D\uDCCA', csv: '\uD83D\uDCCB', tsv: '\uD83D\uDCCB', txt: '\uD83D\uDCC4', json: '\uD83D\uDD27', md: '\uD83D\uDCDD', pdf: '\uD83D\uDCD5', pptx: '\uD83D\uDCFD', ppt: '\uD83D\uDCFD' };

  container.innerHTML = referenceFiles.map((f, i) => {
    const icon = iconMap[f.ext] || '\uD83D\uDCC1';
    const sizeStr = f.size < 1024 ? `${f.size} B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
    const sheets = f.sheetNames.length > 0 ? ` (${f.sheetNames.length} 個工作表)` : '';
    return `<div class="ref-file-item">
      <span class="ref-file-icon">${icon}</span>
      <span class="ref-file-name">${escapeHtml(f.name)}</span>
      <span class="ref-file-info">${sizeStr}${sheets}</span>
      <button class="ref-file-preview-btn" onclick="previewRefFile(${i})">預覽</button>
      <button class="ref-file-remove" onclick="removeRefFile(${i})">&times;</button>
    </div>`;
  }).join('');
}

// Build reference file context string for AI prompts
function buildRefFileContext() {
  if (referenceFiles.length === 0) return '';
  const parts = referenceFiles.map(f => {
    return `【參考檔案：${f.name}】\n${f.content}`;
  });
  return '\n\n===== 使用者提供的參考檔案 =====\n' +
    '以下是使用者上傳的參考檔案內容，請參考這些資料中的欄位名稱、格式、數值範圍、計算邏輯等資訊來填寫規格：\n\n' +
    parts.join('\n\n');
}

// Drag & drop for reference file upload zone
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('ref-upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleRefFiles(e.dataTransfer.files);
  });
});

// ===================================================================
// SKILLS: .skill File Import
// ===================================================================

function handleSkillFiles(files) {
  parsedSkillFiles = [];
  const previewList = document.getElementById('skill-preview-list');
  previewList.innerHTML = '';

  const promises = Array.from(files).map(file => {
    return JSZip.loadAsync(file).then(zip => {
      const entries = Object.keys(zip.files);
      const skillMd = entries.find(e => e.endsWith('SKILL.md'));
      if (!skillMd) {
        parsedSkillFiles.push({ name: file.name, error: '找不到 SKILL.md', content: '' });
        return;
      }
      return zip.file(skillMd).async('string').then(content => {
        const fm = parseFrontmatter(content);
        parsedSkillFiles.push({
          name: fm.name || file.name.replace('.skill', ''),
          description: fm.description || '',
          content: content,
          error: null,
        });
      });
    }).catch(e => {
      parsedSkillFiles.push({ name: file.name, error: '解壓失敗: ' + e.message, content: '' });
    });
  });

  Promise.all(promises).then(() => {
    parsedSkillFiles.forEach(sf => {
      const item = document.createElement('div');
      item.className = 'skill-preview-item';
      item.innerHTML = `
        <span class="skill-name">${escapeHtml(sf.name)}</span>
        <span class="skill-desc">${escapeHtml(sf.description || sf.error || '')}</span>
        <span class="skill-status" style="background:${sf.error ? '#FFF0ED;color:#E8725A' : '#EDFAF3;color:#2D9B6E'}">
          ${sf.error ? '錯誤' : '就緒'}
        </span>
      `;
      previewList.appendChild(item);
    });

    document.getElementById('upload-skills-btn').style.display =
      parsedSkillFiles.some(f => !f.error) ? 'block' : 'none';
  });
}

// Drag and drop
(function setupDragDrop() {
  document.addEventListener('DOMContentLoaded', () => {
    const zone = document.getElementById('skill-upload-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleSkillFiles(e.dataTransfer.files);
    });
  });
})();

async function uploadAllSkills() {
  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  const skillsRepo = localStorage.getItem('skillsRepo') || 'claude-skills';
  if (!token || !username) { alert('請先設定 GitHub Token'); return; }

  const btn = document.getElementById('upload-skills-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 上傳中...';

  for (const sf of parsedSkillFiles) {
    if (sf.error) continue;
    const filename = `${sf.name}.md`;
    try {
      await pushFileToRepo(username, skillsRepo, filename, sf.content, `Add skill: ${sf.name}`, token);
      sf.uploaded = true;
    } catch (e) {
      sf.error = e.message;
    }
  }

  // Update preview
  const previewList = document.getElementById('skill-preview-list');
  previewList.innerHTML = '';
  parsedSkillFiles.forEach(sf => {
    const item = document.createElement('div');
    item.className = 'skill-preview-item';
    const statusColor = sf.uploaded ? '#EDFAF3;color:#2D9B6E' : '#FFF0ED;color:#E8725A';
    const statusText = sf.uploaded ? '已上傳' : (sf.error || '錯誤');
    item.innerHTML = `
      <span class="skill-name">${escapeHtml(sf.name)}</span>
      <span class="skill-desc">${escapeHtml(sf.description || '')}</span>
      <span class="skill-status" style="background:${statusColor}">${statusText}</span>
    `;
    previewList.appendChild(item);
  });

  btn.disabled = false;
  btn.innerHTML = '\u{1F680} 全部上傳到 claude-skills repo';
}

// ===================================================================
// SKILLS REPO CHECK/CREATE
// ===================================================================

async function checkSkillsRepo() {
  const token = localStorage.getItem('ghToken') || document.getElementById('settings-gh-token').value.trim();
  const username = localStorage.getItem('ghUsername');
  const skillsRepo = document.getElementById('settings-skills-repo').value.trim() || 'claude-skills';
  const resultEl = document.getElementById('skills-repo-result');

  if (!token || !username) {
    resultEl.innerHTML = '\u274C 請先填入 GitHub Token';
    resultEl.style.color = '#E8725A';
    return;
  }

  resultEl.innerHTML = '<span class="spinner"></span> 檢查中...';
  resultEl.style.color = '#2E86C1';

  try {
    const res = await fetch(`https://api.github.com/repos/${username}/${skillsRepo}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.ok) {
      resultEl.innerHTML = `\u2705 Repo 已存在：<a href="https://github.com/${username}/${skillsRepo}" target="_blank">${username}/${skillsRepo}</a>`;
      resultEl.style.color = '#2D9B6E';
    } else {
      resultEl.innerHTML = '\u26A0\uFE0F Repo 不存在，請點擊「自動建立」';
      resultEl.style.color = '#D4852F';
    }
  } catch (e) {
    resultEl.innerHTML = '\u274C ' + e.message;
    resultEl.style.color = '#E8725A';
  }
}

async function createSkillsRepo() {
  const token = localStorage.getItem('ghToken') || document.getElementById('settings-gh-token').value.trim();
  const skillsRepo = document.getElementById('settings-skills-repo').value.trim() || 'claude-skills';
  const resultEl = document.getElementById('skills-repo-result');

  if (!token) {
    resultEl.innerHTML = '\u274C 請先填入 GitHub Token';
    resultEl.style.color = '#E8725A';
    return;
  }

  resultEl.innerHTML = '<span class="spinner"></span> 建立中...';
  resultEl.style.color = '#2E86C1';

  try {
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: skillsRepo,
        description: 'Claude Code Skills Repository',
        private: false,
        auto_init: true,
      })
    });

    if (res.ok) {
      const data = await res.json();
      resultEl.innerHTML = `\u2705 成功建立！<a href="${data.html_url}" target="_blank">${data.full_name}</a>`;
      resultEl.style.color = '#2D9B6E';
    } else {
      const err = await res.json();
      resultEl.innerHTML = '\u274C ' + (err.errors?.[0]?.message || err.message);
      resultEl.style.color = '#E8725A';
    }
  } catch (e) {
    resultEl.innerHTML = '\u274C ' + e.message;
    resultEl.style.color = '#E8725A';
  }
}

// ===================================================================
// PUSH MODE: Toggle & Skill-Only Push
// ===================================================================

function togglePushMode(mode) {
  // Ensure radio is checked
  const radio = document.getElementById(mode === 'skill' ? 'push-mode-skill' : 'push-mode-full');
  if (radio) radio.checked = true;

  const fullSection = document.getElementById('full-push-section');
  const skillSection = document.getElementById('skill-push-section');
  if (!fullSection || !skillSection) return;

  if (mode === 'skill') {
    fullSection.style.display = 'none';
    skillSection.style.display = 'block';
    refreshSkillPushList();
    loadUserRepos();
  } else {
    fullSection.style.display = 'block';
    skillSection.style.display = 'none';
  }
  updatePushButtonText();
}

function updatePushButtonText() {
  const nextBtn = document.getElementById('next-btn');
  if (currentPhase !== TOTAL_PHASES - 1) return;
  const pushMode = document.querySelector('input[name="pushMode"]:checked');
  if (pushMode && pushMode.value === 'skill') {
    nextBtn.textContent = '\u{1F4E6} 推送 Skills';
    nextBtn.style.background = '#8E44AD';
  } else {
    nextBtn.textContent = '\u{1F680} 推送到 GitHub';
    nextBtn.style.background = '#E74C3C';
  }
}

function refreshSkillPushList() {
  const container = document.getElementById('skill-push-list');
  if (!container) return;
  if (selectedSkills.length === 0) {
    container.innerHTML = '<p class="empty-hint">\uFF08\u8ACB\u5148\u5728 Phase 3 \u9078\u64C7 Skill\uFF09</p>';
    return;
  }
  container.innerHTML = selectedSkills.map(filename => {
    const skill = allSkillsFromRepo.find(s => s.filename === filename);
    const name = skill ? skill.name : filename;
    return `<div class="skill-push-item"><span class="skill-push-icon">\u{1F4C4}</span> .claude/skills/${filename}<span class="skill-push-name">${name}</span></div>`;
  }).join('');
}

let _userReposCache = null;
async function loadUserRepos() {
  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  const select = document.getElementById('skill-push-repo');
  if (!token || !username || !select) return;

  const prevValue = select.value;
  select.innerHTML = '<option value="">載入中...</option>';

  try {
    let repos = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const res = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      repos = repos.concat(data);
      hasMore = data.length === 100;
      page++;
    }
    _userReposCache = repos;

    select.innerHTML = '<option value="">-- 請選擇 Repo --</option>';
    repos.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name + (r.description ? ` — ${r.description}` : '');
      select.appendChild(opt);
    });

    // Restore previous selection
    if (prevValue) select.value = prevValue;
  } catch (e) {
    select.innerHTML = '<option value="">載入失敗，請確認 GitHub Token</option>';
  }
}

async function readFileFromRepo(owner, repo, path, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return decodeURIComponent(escape(atob(data.content)));
}

function updateSkillPushStep(step, state) {
  const el = document.getElementById(`skill-push-step-${step}`);
  if (!el) return;
  el.className = `push-step ${state}`;
  const icons = { active: '\u23F3', done: '\u2705', error: '\u274C', '': '\u25CB' };
  el.querySelector('.push-step-icon').textContent = icons[state] || '\u25CB';
}

async function pushSkillsOnly() {
  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  if (!token || !username) {
    showStatus('error', '\u8ACB\u5148\u5728\u8A2D\u5B9A\u9801\u586B\u5165 GitHub Token');
    return;
  }

  const repoName = document.getElementById('skill-push-repo').value.trim();
  if (!repoName) {
    showStatus('error', '\u8ACB\u9078\u64C7\u76EE\u6A19 Repo');
    document.getElementById('skill-push-repo').focus();
    return;
  }

  if (selectedSkills.length === 0) {
    showStatus('error', '\u8ACB\u5148\u5728 Phase 3 \u9078\u64C7\u81F3\u5C11\u4E00\u500B Skill');
    return;
  }

  // Show progress
  document.getElementById('skill-push-progress').style.display = 'flex';
  document.getElementById('push-complete').style.display = 'none';
  showStatus('loading', '\u6B63\u5728\u63A8\u9001 Skills...');

  try {
    // Step 1: Verify repo exists
    updateSkillPushStep(1, 'active');
    const checkRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!checkRes.ok) {
      throw new Error(`Repo "${username}/${repoName}" \u4E0D\u5B58\u5728\u6216\u7121\u6B0A\u9650\u5B58\u53D6`);
    }
    updateSkillPushStep(1, 'done');

    // Step 2: Push skills
    updateSkillPushStep(2, 'active');
    const pushedSkills = [];
    const skillsRepo = localStorage.getItem('skillsRepo') || 'claude-skills';
    for (const skillFile of selectedSkills) {
      const skill = allSkillsFromRepo.find(s => s.filename === skillFile);
      if (skill && skill.content) {
        const skillPath = `.claude/skills/${skillFile}`;
        await pushFileToRepo(username, repoName, skillPath, skill.content, `Add skill: ${skillFile}`, token);
        pushedSkills.push({ name: skill.name, filename: skillFile, description: skill.description });
      }
    }
    updateSkillPushStep(2, 'done');

    // Step 3: Read existing CLAUDE.md and merge skill list
    updateSkillPushStep(3, 'active');
    const existingClaudeMd = await readFileFromRepo(username, repoName, 'CLAUDE.md', token);

    let newClaudeMd;
    const skillListBlock = pushedSkills.map(s =>
      `- .claude/skills/${s.filename}\uFF1A${s.description || s.name}`
    ).join('\n');
    const skillSection = `## \u958B\u59CB\u524D\u8ACB\u95B1\u8B80\u4EE5\u4E0B Skill \u6A94\u6848\n${skillListBlock}`;

    if (existingClaudeMd) {
      // Check if skill section already exists
      const skillSectionRegex = /## 開始前請閱讀以下 Skill 檔案[\s\S]*?(?=\n## |\n---|\Z|$)/;
      if (skillSectionRegex.test(existingClaudeMd)) {
        // Replace existing skill section
        newClaudeMd = existingClaudeMd.replace(skillSectionRegex, skillSection);
      } else {
        // Append skill section at the end
        newClaudeMd = existingClaudeMd.trimEnd() + '\n\n' + skillSection + '\n';
      }
    } else {
      // Create minimal CLAUDE.md
      newClaudeMd = `# Claude Code \u555F\u52D5\u8AAA\u660E\n\n${skillSection}\n`;
    }

    await pushFileToRepo(username, repoName, 'CLAUDE.md', newClaudeMd, 'Update CLAUDE.md: add skill references', token);
    updateSkillPushStep(3, 'done');

    // Show completion
    showStatus('success', 'Skills \u63A8\u9001\u5B8C\u6210\uFF01');
    const repoUrl = `https://github.com/${username}/${repoName}`;
    document.getElementById('push-complete').style.display = 'block';
    document.getElementById('push-complete').innerHTML = `
      <h3>\u2705 Skills \u63A8\u9001\u6210\u529F\uFF01</h3>
      <div class="file-list">
        ${pushedSkills.map(s => `<a href="${repoUrl}/blob/main/.claude/skills/${s.filename}" target="_blank">\u{1F4C4} .claude/skills/${s.filename}</a>`).join('')}
        <a href="${repoUrl}/blob/main/CLAUDE.md" target="_blank">\u{1F4C4} CLAUDE.md\uFF08\u5DF2\u66F4\u65B0\uFF09</a>
      </div>
      <a href="${repoUrl}" target="_blank" class="btn btn-primary" style="display:inline-block;text-decoration:none;margin-top:12px">\u{1F517} \u958B\u555F GitHub Repo</a>
    `;
  } catch (e) {
    showStatus('error', '\u63A8\u9001\u5931\u6557\uFF1A' + e.message);
    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById(`skill-push-step-${i}`);
      if (el && el.classList.contains('active')) updateSkillPushStep(i, 'error');
    }
  }
}

// ===================================================================
// GITHUB: Push File Helper
// ===================================================================

async function pushFileToRepo(owner, repo, path, content, message, token) {
  const base64Content = btoa(unescape(encodeURIComponent(content)));

  // Check if file exists (get SHA)
  let sha = null;
  try {
    const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      sha = checkData.sha;
    }
  } catch (e) { /* file doesn't exist */ }

  const body = { message, content: base64Content };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ===================================================================
// MARKDOWN GENERATION & PREVIEW
// ===================================================================

function generateMarkdown() {
  const data = collectFormData();
  const p0 = data.phase0;
  const p1 = data.phase1;
  const p2 = data.phase2;
  const p4 = data.phase4;
  const p5 = data.phase5;
  const now = new Date().toLocaleDateString('zh-TW');

  const features = (p2.features || []).filter(f => f.name).map((f, i) =>
    `- [ ] ${i + 1}. ${f.name} | 優先級：${f.priority || 'Mid'} | 預估：${f.hours || '?'} hr`
  ).join('\n');

  const testCases = (p4.testCases || []).filter(t => t.input || t.expected).map(t =>
    `| ${t.input} | ${t.expected} | ${t.status || '未測試'} |`
  ).join('\n');

  let md = `# ${p0.toolName || '未命名工具'} \u2014 開發規格書

> 建立日期：${now}

---

## Phase 0：需求定義

- **工具概述**：${p0.oneLiner || '（未填寫）'}
- **使用者**：${p0.users || '（未填寫）'}
- **觸發情境**：${p0.trigger || '（未填寫）'}
- **輸入**：${p0.inputSpec || '（未填寫）'}
- **輸出**：${p0.outputSpec || '（未填寫）'}
- **成功定義**：${p0.successDef || '（未填寫）'}

---

## Phase 1：規格設計

### 1.1 資料格式規格
- **輸入檔案格式**：${(p1.inputFormat || []).join('、') || '（未選擇）'}
- **輸入欄位定義**：
${p1.inputFields ? p1.inputFields.split('\n').map(l => `  - ${l}`).join('\n') : '  （未填寫）'}
- **輸出格式**：${(p1.outputFormat || []).join('、') || '（未選擇）'}

### 1.2 計算邏輯規格
${p1.calcLogic || '（未填寫）'}

### 1.3 邊界條件處理
${p1.boundary || '（未填寫）'}

### 1.4 限制與假設
${p1.limits || '（未填寫）'}

---

## Phase 2：技術架構

- **前端框架**：${p2.frontend || '（未選擇）'}
- **資料庫**：${p2.database || '（未選擇）'}
- **介面需求**：${p2.uiNeed || '（未選擇）'}

### 功能清單

${features || '（未填寫）'}

---

## Phase 3：Skill 選擇

已選擇的 Skills：
${selectedSkills.length > 0 ? selectedSkills.map(s => `- .claude/skills/${s}`).join('\n') : '（未選擇）'}

---

## Phase 4：測試計畫

### 測試案例

| 輸入值 | 預期輸出 | 狀態 |
|--------|----------|------|
${testCases || '| （未填寫） | | |'}

### 邊界值測試
${p4.boundaryTest || '（未填寫）'}

### 已知限制
${p4.knownLimitations || '（未填寫）'}

---

## Phase 5：部署計畫

- **部署平台**：${(p5.deployPlatform || []).join('、') || '（未選擇）'}
- **更新維護頻率**：${p5.updateFreq || '（未選擇）'}
- **使用權限**：${p5.accessLevel || '（未選擇）'}
- **部署後通知方式**：${p5.notifyMethod || '（未選擇）'}

---

## 給 Claude Code 的啟動說明

**一次只做一個功能，測試通過再做下一個。**

每輪開發使用以下格式：
- 【目標】這一步要完成什麼
- 【輸入】這個功能接收什麼
- 【輸出】這個功能要產出什麼
- 【規則】計算邏輯或判斷條件
- 【範例】一組具體的輸入 → 預期輸出

優先順序：正確性 > 穩定性 > 易用性 > 效率性 > 美觀性
`;
  return md;
}

function generatePreview() {
  const source = document.querySelector('input[name="specSource"]:checked');
  if (source && source.value === 'paste') {
    const pasteInput = document.getElementById('spec-paste-input');
    if (pasteInput && pasteInput.value.trim()) {
      document.getElementById('preview-content').textContent = pasteInput.value.trim();
      return;
    }
  }
  document.getElementById('preview-content').textContent = generateMarkdown();
}

function toggleSpecSource(mode) {
  const formMode = document.getElementById('spec-form-mode');
  const pasteMode = document.getElementById('spec-paste-mode');
  if (mode === 'paste') {
    formMode.style.display = 'none';
    pasteMode.style.display = 'block';
    syncPastedSpec();
  } else {
    formMode.style.display = 'block';
    pasteMode.style.display = 'none';
    generatePreview();
  }
}

function syncPastedSpec() {
  const input = document.getElementById('spec-paste-input');
  if (input && input.value.trim()) {
    document.getElementById('preview-content').textContent = input.value.trim();
  } else {
    document.getElementById('preview-content').textContent = '（請貼上 SPEC 內容）';
  }
}

function copyPreview() {
  const text = document.getElementById('preview-content').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '已複製 \u2713';
    setTimeout(() => btn.textContent = '複製', 2000);
  });
}

// ===================================================================
// AI Level 3: Organize Spec
// ===================================================================

async function aiOrganizeSpec() {
  const btn = document.getElementById('ai-organize-btn');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> AI 整理中...';

  try {
    const formData = collectFormData();
    const prompt = `你是一個資深工程師，請將以下表單資料整理成結構化的 SPEC.md。
格式要求：
- 使用 Markdown，Claude Code 可直接閱讀
- 功能清單使用 checklist 格式（- [ ] 功能名稱 | 優先級：High/Mid/Low | 預估：N hr）
- 邊界條件與限制假設獨立一節
- 結尾附「## 給 Claude Code 的啟動說明」，包含：
  - 應先閱讀哪些 Skill 檔案（路徑：.claude/skills/{name}.md）
  - 第一步從哪裡開始
  - 需要特別注意的技術細節

表單資料：${JSON.stringify(formData, null, 2)}
${buildRefFileContext()}`;

    const result = await callAI(prompt);
    document.getElementById('preview-content').textContent = result;
  } catch (e) {
    alert('AI 整理失敗：' + e.message);
    generatePreview(); // Fallback to raw preview
  }

  btn.disabled = false;
  btn.innerHTML = origText;
}

// ===================================================================
// GITHUB: PUSH PIPELINE (Phase 6)
// ===================================================================

function showStatus(type, msg) {
  const el = document.getElementById('status-msg');
  el.className = `status-msg ${type}`;
  el.textContent = msg;
}

function updatePushStep(step, state) {
  const el = document.getElementById(`push-step-${step}`);
  if (!el) return;
  el.className = `push-step ${state}`;
  const icons = { active: '\u23F3', done: '\u2705', error: '\u274C', '': '\u25CB' };
  el.querySelector('.push-step-icon').textContent = icons[state] || '\u25CB';
}

async function pushToGitHub() {
  const token = localStorage.getItem('ghToken');
  const username = localStorage.getItem('ghUsername');
  if (!token || !username) {
    showStatus('error', '請先在設定頁填入 GitHub Token');
    return;
  }

  const formData = collectFormData();
  const toolName = formData.phase0.toolName || '未命名工具';
  const repoName = (formData.phase0.repoName || toolName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')).trim();

  if (!repoName || !/^[a-zA-Z0-9\-]+$/.test(repoName)) {
    showStatus('error', 'GitHub Repo 名稱無效，請回到 Phase 0 填寫（僅限英文、數字、連字號）');
    return;
  }

  // Show progress
  document.getElementById('push-progress').style.display = 'flex';
  document.getElementById('push-complete').style.display = 'none';
  showStatus('loading', '正在推送...');

  try {
    // Step 1: Create repo
    updatePushStep(1, 'active');
    let repoExists = false;
    const checkRes = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (checkRes.ok) {
      repoExists = true;
    }

    if (!repoExists) {
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: repoName, description: toolName, private: false, auto_init: true })
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error('建立 Repo 失敗：' + (err.message || ''));
      }
      // Wait a moment for GitHub to initialize
      await new Promise(r => setTimeout(r, 2000));
    }
    updatePushStep(1, 'done');

    // Step 2: Directory structure (implicit via file pushes)
    updatePushStep(2, 'active');
    updatePushStep(2, 'done');

    // Step 3: Push SPEC.md
    updatePushStep(3, 'active');
    const specContent = document.getElementById('preview-content').textContent || generateMarkdown();
    await pushFileToRepo(username, repoName, 'SPEC.md', specContent, `Add SPEC.md: ${toolName}`, token);
    updatePushStep(3, 'done');

    // Step 4: Copy selected skills
    updatePushStep(4, 'active');
    const pushedSkills = [];
    const skillsRepo = localStorage.getItem('skillsRepo') || 'claude-skills';
    for (const skillFile of selectedSkills) {
      const skill = allSkillsFromRepo.find(s => s.filename === skillFile);
      if (skill && skill.content) {
        const skillPath = `.claude/skills/${skillFile}`;
        await pushFileToRepo(username, repoName, skillPath, skill.content, `Add skill: ${skillFile}`, token);
        pushedSkills.push({ name: skill.name, filename: skillFile, description: skill.description });
      }
    }
    updatePushStep(4, 'done');

    // Step 5: Generate and push CLAUDE.md
    updatePushStep(5, 'active');
    const claudeMd = generateClaudeMd(formData, pushedSkills);
    await pushFileToRepo(username, repoName, 'CLAUDE.md', claudeMd, `Add CLAUDE.md: ${toolName}`, token);
    updatePushStep(5, 'done');

    // Show completion
    showStatus('success', '推送完成！');
    const repoUrl = `https://github.com/${username}/${repoName}`;
    const copyText = `請先閱讀 SPEC.md 和 CLAUDE.md，再開始實作。Repo：${repoUrl}`;

    document.getElementById('push-complete').style.display = 'block';
    document.getElementById('push-complete').innerHTML = `
      <h3>\u2705 推送成功！</h3>
      <div class="file-list">
        <a href="${repoUrl}/blob/main/SPEC.md" target="_blank">\u{1F4C4} SPEC.md</a>
        <a href="${repoUrl}/blob/main/CLAUDE.md" target="_blank">\u{1F4C4} CLAUDE.md</a>
        ${pushedSkills.map(s => `<a href="${repoUrl}/blob/main/.claude/skills/${s.filename}" target="_blank">\u{1F4C4} .claude/skills/${s.filename}</a>`).join('')}
      </div>
      <div class="copy-command" onclick="navigator.clipboard.writeText('${copyText.replace(/'/g, "\\'")}').then(()=>this.textContent='\u2705 已複製！')">
        \u{1F4CB} 點擊複製：${escapeHtml(copyText)}
      </div>
      <a href="${repoUrl}" target="_blank" class="btn btn-primary" style="display:inline-block;text-decoration:none;margin-top:12px">\u{1F517} 開啟 GitHub Repo</a>
    `;

    // Mark project as pushed in Firestore → moves from draft to GitHub section
    if (currentProjectId) {
      try {
        await db.collection(COLLECTION).doc(currentProjectId).update({
          githubRepo: repoName,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await loadProjectList();
      } catch (e) { /* silent */ }
    }
  } catch (e) {
    showStatus('error', '推送失敗：' + e.message);
    // Mark current step as error
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`push-step-${i}`);
      if (el && el.classList.contains('active')) updatePushStep(i, 'error');
    }
  }
}

function generateClaudeMd(formData, skills) {
  const p0 = formData.phase0;
  const p2 = formData.phase2;
  const p5 = formData.phase5;

  let skillList = skills.map(s =>
    `   - .claude/skills/${s.filename}：${s.description || s.name}`
  ).join('\n');

  return `# ${p0.toolName || '未命名工具'} — Claude Code 啟動說明

## 任務概述
${p0.oneLiner || '（未填寫）'}

## 開始前請依序閱讀
1. SPEC.md — 完整規格與功能清單
2. 以下 Skill 檔案：
${skillList || '   （無選擇的 Skill）'}

## 第一步
根據 SPEC.md 中的功能清單，從第一個 High 優先級的功能開始實作。

## 技術架構
- 前端框架：${p2.frontend || '（未選擇）'}
- 資料庫：${p2.database || '（未選擇）'}
- 介面需求：${p2.uiNeed || '（未選擇）'}
- 部署平台：${(p5.deployPlatform || []).join('、') || '（未選擇）'}

## 注意事項
${formData.phase1.limits || '（未填寫）'}
${formData.phase1.boundary ? '\n邊界條件：' + formData.phase1.boundary : ''}
`;
}

// ===================================================================
// EVENT LISTENERS & AUTO-SAVE
// ===================================================================

function attachAutoSaveListeners() {
  // Text inputs and textareas
  document.querySelectorAll('input[type="text"][data-phase], textarea[data-phase]').forEach(el => {
    el.addEventListener('input', () => {
      scheduleSave();
      // Trigger AI suggestion for Phase 0
      if (el.dataset.phase === '0' && (el.dataset.key === 'toolName' || el.dataset.key === 'oneLiner')) {
        triggerAISuggestion();
      }
      // Auto-generate repoName from toolName if repoName is empty or was auto-generated
      if (el.dataset.key === 'toolName') {
        const repoEl = document.getElementById('f-repoName');
        if (repoEl && !repoEl.dataset.manualEdit) {
          repoEl.value = el.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        }
      }
      // Mark repoName as manually edited to stop auto-generation
      if (el.dataset.key === 'repoName') {
        el.dataset.manualEdit = 'true';
      }
      // Remove AI draft class on manual edit
      el.classList.remove('ai-draft-field');
    });
  });

  document.querySelectorAll('input[type="number"][data-phase]').forEach(el => {
    el.addEventListener('input', () => scheduleSave());
  });

  // Radio buttons and checkboxes
  document.querySelectorAll('input[type="radio"][data-phase], input[type="checkbox"][data-phase]').forEach(el => {
    el.addEventListener('change', () => scheduleSave());
  });
}

// Keyboard shortcuts for modals
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    if (document.getElementById('new-project-modal').classList.contains('active')) {
      createNewProject();
    }
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// Online/Offline detection
window.addEventListener('online', () => {
  setSaveStatus('synced');
  if (currentProjectId) scheduleSave();
});
window.addEventListener('offline', () => {
  setSaveStatus('offline');
});

// ===================================================================
// INITIALIZE
// ===================================================================

async function init() {
  // Initialize default features and test cases
  const featureList = document.getElementById('feature-list');
  if (featureList.children.length === 0) {
    addFeature(); addFeature(); addFeature();
  }
  const tcList = document.getElementById('test-case-list');
  if (tcList.children.length === 0) {
    addTestCase();
  }

  attachAutoSaveListeners();
  updateProgress();

  // Load project list
  try {
    await loadProjectList();
    setSaveStatus('saved');
  } catch (e) {
    setSaveStatus('offline');
  }

  // Check if there are existing projects
  const projectItems = document.querySelectorAll('.project-item');
  if (projectItems.length === 0) {
    // No projects, show empty state
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('nav-bar').style.display = 'none';
    for (let i = 0; i < TOTAL_PHASES; i++) {
      const el = document.getElementById(`phase-${i}`);
      if (el) el.style.display = 'none';
    }
  }
}

init();
