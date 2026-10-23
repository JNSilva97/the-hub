// Account-note transport tests use only public fixtures and fake identities.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready } = require('./browser-fixture.cjs');
const initialId = '10000000-0000-4000-8000-000000000001';
const remoteId = '10000000-0000-4000-8000-000000000002';
const initialNote = {version:1,id:initialId,parent:'',text:'Shared idea\nOriginal text',updatedAt:1,retired:false};
async function accountNotes(page) {
  await ready(page); await page.locator('[data-icon="notes"]').click();
  await page.waitForFunction(()=>document.getElementById('notes-source').textContent.includes('YOUR ACCOUNT')&&!document.getElementById('note-text').readOnly);
}
async function synced(page) { await page.waitForFunction(()=>document.getElementById('notes-status').textContent==='Synced to your account.'); }

test('Account notes', {timeout:90000}, async t=>{
  const browser=await chromium.launch({channel:'chrome',headless:true}); t.after(()=>browser.close());
  await t.test('autosaves, replaces immutable versions, receives remote changes and clears account text on sign-out', async()=>{
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce',width:390});
    try {
      await accountNotes(page); await page.locator('#note-text').fill('PC idea\nFirst draft'); await synced(page);
      const first=await page.locator('#note-list [aria-pressed="true"]').getAttribute('data-note');
      await page.locator('#note-text').fill('PC idea\nUpdated draft'); await synced(page);
      const second=await page.locator('#note-list [aria-pressed="true"]').getAttribute('data-note');
      assert.notEqual(first,second);
      assert.deepEqual(await page.evaluate(()=>Object.values(window.__hubFirebase.docs['account-a'].notes).filter(n=>!n.retired).map(n=>n.text)),['PC idea\nUpdated draft']);
      await page.evaluate(({id,parent})=>{const service=window.__hubFirebase; delete service.docs['account-a'].notes[parent]; service.docs['account-a'].notes[id]={version:1,id,parent,text:'Phone edit',updatedAt:Date.now()+1,retired:false};service.publish();},{id:remoteId,parent:second});
      await page.waitForFunction(()=>document.getElementById('note-text').value==='Phone edit');
      assert.equal(await page.locator('#notes-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      await page.evaluate(()=>{window.__hubFirebase.user=null;window.__hubFirebase.authListener(null);});
      await page.waitForFunction(()=>document.getElementById('notes-source').textContent.includes('THIS BROWSER'));
      assert.equal(await page.locator('#note-list').textContent().then(text=>text.includes('Phone edit')),false);
      assert.notEqual(await page.locator('#note-text').inputValue(),'Phone edit');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await t.test('concurrent offline edits keep both versions; restored device drafts retain text after reload',async()=>{
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce',cloudDocuments:{'account-a':{notes:{[initialId]:initialNote}}}});
    try {
      await accountNotes(page);
      await page.evaluate(()=>{window.__hubFirebase.holdNotes=true;});
      await page.locator('#note-text').fill('PC offline edit');
      await page.waitForFunction(()=>window.__hubFirebase.heldNotes.length>0);
      await page.evaluate(({id,parent})=>{const service=window.__hubFirebase;delete service.docs['account-a'].notes[parent];service.docs['account-a'].notes[id]={version:1,id,parent,text:'Phone offline edit',updatedAt:Date.now(),retired:false};service.publish();},{id:remoteId,parent:initialId});
      await page.waitForFunction(()=>document.querySelectorAll('#note-list button').length===2);
      assert.equal(await page.locator('#note-text').inputValue(),'PC offline edit');
      assert.match(await page.locator('#notes-status').textContent(),/Saved on device/);
      assert.equal(await page.locator('#account-logout').isDisabled(),true);
      await page.evaluate(()=>{window.__hubFirebase.heldNotes.splice(0).forEach(finish=>finish());}); await synced(page);
      assert.deepEqual(await page.evaluate(()=>Object.values(window.__hubFirebase.docs['account-a'].notes).filter(n=>!n.retired).map(n=>n.text).sort()),['PC offline edit','Phone offline edit']);
      await page.evaluate(()=>{window.__hubFirebase.holdNotes=true;});
      await page.locator('#note-text').fill('Durable next draft');
      await page.waitForFunction(()=>document.getElementById('notes-status').textContent.startsWith('Saved on device.'));
      await page.reload();await page.locator('[data-icon="notes"]').click();
      await page.waitForFunction(()=>document.getElementById('note-list').textContent.includes('Durable next draft'));
      await page.getByRole('button',{name:'Durable next draft Open and keep writing'}).click();
      assert.equal(await page.locator('#note-text').inputValue(),'Durable next draft');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await t.test('local import confirms its destination, skips sample notes and leaves local originals intact',async()=>{
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce',width:320});
    try {
      await context.addInitScript(note=>localStorage.setItem('thehub:notes:demo:v1:'+note.id,JSON.stringify(note)),initialNote);
      await accountNotes(page);
      assert.equal(await page.evaluate(()=>window.__hubFirebase.noteWrites.length),0);
      await page.locator('#notes-import').click();
      assert.match(await page.locator('#notes-import-description').textContent(),/Copy 1 saved local note/);
      assert.match(await page.locator('#notes-import-description').textContent(),/test@example.invalid/);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>window.__hubFirebase.noteWrites.length),0);
      await page.locator('#notes-import').click();await page.locator('#notes-import-confirm').click(); await synced(page);
      assert.equal(await page.evaluate(()=>Object.values(window.__hubFirebase.docs['account-a'].notes).filter(n=>!n.retired).length),1);
      assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('thehub:notes:demo:v1:'+id)).text,initialId),initialNote.text);
      await page.locator('#notes-import').click();assert.equal(await page.locator('#notes-import-confirm').isDisabled(),true);
      await page.keyboard.press('Escape');await page.locator('#notes-local').click();
      assert.match(await page.locator('#notes-source').textContent(),/THIS BROWSER/);
      assert.equal(await page.locator('#note-text').inputValue(),initialNote.text);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await t.test('account deletion confirms all devices, preserves concurrent edits and supports undo',async()=>{
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce',cloudDocuments:{'account-a':{notes:{[initialId]:initialNote}}}});
    try {
      await accountNotes(page); await page.locator('#note-delete').click();
      assert.match(await page.locator('#note-delete-description').textContent(),/all devices/);
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__hubFirebase.noteWrites.length),0);
      await page.locator('#note-delete').click();await page.locator('#note-delete-confirm').click();await synced(page);
      assert.equal(await page.evaluate(()=>Object.values(window.__hubFirebase.docs['account-a'].notes).filter(n=>!n.retired).length),0);
      await page.locator('#note-undo-delete').click();await synced(page);
      assert.deepEqual(await page.evaluate(()=>Object.values(window.__hubFirebase.docs['account-a'].notes).filter(n=>!n.retired).map(n=>n.text)),[initialNote.text]);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await t.test('failed storage and denied writes keep the draft, guard exit and retry without publishing local notes',async()=>{
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce'});
    try {
      await accountNotes(page); await page.evaluate(()=>{window.__hubFirebase.rejectNotes=true;window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('full');};});
      await page.locator('#note-text').fill('Keep this draft');
      await page.waitForFunction(()=>document.getElementById('notes-status').textContent.includes('have not synced'));
      assert.equal(await page.locator('#note-text').inputValue(),'Keep this draft');
      assert.equal(await page.evaluate(()=>!dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
      assert.equal(await page.locator('#account-logout').isDisabled(),true);
      await page.evaluate(()=>{const service=window.__hubFirebase;for(const listener of service.noteListeners)listener.failed(new Error('Connection access failed'));service.noteListeners.clear();});
      await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;window.__hubFirebase.rejectNotes=false;});
      await page.locator('#notes-retry').click();await synced(page);
      assert.equal(await page.locator('#note-text').inputValue(),'Keep this draft');
      assert.equal(await page.evaluate(()=>!dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
      assert.equal(await page.locator('#account-logout').isDisabled(),false);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await t.test('missing notes rules leave the local notebook usable and never upload it automatically',async()=>{
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce'});
    try {
      await context.addInitScript(note=>localStorage.setItem('thehub:notes:demo:v1:'+note.id,JSON.stringify(note)),initialNote);
      await accountNotes(page);
      await page.evaluate(()=>{const service=window.__hubFirebase;for(const listener of service.noteListeners)listener.failed(new Error('Permission denied'));service.noteListeners.clear();});
      await page.waitForFunction(()=>document.getElementById('notes-source').textContent.includes('THIS BROWSER'));
      assert.equal(await page.locator('#note-text').inputValue(),initialNote.text);
      await page.locator('#note-text').fill('Local notes still work');
      assert.match(await page.locator('#notes-status').textContent(),/Firebase notes rules/);
      assert.equal(await page.evaluate(()=>window.__hubFirebase.noteWrites.length),0);
      assert.equal(await page.locator('#note-text').getAttribute('readonly'),null);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
  await t.test('a delayed journal retry cannot resurrect a retired version or its old text',async()=>{
    const current={...initialNote,id:remoteId,parent:initialId,text:'Current version'};
    const {context,page,errors}=await fixture(browser,{firebase:true,motion:'reduce',cloudDocuments:{'account-a':{notes:{[initialId]:{version:1,id:initialId,retired:true},[remoteId]:current}}}});
    try {
      await context.addInitScript(note=>localStorage.setItem('thehub:notes:account:account-a:v1:'+note.id,JSON.stringify({...note,deleted:false,submitted:true,writer:'previous-tab'})),initialNote);
      await accountNotes(page);await synced(page);
      assert.equal(await page.locator('#note-list button').count(),1);
      assert.equal(await page.locator('#note-text').inputValue(),'Current version');
      assert.deepEqual(await page.evaluate(id=>window.__hubFirebase.docs['account-a'].notes[id],initialId),{version:1,id:initialId,retired:true});
      assert.equal(await page.evaluate(id=>localStorage.getItem('thehub:notes:account:account-a:v1:'+id),initialId),null);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
});
