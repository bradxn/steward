const STORAGE_KEY = 'steward.documents.v1';
const today = new Date();
const isoDate = (date) => date.toISOString().slice(0, 10);
const daysFromNow = (days) => { const date = new Date(today); date.setDate(date.getDate() + days); return isoDate(date); };
const id = (type) => `${type}:${crypto.randomUUID()}`;

const seed = [
  { _id: 'thing:boat', type: 'thing', name: 'Blue Heron', description: '1989 C-Dory 22 Cruiser', attributes: { manufacturer: 'C-Dory', model: '22 Cruiser', serialNumber: 'DOR12345A989' }, createdAt: daysFromNow(-112), parentId: null, resourceIds: ['resource:manual', 'resource:photo'] },
  { _id: 'thing:generator', type: 'thing', name: 'Honda Generator', description: 'Portable generator kept aboard Blue Heron.', attributes: { manufacturer: 'Honda', model: 'EU2200i', serialNumber: 'EAMT-1234567' }, createdAt: daysFromNow(-90), parentId: 'thing:boat', resourceIds: ['resource:manual'] },
  { _id: 'thing:hottub', type: 'thing', name: 'Hot Tub', description: 'Main patio spa.', attributes: { manufacturer: 'Sundance', model: 'Marin', serialNumber: '' }, createdAt: daysFromNow(-180), parentId: null, resourceIds: [] },
  { _id: 'resource:manual', type: 'resource', title: 'Honda EU2200i Owner’s Manual', resourceType: 'pdf', filename: 'eu2200i-owners-manual.pdf', createdAt: daysFromNow(-89), thingIds: ['thing:generator', 'thing:boat'] },
  { _id: 'resource:photo', type: 'resource', title: 'Blue Heron at the dock', resourceType: 'photo', filename: 'blue-heron.jpg', createdAt: daysFromNow(-110), thingIds: ['thing:boat'] },
  { _id: 'event:oil', type: 'event', title: 'Changed generator oil', thingId: 'thing:generator', completedDate: daysFromNow(-7), dueDate: daysFromNow(-9), notes: 'Changed oil after the trip to the San Juans.', resourceIds: [] },
  { _id: 'event:chemical', type: 'event', title: 'Add sanitizer', thingId: 'thing:hottub', dueDate: daysFromNow(-2), completedDate: null, notes: '', resourceIds: [], ruleId: 'rule:chemical' },
  { _id: 'event:impeller', type: 'event', title: 'Inspect raw-water impeller', thingId: 'thing:boat', dueDate: daysFromNow(4), completedDate: null, notes: '', resourceIds: [] },
  { _id: 'event:registration', type: 'event', title: 'Renew boat registration', thingId: 'thing:boat', dueDate: daysFromNow(24), completedDate: null, notes: '', resourceIds: [] },
  { _id: 'rule:chemical', type: 'rule', title: 'Add sanitizer', thingId: 'thing:hottub', recurrence: { amount: 7, unit: 'days', anchor: 'after-completion' } }
];

let docs = [];
let db;
let view = { page: 'timeline', thingId: null };
async function initializeDatabase() {
  db = new PouchDB('steward');
  const existing = await db.allDocs({ include_docs: true });
  if (!existing.rows.length) {
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    docs = legacy || structuredClone(seed);
    await db.bulkDocs(docs);
    localStorage.removeItem(STORAGE_KEY);
  }
  const result = await db.allDocs({ include_docs: true });
  docs = result.rows.map((row) => row.doc);
  render();
}
async function persist(document) {
  const result = await db.put(document);
  document._rev = result.rev;
}
async function reloadDocuments() {
  const result = await db.allDocs({ include_docs: true });
  docs = result.rows.map((row) => row.doc);
}
const byId = (docId) => docs.find((doc) => doc._id === docId);
const things = () => docs.filter((doc) => doc.type === 'thing');
const events = () => docs.filter((doc) => doc.type === 'event');
const rules = () => docs.filter((doc) => doc.type === 'rule');
const resources = () => docs.filter((doc) => doc.type === 'resource');
const formatDate = (date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: new Date(date).getFullYear() !== today.getFullYear() ? 'numeric' : undefined }).format(new Date(`${date}T12:00:00`));
const isOverdue = (event) => !event.completedDate && event.dueDate < isoDate(today);
const eventDate = (event) => event.completedDate || (isOverdue(event) ? isoDate(today) : event.dueDate);
const escape = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const icon = (type) => ({ thing: '◆', event: '○', resource: '▧', pdf: 'PDF', photo: '◉', file: 'FILE' }[type] || '•');
const attachmentName = (resource) => Object.keys(resource._attachments || {})[0] || null;
const resourceFileName = (resource) => attachmentName(resource) || resource.filename || null;
const resourceTypeFor = (file) => file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('image/') ? 'photo' : 'file';
const addDays = (date, days) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + Number(days)); return isoDate(next); };

