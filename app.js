// Notes app using Firebase Realtime Database
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getDatabase, ref, set, onValue, remove
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyCLCcV1ty0DO2t_M0DzXFafzT1cpgWoo7I",
  authDomain: "sysdes-23c1b.firebaseapp.com",
  databaseURL: "https://sysdes-23c1b-default-rtdb.firebaseio.com/",
  projectId: "sysdes-23c1b",
  storageBucket: "sysdes-23c1b.firebasestorage.app",
  messagingSenderId: "18571060739",
  appId: "1:18571060739:web:c24165ea59c87622249036",
  measurementId: "G-7JG5V4FM5M"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM
const treeEl = document.getElementById('tree');
const addRootBtn = document.getElementById('addRoot');
const searchInput = document.getElementById('search');
const importBtn = document.getElementById('importBtn');
const clearBtn = document.getElementById('clearBtn');

const detailPanel = document.getElementById('detailPanel');
const detailEmpty = document.getElementById('detailEmpty');
const detailTitle = document.getElementById('detailTitle');
const detailNotes = document.getElementById('detailNotes');
const attachmentsEl = document.getElementById('attachments');
const attachmentUrl = document.getElementById('attachmentUrl');
const addAttachmentBtn = document.getElementById('addAttachment');
const saveTitleBtn = document.getElementById('saveTitle');
const deleteNodeBtn = document.getElementById('deleteNode');

let tree = [];
let selectedId = null;

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function makeNode(title){
  return { id: genId(), title: title||'Untitled', children: [], notes:'', attachments: [], checked:false, collapsed:false };
}

function jsonToTree(obj){
  // obj can be an object mapping -> arrays or nested objects
  const nodes = [];
  for(const key of Object.keys(obj)){
    const val = obj[key];
    const node = makeNode(key);
    if(Array.isArray(val)){
      val.forEach(item=>{
        if(typeof item === 'string') node.children.push(makeNode(item));
        else if(typeof item === 'object'){
          // nested object within array -> merge children
          Object.keys(item).forEach(k=>{
            const sub = makeNode(k);
            const v = item[k];
            if(Array.isArray(v)) v.forEach(x=>{ if(typeof x==='string') sub.children.push(makeNode(x)); else if(typeof x==='object') sub.children.push(...jsonToTree(x)); });
            node.children.push(sub);
          });
        }
      });
    } else if(typeof val === 'object'){
      // nested object
      node.children.push(...jsonToTree(val));
    }
    nodes.push(node);
  }
  return nodes;
}

// Save whole tree to DB
function saveTree(){
  set(ref(db,'notes'), tree).catch(err=>console.error('save error',err));
}

function clearDB(){
  if(!confirm('Clear all notes in the database?')) return;
  remove(ref(db,'notes'));
}

// Listen for realtime changes
onValue(ref(db,'notes'), snap=>{
  const val = snap.val();
  if(val) tree = val;
  else tree = [];
  render();
});

// Utilities
function findById(id, nodes = tree, parent=null){
  for(const n of nodes){
    if(n.id === id) return {node:n, parent};
    if(n.children && n.children.length){
      const res = findById(id, n.children, n);
      if(res) return res;
    }
  }
  return null;
}

function removeById(id, nodes = tree){
  for(let i=0;i<nodes.length;i++){
    if(nodes[i].id === id){ nodes.splice(i,1); return true; }
    if(nodes[i].children && removeById(id, nodes[i].children)) return true;
  }
  return false;
}

function allChildrenChecked(node){
  if(!node.children || node.children.length===0) return node.checked;
  return node.children.every(c=>allChildrenChecked(c));
}

function setChecked(node, value){
  node.checked = value;
  if(node.children) node.children.forEach(c=>setChecked(c, value));
}

function updateParentsChecked(id){
  const res = findById(id);
  if(!res) return;
  // climb up via parent links by searching whole tree
  function updateParentFor(nodeId, nodes = tree){
    for(const n of nodes){
      if(n.children && n.children.some(c=>c.id===nodeId)){
        n.checked = n.children.every(c=>allChildrenChecked(c));
        updateParentFor(n.id, tree);
        return;
      }
      if(n.children) updateParentFor(nodeId, n.children);
    }
  }
  updateParentFor(id);
}

// Rendering
function createNodeEl(node){
  const el = document.createElement('div'); el.className='node';
  const left = document.createElement('div'); left.className='title';
  const checkbox = document.createElement('input'); checkbox.type='checkbox'; checkbox.checked = !!node.checked;
  checkbox.addEventListener('change', ()=>{
    setChecked(node, checkbox.checked);
    updateParentsChecked(node.id);
    saveTree();
  });

  const label = document.createElement('div'); label.textContent = node.title; label.style.cursor='pointer';
  label.addEventListener('click', ()=>selectNode(node.id));

  const actions = document.createElement('div'); actions.className='actions';
  const addBtn = document.createElement('button'); addBtn.textContent = '+'; addBtn.title='Add child';
  addBtn.addEventListener('click', (e)=>{ e.stopPropagation(); const title = prompt('Child title'); if(title){ node.children = node.children||[]; node.children.push(makeNode(title)); saveTree(); } });
  const editBtn = document.createElement('button'); editBtn.textContent='✎'; editBtn.title='Rename'; editBtn.addEventListener('click',(e)=>{ e.stopPropagation(); const name = prompt('Rename to', node.title); if(name){ node.title = name; saveTree(); }});
  const remBtn = document.createElement('button'); remBtn.textContent='🗑'; remBtn.title='Remove'; remBtn.addEventListener('click',(e)=>{ e.stopPropagation(); if(confirm('Remove this node and all children?')){ removeById(node.id); saveTree(); if(selectedId===node.id){ selectedId=null; showEmpty(); } }});

  actions.append(addBtn, editBtn, remBtn);

  left.append(checkbox,label);
  el.append(left, actions);

  if(node.children && node.children.length){
    const childrenWrap = document.createElement('div'); childrenWrap.className='children';
    node.children.forEach(child=>{
      childrenWrap.appendChild(createNodeEl(child));
    });
    el.appendChild(childrenWrap);
  }
  return el;
}

function render(filter){
  treeEl.innerHTML='';
  const nodesToShow = filter ? filterTree(tree, filter) : tree;
  nodesToShow.forEach(n=>treeEl.appendChild(createNodeEl(n)));
  if(selectedId) renderDetail(selectedId);
}

function filterTree(nodes, q){
  const out = [];
  for(const n of nodes){
    const copy = {...n, children: []};
    if(n.title.toLowerCase().includes(q)){
      // include whole subtree
      copy.children = n.children || [];
      out.push(copy);
    } else if(n.children && n.children.length){
      const ch = filterTree(n.children, q);
      if(ch.length) { copy.children = ch; out.push(copy); }
    }
  }
  return out;
}

function selectNode(id){ selectedId = id; renderDetail(id); }

function showEmpty(){ detailPanel.classList.add('hidden'); detailEmpty.classList.remove('hidden'); }

function renderDetail(id){
  const found = findById(id);
  if(!found){ showEmpty(); return; }
  const node = found.node;
  detailEmpty.classList.add('hidden'); detailPanel.classList.remove('hidden');
  detailTitle.value = node.title || '';
  detailNotes.value = node.notes || '';
  attachmentsEl.innerHTML='';
  (node.attachments||[]).forEach((a,idx)=>{
    const wrap = document.createElement('div'); wrap.className='attachment';
    const link = document.createElement('a'); link.href = a; link.textContent = a; link.target='_blank';
    const rem = document.createElement('button'); rem.textContent='Remove'; rem.addEventListener('click', ()=>{ node.attachments.splice(idx,1); saveTree(); renderDetail(id); });
    wrap.append(link, rem); attachmentsEl.appendChild(wrap);
  });
}

addRootBtn.addEventListener('click', ()=>{
  const title = prompt('Root topic title'); if(title){ tree.push(makeNode(title)); saveTree(); }
});

saveTitleBtn.addEventListener('click', ()=>{
  if(!selectedId) return; const found = findById(selectedId); if(!found) return; found.node.title = detailTitle.value || found.node.title; found.node.notes = detailNotes.value; saveTree(); render();
});

addAttachmentBtn.addEventListener('click', ()=>{
  const url = attachmentUrl.value.trim(); if(!url || !selectedId) return; const found = findById(selectedId); if(!found) return; found.node.attachments = found.node.attachments||[]; found.node.attachments.push(url); attachmentUrl.value=''; saveTree(); renderDetail(selectedId);
});

deleteNodeBtn.addEventListener('click', ()=>{
  if(!selectedId) return; if(!confirm('Delete selected node and children?')) return; removeById(selectedId); saveTree(); selectedId=null; showEmpty(); render();
});

searchInput.addEventListener('input', e=>{
  const q = e.target.value.trim().toLowerCase(); render(q? q: null);
});

importBtn.addEventListener('click', async ()=>{
  if(!confirm('Import sample JSON from system-design.json into database (overwrites current notes)?')) return;
  try{
    const res = await fetch('system-design.json');
    const data = await res.json();
    const converted = jsonToTree(data);
    tree = converted;
    saveTree();
    alert('Imported sample JSON to database under /notes');
  } catch(err){ console.error(err); alert('Import failed: '+err.message); }
});

clearBtn.addEventListener('click', ()=>clearDB());

// initial render
render();