function nav() {
  return `<aside class="sidebar"><a class="brand" href="#timeline"><span>✦</span> Steward</a><nav><a href="#timeline" class="${view.page === 'timeline' ? 'active' : ''}">Timeline</a><a href="#things" class="${view.page === 'things' || view.page === 'thing' ? 'active' : ''}">Things <small>${things().length}</small></a></nav><div class="sidebar-foot"><button class="plain" data-action="export-backup">Export backup</button><button class="plain" data-action="import-backup">Import backup</button><input id="backup-file" type="file" accept="application/json" hidden /><button class="plain" data-action="reset">Reset sample data</button></div></aside>`;
}
function topbar(title, subtitle = '') { return `<header class="topbar"><div><p class="eyebrow">${subtitle}</p><h1>${title}</h1></div><button class="add" data-action="open-add">+ <span>Add</span></button></header>`; }
function eventCard(event, compact = false) {
  const thing = byId(event.thingId);
  const linkedResources = (event.resourceIds || []).map(byId).filter(Boolean);
  const status = event.completedDate ? 'completed' : isOverdue(event) ? 'overdue' : 'upcoming';
  const dateLabel = event.completedDate ? `Completed ${formatDate(event.completedDate)}` : isOverdue(event) ? `Due ${formatDate(event.dueDate)}` : formatDate(event.dueDate);
  return `<article class="event ${status}" data-event-id="${event._id}"><span class="event-icon">${event.completedDate ? '✓' : isOverdue(event) ? '!' : '○'}</span><div class="event-content"><h3>${escape(event.title)}</h3><p>${escape(thing?.name || event.thingName || 'Unassigned')} · ${dateLabel}</p>${event.notes && !compact ? `<p class="event-notes">${escape(event.notes)}</p>` : ''}${linkedResources.length ? `<p class="event-resources">▧ ${linkedResources.map((resource) => escape(resource.title)).join(' · ')}</p>` : ''}</div><div class="event-actions">${!event.completedDate ? `<button class="complete" data-action="complete" data-id="${event._id}">Complete</button>` : ''}<button class="event-edit" data-action="open-add" data-kind="event" data-edit="${event._id}">Edit</button></div></article>`;
}
function timeline(filterThingId = null) {
  const filtered = events().filter((event) => !filterThingId || event.thingId === filterThingId).sort((a, b) => eventDate(a).localeCompare(eventDate(b)));
  const completed = filtered.filter((event) => event.completedDate).sort((a, b) => b.completedDate.localeCompare(a.completedDate));
  const overdue = filtered.filter(isOverdue);
  const future = filtered.filter((event) => !event.completedDate && !isOverdue(event));
  const list = (heading, entries, empty) => `<section class="timeline-section"><h2>${heading}</h2>${entries.length ? entries.map((event) => eventCard(event)).join('') : `<p class="empty-inline">${empty}</p>`}</section>`;
  return `<main>${topbar(filterThingId ? byId(filterThingId).name : 'Timeline', filterThingId ? 'THING TIMELINE' : 'YOUR OWNERSHIP LOG')}<div class="timeline">${list('Needs attention', overdue, 'Nothing overdue.')}${list('Upcoming', future, 'No upcoming events yet.')}${list('History', completed, 'Your completed events will appear here.')}</div></main>`;
}
function thingsPage() {
  const list = things().sort((a, b) => a.name.localeCompare(b.name)).map((thing) => {
    const childCount = things().filter((candidate) => candidate.parentId === thing._id).length;
    const recent = events().filter((event) => event.thingId === thing._id).sort((a, b) => eventDate(b).localeCompare(eventDate(a)))[0];
    return `<a class="thing-card" href="#thing/${thing._id}"><div class="thing-avatar">${thing.name.charAt(0)}</div><div><h2>${escape(thing.name)}</h2><p>${escape(thing.attributes?.manufacturer || thing.description || 'Thing')}</p>${recent ? `<small>${childCount ? `${childCount} component${childCount > 1 ? 's' : ''} · ` : ''}${escape(recent.title)}</small>` : ''}</div><span class="chevron">›</span></a>`;
  }).join('');
  return `<main>${topbar('Things', 'YOUR PERSONAL ASSET LIBRARY')}<section class="thing-list">${list || '<p class="empty">Add your first thing to begin your Steward log.</p>'}</section></main>`;
}
function thingPage(thing) {
  const resources = docs.filter((doc) => doc.type === 'resource' && ((thing.resourceIds || []).includes(doc._id) || (doc.thingIds || []).includes(thing._id)));
  const children = things().filter((candidate) => candidate.parentId === thing._id);
  const attrs = Object.entries(thing.attributes || {}).filter(([, value]) => value).map(([label, value]) => `<div><dt>${escape(label.replace(/([A-Z])/g, ' $1'))}</dt><dd>${escape(value)}</dd></div>`).join('');
  const resourceList = resources.length ? `<div class="resource-list">${resources.map((resource) => `<div class="resource-row"><button class="resource" data-action="open-resource" data-id="${resource._id}" ${attachmentName(resource) ? '' : 'disabled'}><span>${icon(resource.resourceType)}</span><div><strong>${escape(resource.title)}</strong><small>${escape(resourceFileName(resource) || 'No file attached')}</small></div></button><button class="resource-edit" data-action="open-add" data-kind="resource" data-edit="${resource._id}">Edit</button></div>`).join('')}</div>` : '<p class="muted">No files attached yet.</p>';
  const componentList = children.length ? `<div class="child-list">${children.map((child) => `<a href="#thing/${child._id}">${escape(child.name)} <span>›</span></a>`).join('')}</div>` : '<p class="muted">No components yet.</p>';
  const ruleList = rules().filter((rule) => rule.thingId === thing._id).map((rule) => `<div class="rule-item"><span>↻ ${escape(rule.title)} · every ${rule.recurrence.amount} ${escape(rule.recurrence.unit)}</span><button class="resource-edit" data-action="open-add" data-kind="rule" data-edit="${rule._id}">Edit</button></div>`).join('') || '<p class="muted">No care rules yet.</p>';
  const eventList = events().filter((event) => event.thingId === thing._id).sort((a, b) => eventDate(b).localeCompare(eventDate(a))).map((event) => eventCard(event, true)).join('') || '<p class="muted">No events recorded yet.</p>';
  return `<main>${topbar(escape(thing.name), 'THING DETAILS')}<a class="back" href="#things">‹ All things</a><section class="thing-hero"><div class="thing-avatar large">${thing.name.charAt(0)}</div><div><p>${escape(thing.description || 'No description yet.')}</p>${thing.parentId ? `<a href="#thing/${thing.parentId}" class="parent-link">Part of ${escape(byId(thing.parentId)?.name || 'another thing')}</a>` : ''}</div><button class="edit-thing-button" data-action="open-add" data-kind="thing" data-edit="${thing._id}">Edit details</button></section><div class="detail-grid"><section class="panel"><h2>About</h2><dl>${attrs || '<p class="muted">No details added yet.</p>'}</dl></section><section class="panel"><h2>Resources</h2>${resourceList}<button class="text-button" data-action="open-add" data-kind="resource" data-thing="${thing._id}">+ Add resource</button></section><section class="panel"><h2>Components</h2>${componentList}<button class="text-button" data-action="open-add" data-kind="thing" data-parent="${thing._id}">+ Add component</button></section><section class="panel"><h2>Care rules</h2>${ruleList}<button class="text-button" data-action="open-add" data-kind="rule" data-thing="${thing._id}">+ Add rule</button></section><section class="panel timeline-panel"><h2>Timeline</h2>${eventList}<button class="text-button" data-action="open-add" data-kind="event" data-thing="${thing._id}">+ Add event</button></section></div></main>`;
}
function modal(kind = 'choose', context = {}) {
  const options = `<button data-action="open-add" data-kind="thing" class="add-choice"><b>◆</b><span><strong>Thing</strong><small>Add something you own or care for</small></span></button><button data-action="open-add" data-kind="event" class="add-choice"><b>○</b><span><strong>Event</strong><small>Record something that happened or is due</small></span></button><button data-action="open-add" data-kind="rule" class="add-choice"><b>↻</b><span><strong>Care rule</strong><small>Repeat something after completion</small></span></button><button data-action="open-add" data-kind="resource" class="add-choice"><b>▧</b><span><strong>Resource</strong><small>Add a document, photo, or file</small></span></button>`;
  if (kind === 'choose') return `<div class="overlay" data-action="close-modal"><dialog open><button class="close" data-action="close-modal">×</button><p class="eyebrow">ADD TO STEWARD</p><h2>What would you like to add?</h2><div class="add-choices">${options}</div></dialog></div>`;
  const editingThing = kind === 'thing' && context.edit ? byId(context.edit) : null;
  const editingResource = kind === 'resource' && context.edit ? byId(context.edit) : null;
  const editingEvent = kind === 'event' && context.edit ? byId(context.edit) : null;
  const editingRule = kind === 'rule' && context.edit ? byId(context.edit) : null;
  const nextRuleEvent = editingRule ? events().filter((event) => event.ruleId === editingRule._id && !event.completedDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] : null;
  const labels = { thing: editingThing ? 'Edit Thing' : 'Add a Thing', event: editingEvent ? 'Edit Event' : 'Add an Event', rule: editingRule ? 'Edit Care Rule' : 'Add a Care Rule', resource: editingResource ? 'Edit Resource' : 'Add a Resource' };
  let fields = '';
  if (kind === 'thing') fields = `${editingThing ? `<input type="hidden" name="editingThingId" value="${editingThing._id}" />` : ''}<label>Name<input name="name" required placeholder="e.g., Honda Generator" value="${escape(editingThing?.name || '')}" /></label><label>Description<textarea name="description" placeholder="A few helpful details">${escape(editingThing?.description || '')}</textarea></label><div class="two"><label>Manufacturer<input name="manufacturer" value="${escape(editingThing?.attributes?.manufacturer || '')}" /></label><label>Model<input name="model" value="${escape(editingThing?.attributes?.model || '')}" /></label></div><label>Serial number<input name="serialNumber" value="${escape(editingThing?.attributes?.serialNumber || '')}" /></label>${context.parent && !editingThing ? `<input type="hidden" name="parentId" value="${context.parent}" />` : `<label>Part of<select name="parentId"><option value="">Nothing / top level</option>${things().filter((thing) => thing._id !== editingThing?._id).map((thing) => `<option value="${thing._id}" ${thing._id === editingThing?.parentId ? 'selected' : ''}>${escape(thing.name)}</option>`).join('')}</select></label>`}`;
  if (kind === 'event') fields = `${editingEvent ? `<input type="hidden" name="editingEventId" value="${editingEvent._id}" />` : ''}<label>What happened (or needs to happen)?<input name="title" required placeholder="e.g., Changed oil" value="${escape(editingEvent?.title || '')}" /></label><label>Thing<select name="thingId" required><option value="">Choose a thing</option>${things().map((thing) => `<option value="${thing._id}" ${context.thing === thing._id || editingEvent?.thingId === thing._id ? 'selected' : ''}>${escape(thing.name)}</option>`).join('')}</select></label><div class="two"><label>When<select name="eventState"><option value="completed" ${editingEvent?.completedDate ? 'selected' : ''}>Already happened</option><option value="planned" ${editingEvent && !editingEvent.completedDate ? 'selected' : ''}>Planned for later</option></select></label><label>Date<input name="date" required type="date" value="${editingEvent?.completedDate || editingEvent?.dueDate || isoDate(today)}" /></label></div><label>Notes<textarea name="notes" placeholder="What do you want to remember?">${escape(editingEvent?.notes || '')}</textarea></label><label>Related resources<select name="resourceIds" multiple size="${Math.min(Math.max(resources().length, 2), 5)}">${resources().map((resource) => `<option value="${resource._id}" ${(editingEvent?.resourceIds || []).includes(resource._id) ? 'selected' : ''}>${escape(resource.title)}</option>`).join('')}</select><small class="field-help">Use Command/Ctrl-click to select more than one.</small></label>`;
  if (kind === 'rule') fields = `${editingRule ? `<input type="hidden" name="editingRuleId" value="${editingRule._id}" />` : ''}<label>What should repeat?<input name="title" required placeholder="e.g., Add sanitizer" value="${escape(editingRule?.title || '')}" /></label><label>Thing<select name="thingId" required><option value="">Choose a thing</option>${things().map((thing) => `<option value="${thing._id}" ${context.thing === thing._id || editingRule?.thingId === thing._id ? 'selected' : ''}>${escape(thing.name)}</option>`).join('')}</select></label><div class="two"><label>Every<input name="intervalAmount" type="number" min="1" required value="${editingRule?.recurrence.amount || 7}" /></label><label>Unit<select name="intervalUnit"><option value="days">days</option></select></label></div><label>${editingRule ? 'Next due date' : 'First due date'}<input name="firstDueDate" required type="date" value="${nextRuleEvent?.dueDate || isoDate(today)}" /></label><p class="field-help">After each completion, Steward schedules the next event from the date it actually happened.</p>`;
  if (kind === 'resource') fields = `${editingResource ? `<input type="hidden" name="editingResourceId" value="${editingResource._id}" />` : ''}<label>${editingResource ? 'Replace file' : 'File'}<input name="file" type="file" ${editingResource ? '' : 'required'} />${editingResource ? '<small class="field-help">Leave empty to keep the current file.</small>' : ''}</label><label>Title <span class="optional">(optional)</span><input name="title" placeholder="Defaults to the file name" value="${escape(editingResource?.title || '')}" /></label><label>Related thing<select name="thingId"><option value="">None yet</option>${things().map((thing) => `<option value="${thing._id}" ${context.thing === thing._id || (editingResource?.thingIds || []).includes(thing._id) ? 'selected' : ''}>${escape(thing.name)}</option>`).join('')}</select></label>`;
  const removeAction = editingThing ? `<section class="form-danger"><div><strong>Remove this Thing</strong><p>Its events and resources will be retained without this association.</p></div><button type="button" data-action="remove-thing" data-id="${editingThing._id}">Remove Thing</button></section>` : editingResource ? `<section class="form-danger"><div><strong>Remove this Resource</strong><p>This permanently deletes its attached file.</p></div><button type="button" data-action="remove-resource" data-id="${editingResource._id}">Remove Resource</button></section>` : editingEvent ? `<section class="form-danger"><div><strong>Remove this Event</strong><p>This removes the event from your ownership log.</p></div><button type="button" data-action="remove-event" data-id="${editingEvent._id}">Remove Event</button></section>` : editingRule ? `<section class="form-danger"><div><strong>Remove this Care Rule</strong><p>Its outstanding scheduled event will be removed; completed history remains.</p></div><button type="button" data-action="remove-rule" data-id="${editingRule._id}">Remove Rule</button></section>` : '';
  return `<div class="overlay" data-action="close-modal"><dialog open><button class="close" data-action="close-modal">×</button><p class="eyebrow">${kind.toUpperCase()}</p><h2>${labels[kind]}</h2><form data-form="${kind}">${fields}${removeAction}<div class="form-actions"><button type="button" class="cancel" data-action="close-modal">Cancel</button><button class="submit">Save ${kind}</button></div></form></dialog></div>`;
}
function render() {
  const route = location.hash.slice(1) || 'timeline';
  const [page, itemId] = route.split('/');
  view = { page, thingId: itemId || null };
  let content = page === 'things' ? thingsPage() : page === 'thing' && byId(itemId) ? thingPage(byId(itemId)) : timeline();
  document.querySelector('#app').innerHTML = `<div class="app-shell">${nav()}${content}</div>`;
}
function openModal(kind, context = {}) { document.body.insertAdjacentHTML('beforeend', modal(kind, context)); }
function closeModal() { document.querySelector('.overlay')?.remove(); }
async function addDoc(type, form) {
  const formData = new FormData(form);
  const value = Object.fromEntries(formData);
  if (type === 'thing') {
    const document = value.editingThingId ? byId(value.editingThingId) : null;
    if (document) {
      document.name = value.name;
      document.description = value.description;
      document.parentId = value.parentId || null;
      document.attributes = { manufacturer: value.manufacturer, model: value.model, serialNumber: value.serialNumber };
      await persist(document);
    } else {
      const newThing = { _id: id('thing'), type: 'thing', name: value.name, description: value.description, parentId: value.parentId || null, attributes: { manufacturer: value.manufacturer, model: value.model, serialNumber: value.serialNumber }, resourceIds: [], createdAt: isoDate(today) };
      await persist(newThing);
      docs.push(newThing);
    }
  }
  if (type === 'event') {
    const resourceIds = formData.getAll('resourceIds');
    const document = value.editingEventId ? byId(value.editingEventId) : null;
    const event = document || { _id: id('event'), type: 'event', resourceIds: [] };
    event.title = value.title;
    event.thingId = value.thingId;
    event.notes = value.notes;
    event.resourceIds = resourceIds;
    if (value.eventState === 'completed') {
      event.completedDate = value.date;
      event.dueDate = event.dueDate || value.date;
    } else {
      event.completedDate = null;
      event.dueDate = value.date;
    }
    await persist(event);
    if (!document) docs.push(event);
    if (event.completedDate) await scheduleNextFromRule(event);
  }
  if (type === 'rule') {
    const rule = value.editingRuleId ? byId(value.editingRuleId) : null;
    if (rule) {
      rule.title = value.title;
      rule.thingId = value.thingId;
      rule.recurrence = { amount: Number(value.intervalAmount), unit: value.intervalUnit, anchor: 'after-completion' };
      const next = events().filter((event) => event.ruleId === rule._id && !event.completedDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      if (next) {
        next.title = rule.title;
        next.thingId = rule.thingId;
        next.dueDate = value.firstDueDate;
        await db.bulkDocs([rule, next]);
      } else {
        const event = { _id: id('event'), type: 'event', title: rule.title, thingId: rule.thingId, dueDate: value.firstDueDate, completedDate: null, notes: '', resourceIds: [], ruleId: rule._id };
        await db.bulkDocs([rule, event]);
      }
    } else {
      const newRule = { _id: id('rule'), type: 'rule', title: value.title, thingId: value.thingId, recurrence: { amount: Number(value.intervalAmount), unit: value.intervalUnit, anchor: 'after-completion' }, createdAt: isoDate(today) };
      const event = { _id: id('event'), type: 'event', title: value.title, thingId: value.thingId, dueDate: value.firstDueDate, completedDate: null, notes: '', resourceIds: [], ruleId: newRule._id };
      await db.bulkDocs([newRule, event]);
    }
    await reloadDocuments();
  }
  if (type === 'resource') {
    const file = form.elements.file.files[0];
    const editing = value.editingResourceId ? await db.get(value.editingResourceId) : null;
    let resource = editing || { _id: id('resource'), type: 'resource', title: value.title.trim() || file.name.replace(/\.[^.]+$/, ''), resourceType: resourceTypeFor(file), thingIds: [], createdAt: isoDate(today) };
    const previousThingIds = resource.thingIds || [];
    resource.title = value.title.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : resource.title);
    resource.thingIds = value.thingId ? [value.thingId] : [];
    if (!editing) await persist(resource);
    if (file) {
      for (const name of Object.keys(resource._attachments || {})) {
        const result = await db.removeAttachment(resource._id, name, resource._rev);
        resource._rev = result.rev;
      }
      resource.resourceType = resourceTypeFor(file);
      const result = await db.putAttachment(resource._id, file.name, resource._rev, file, file.type || 'application/octet-stream');
      resource._rev = result.rev;
      resource = await db.get(resource._id);
      resource.title = value.title.trim() || file.name.replace(/\.[^.]+$/, '');
      resource.thingIds = value.thingId ? [value.thingId] : [];
    }
    await persist(resource);
    const affectedThings = things().filter((thing) => previousThingIds.includes(thing._id) || resource.thingIds.includes(thing._id));
    for (const thing of affectedThings) {
      const hasResource = resource.thingIds.includes(thing._id);
      thing.resourceIds = hasResource ? [...new Set([...(thing.resourceIds || []), resource._id])] : (thing.resourceIds || []).filter((resourceId) => resourceId !== resource._id);
      await persist(thing);
    }
    await reloadDocuments();
  }
  closeModal(); render();
}
async function openResource(resource) {
  const name = attachmentName(resource);
  if (!name) return;
  const blob = await db.getAttachment(resource._id, name);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function scheduleNextFromRule(event) {
  const rule = byId(event.ruleId);
  if (!rule || !event.completedDate || events().some((candidate) => candidate.ruleId === rule._id && !candidate.completedDate && candidate._id !== event._id)) return;
  const next = { _id: id('event'), type: 'event', title: rule.title, thingId: rule.thingId, dueDate: addDays(event.completedDate, rule.recurrence.amount), completedDate: null, notes: '', resourceIds: [], ruleId: rule._id };
  await persist(next);
  docs.push(next);
}
async function completeEvent(event) {
  event.completedDate = isoDate(today);
  event.dueDate = event.dueDate || event.completedDate;
  await persist(event);
  await scheduleNextFromRule(event);
  render();
}
async function removeEvent(event) {
  if (!confirm(`Remove “${event.title}”? This cannot be undone.`)) return;
  event._deleted = true;
  await db.bulkDocs([event]);
  await reloadDocuments();
  closeModal();
  render();
}
async function removeRule(rule) {
  if (!confirm(`Remove the “${rule.title}” care rule? Its outstanding scheduled event will also be removed.`)) return;
  const updates = events().filter((event) => event.ruleId === rule._id && !event.completedDate).map((event) => ({ ...event, _deleted: true }));
  updates.push({ ...rule, _deleted: true });
  await db.bulkDocs(updates);
  await reloadDocuments();
  closeModal();
  render();
}
async function exportBackup() {
  const result = await db.allDocs({ include_docs: true, attachments: true, binary: false });
  const payload = { format: 'steward-backup', version: 1, exportedAt: new Date().toISOString(), docs: result.rows.map((row) => row.doc) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `steward-backup-${isoDate(today)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function importBackup(file) {
  const payload = JSON.parse(await file.text());
  if (payload.format !== 'steward-backup' || !Array.isArray(payload.docs)) throw new Error('This is not a Steward backup file.');
  if (!confirm('Replace all current Steward data with this backup? This cannot be undone.')) return;
  const imported = payload.docs.map((document) => { const copy = structuredClone(document); delete copy._rev; delete copy._revisions; return copy; });
  await db.destroy();
  db = new PouchDB('steward');
  await db.bulkDocs(imported);
  await reloadDocuments();
  location.hash = '#timeline';
  render();
}
async function removeResource(resource) {
  if (!confirm(`Remove “${resource.title}” and its attached file? This cannot be undone.`)) return;
  const updates = [];
  for (const document of docs.filter((document) => (document.resourceIds || []).includes(resource._id))) {
    document.resourceIds = document.resourceIds.filter((resourceId) => resourceId !== resource._id);
    updates.push(document);
  }
  resource._deleted = true;
  updates.push(resource);
  await db.bulkDocs(updates);
  await reloadDocuments();
  render();
}
async function removeThing(thing) {
  const relatedRules = docs.filter((document) => document.type === 'rule' && document.thingId === thing._id);
  const message = `Remove “${thing.name}”?\n\nIts ${relatedRules.length ? `${relatedRules.length} rule${relatedRules.length === 1 ? '' : 's'} will also be removed. ` : ''}Events and resources will be kept but no longer associated with this Thing. This cannot be undone.`;
  if (!confirm(message)) return;

  const updates = [];
  for (const child of things().filter((candidate) => candidate.parentId === thing._id)) {
    child.parentId = thing.parentId || null;
    updates.push(child);
  }
  for (const resource of docs.filter((document) => document.type === 'resource' && (document.thingIds || []).includes(thing._id))) {
    resource.thingIds = resource.thingIds.filter((thingId) => thingId !== thing._id);
    updates.push(resource);
  }
  for (const event of events().filter((candidate) => candidate.thingId === thing._id)) {
    event.thingId = null;
    event.thingName = thing.name;
    updates.push(event);
  }
  for (const rule of relatedRules) {
    rule._deleted = true;
    updates.push(rule);
  }
  thing._deleted = true;
  updates.push(thing);
  await db.bulkDocs(updates);
  await reloadDocuments();
  location.hash = '#things';
}
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  const { action } = target.dataset;
  if (action === 'open-add') { event.preventDefault(); closeModal(); openModal(target.dataset.kind || 'choose', target.dataset); }
  if (action === 'close-modal' && (event.target === target || target.classList.contains('close') || target.classList.contains('cancel'))) closeModal();
  if (action === 'complete') await completeEvent(byId(target.dataset.id));
  if (action === 'export-backup') await exportBackup();
  if (action === 'import-backup') document.querySelector('#backup-file')?.click();
  if (action === 'reset') { if (confirm('Restore the initial sample data?')) { await db.destroy(); db = new PouchDB('steward'); docs = structuredClone(seed); await db.bulkDocs(docs); const result = await db.allDocs({ include_docs: true }); docs = result.rows.map((row) => row.doc); render(); } }
  if (action === 'remove-thing') await removeThing(byId(target.dataset.id));
  if (action === 'open-resource') await openResource(byId(target.dataset.id));
  if (action === 'remove-resource') await removeResource(byId(target.dataset.id));
  if (action === 'remove-event') await removeEvent(byId(target.dataset.id));
  if (action === 'remove-rule') await removeRule(byId(target.dataset.id));
});
document.addEventListener('submit', async (event) => { if (event.target.matches('[data-form]')) { event.preventDefault(); await addDoc(event.target.dataset.form, event.target); } });
document.addEventListener('change', async (event) => {
  if (event.target.matches('#backup-file') && event.target.files[0]) {
    try { await importBackup(event.target.files[0]); }
    catch (error) { alert(error.message || 'Could not import this backup.'); }
    event.target.value = '';
  }
});
window.addEventListener('hashchange', render);
document.querySelector('#app').innerHTML = '<main class="loading"><p class="eyebrow">STEWARD</p><h1>Opening your log…</h1></main>';
initializeDatabase();
