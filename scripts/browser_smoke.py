import argparse, json, subprocess, os

# End-to-end checks run against the production build on a real HTTP origin.
# Only Chromium is claimed; touch is browser emulation, not a hardware-device lab.
parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--output", default="browser-report")
args = parser.parse_args()
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(args.output).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
KEY='midi-spark:session:v1'
fixture=OUTPUT/'two-tracks.mid'
subprocess.run(['node','-e', "const fs=require('fs'),{Midi}=require('@tonejs/midi');const m=new Midi();m.header.setTempo(108);const k=m.addTrack();k.name='Keys';k.channel=0;k.instrument.number=4;[[60,0],[64,480],[67,960]].forEach(([midi,ticks])=>k.addNote({midi,ticks,durationTicks:360,velocity:.8}));const b=m.addTrack();b.name='Bass';b.channel=1;b.instrument.number=33;[[48,0],[43,960]].forEach(([midi,ticks])=>b.addNote({midi,ticks,durationTicks:720,velocity:.7}));const e=m.addTrack();e.name='Empty pad';e.channel=2;e.instrument.number=89;fs.writeFileSync(process.argv[1],Buffer.from(m.toArray()));",str(fixture)],cwd=ROOT,check=True)
take_fixture=OUTPUT/'take-melody.mid'
subprocess.run(['node','-e',
 "const fs=require('fs'),{Midi}=require('@tonejs/midi');const m=new Midi();const t=m.addTrack();t.name='Lead';[[72,0],[76,960],[79,1440],[74,1920],[77,2880],[76,3840],[79,4800],[72,5760],[74,6720]].forEach(([midi,ticks])=>t.addNote({midi,ticks,durationTicks:480,velocity:.8}));fs.writeFileSync(process.argv[1],Buffer.from(m.toArray()));",
 str(take_fixture)],cwd=ROOT,check=True)
meter_fixture=OUTPUT/'three-four.mid'
subprocess.run(['node','-e', "const fs=require('fs'),{Midi}=require('@tonejs/midi');const m=new Midi();m.header.timeSignatures.push({ticks:0,timeSignature:[3,4]});m.header.update();m.addTrack().addNote({midi:60,ticks:0,durationTicks:480,velocity:.8});fs.writeFileSync(process.argv[1],Buffer.from(m.toArray()));",str(meter_fixture)],cwd=ROOT,check=True)
results=[]
def record(name): results.append(name); print('PASS',name,flush=True)
def snap(page):
 page.wait_for_timeout(500)
 return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
def confirm_replacement_if_present(page):
 dialog=page.locator('dialog.replace-project-dialog')
 if dialog.count() and dialog.is_visible():
  dialog.locator('.replace-project-actions .danger-action').click()
  expect(dialog).not_to_be_visible()
def import_fixture(page):
 page.locator('input[type=file]').first.set_input_files(str(fixture));page.wait_for_timeout(650)
 confirm_replacement_if_present(page)
 if page.get_by_role('button',name='Dismiss notification').count(): page.get_by_role('button',name='Dismiss notification').click()
def open_composer_group(page, selector):
 group=page.locator(selector).first
 expect(group.locator('summary').first).to_be_visible()
 if group.get_attribute('open') is None:
  group.locator('summary').first.click()
 expect(group).to_have_attribute('open','')

def assert_popup_topmost(page, selector, occluder=None):
 """Check actual hit-testing and viewport coverage, not just CSS z-index."""
 info=page.evaluate("""({selector,occluder}) => {
  const menu=document.querySelector(selector);
  if(!menu)return {error:'Missing overlay '+selector};
  const box=menu.getBoundingClientRect();
  const within=(x,y)=>{
    const hit=document.elementFromPoint(x,y);
    return !!hit && menu.contains(hit);
  };
  const samples=[.18,.5,.82].map(f=>({
    x:Math.max(0,Math.min(innerWidth-1,box.left+box.width*.5)),
    y:Math.max(0,Math.min(innerHeight-1,box.top+box.height*f)),
  })).map(pt=>({...pt,onTop:within(pt.x,pt.y)}));
  let overlap=null;
  if(occluder){
    const blocker=document.querySelector(occluder);
    if(blocker){
      const b=blocker.getBoundingClientRect();
      const left=Math.max(box.left,b.left), right=Math.min(box.right,b.right);
      const top=Math.max(box.top,b.top), bottom=Math.min(box.bottom,b.bottom);
      if(right-left>5 && bottom-top>5){
        const x=(left+right)/2,y=(top+bottom)/2;
        overlap={x,y,onTop:within(x,y)};
      }
    }
  }
  return {
    inBody:menu.parentElement===document.body,
    panelZ:getComputedStyle(menu).zIndex,
    bounds:{left:box.left,top:box.top,right:box.right,bottom:box.bottom},
    viewport:{width:innerWidth,height:innerHeight},
    samples,overlap,
  };
 }""",{'selector':selector,'occluder':occluder})
 assert not info.get('error'),info
 b=info['bounds'];w=info['viewport']['width'];h=info['viewport']['height']
 assert info['inBody'] and float(info['panelZ'])>=150,info
 assert b['left']>=7 and b['right']<=w-7 and b['top']>=7 and b['bottom']<=h-7,info
 assert all(s['onTop'] for s in info['samples']),info
 assert not info['overlap'] or info['overlap']['onTop'],info
 return info

def grid_point(page,midi,quarter):
 grid=page.get_by_test_id('piano-grid').bounding_box(); zoom=snap(page)['zoomX'];height=grid['height']/128
 return grid['x']+quarter*zoom,grid['y']+(127-midi+.5)*height
with sync_playwright() as p:
 b=p.chromium.launch(headless=True, **({'executable_path': os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}))
 page=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1,has_touch=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.url);page.evaluate('document.fonts.ready')
 # Slate & Earth deliberately makes the editor light neutral gray while
 # retaining warm stone accents and an accessible dark graphite inspector.
 palette=page.evaluate("""() => {
  const rgb=(selector)=>Array.from(getComputedStyle(document.querySelector(selector))
    .backgroundColor.match(/\\d+/g) || []).slice(0,3).map(Number);
  return {
    editor:rgb('.editor-main'),
    piano:rgb('.piano-editor'),
    toolbar:rgb('.editor-toolbar'),
    canvasText:getComputedStyle(document.querySelector('.editor-main')).color,
    accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    button:getComputedStyle(document.querySelector('.generate-button')).backgroundImage
  };
 }""")
 assert min(palette['editor'])>185 and max(palette['editor'])-min(palette['editor'])<14, palette
 assert min(palette['piano'])>175 and max(palette['piano'])-min(palette['piano'])<14, palette
 assert min(palette['toolbar'])>190 and max(palette['toolbar'])-min(palette['toolbar'])<14, palette
 assert 'rgb(40, 46, 44)' in palette['canvasText'], palette
 assert palette['accent']=='#cfac88', palette
 assert 'linear-gradient' in palette['button']
 record('Slate & Earth: light neutral-gray editor with graphite ink and warm clay actions')
 # One vector ident must be used for browser tab, boot screen and studio header.
 # Generation actions have no decorative sparkle (or replacement) icon.
 icon_href=page.locator('link[rel="icon"]').get_attribute('href')
 assert icon_href=='favicon.svg?v=2'
 assert page.locator('.wordmark img.brand-mark').get_attribute('src')==icon_href
 assert page.locator('.wordmark img.brand-mark').evaluate('(img)=>img.complete && img.naturalWidth>0')
 assert page.request.get(args.url.rstrip('/')+'/'+icon_href).ok
 assert page.locator('.generate-button svg').count()==0
 assert page.locator('.empty-actions .primary-button svg').count()==0
 assert page.locator('.song-form-build svg').count()==0
 assert page.get_by_role('button',name='Generate pattern').count()>=1
 record('MIDI ident matches favicon/header; all generation buttons are icon-free')
 # The default Compose screen must prioritize essentials over dense specialist controls.
 assert page.locator('.composition-summary, .compose-panel .panel-intro, .empty-motif').count()==0
 assert page.locator('.song-form-disclosure').count()==0
 assert page.locator('.expression-disclosure').get_attribute('open') is None
 expect(page.locator('.compose-compact-intro h2')).to_have_text('Make music.')
 expect(page.get_by_role('button',name='Project menu')).to_be_visible()
 expect(page.get_by_role('button',name='Canvas view options')).to_be_visible()
 page.get_by_role('button',name='Canvas view options').click()
 expect(page.get_by_role('button',name='Zoom in')).to_be_visible()
 page.get_by_role('button',name='Canvas view options').press('Escape')
 expect(page.get_by_role('button',name='Zoom in')).not_to_be_visible()
 page.get_by_role('button',name='Project menu').click()
 expect(page.get_by_role('button',name='Import MIDI')).to_be_visible()
 page.get_by_role('button',name='Project menu').press('Escape')
 expect(page.get_by_role('button',name='Import MIDI')).not_to_be_visible()
 record('Focused composer keeps power tools folded while Project/View menus remain discoverable')
 # Actual visual stacking/interaction at desktop, mobile and 200%-zoom-like
 # viewports. Test over overlapping drawer/ruler pixels using elementFromPoint.
 for w,h in ((1440,900),(720,450),(390,844),(320,740),(320,360)):
  page.set_viewport_size({'width':w,'height':h})
  page.wait_for_timeout(80)
  drawer = w<=760
  if drawer:
   page.get_by_role('button',name='Toggle inspector',exact=True).click()
   expect(page.locator('#studio-inspector')).to_have_class('inspector is-open')
   page.wait_for_timeout(280)
  page.get_by_role('button',name='Project menu',exact=True).click()
  project_panel=page.locator('.floating-menu-panel.project-menu-content')
  expect(project_panel).to_be_visible()
  assert_popup_topmost(page,'.floating-menu-panel.project-menu-content',
    '#studio-inspector' if drawer else '.editor-toolbar')
  assert project_panel.get_by_role('button',name='Import MIDI').is_visible()
  if h==360:
   sizes=project_panel.evaluate('(el)=>({scroll:el.scrollHeight,visible:el.clientHeight})')
   assert sizes['scroll']>sizes['visible']+10,sizes
   project_panel.evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
   page.wait_for_timeout(120)
   assert project_panel.evaluate('(el)=>el.scrollTop')>10, 'Project menu cannot scroll on short viewport'
   assert_popup_topmost(page,'.floating-menu-panel.project-menu-content',
     '#studio-inspector' if drawer else '.editor-toolbar')
  if w==390: page.screenshot(path=str(OUTPUT/'project-menu-mobile-layer.png'))
  page.keyboard.press('Escape')
  expect(project_panel).not_to_be_visible()
  assert page.get_by_role('button',name='Project menu',exact=True).evaluate(
    '(el)=>document.activeElement===el')
  if drawer:
   page.get_by_role('button',name='Close inspector',exact=True).click()
   page.wait_for_timeout(300)
  page.get_by_role('button',name='Canvas view options',exact=True).click()
  view_panel=page.locator('.floating-menu-panel.canvas-view-menu-content')
  expect(view_panel).to_be_visible()
  assert_popup_topmost(page,'.floating-menu-panel.canvas-view-menu-content',
    '.piano-timeline' if page.locator('.piano-timeline').count() else '.piano-editor')
  assert view_panel.get_by_role('button',name='Zoom in').is_visible()
  if w==720: page.screenshot(path=str(OUTPUT/'view-menu-zoom-layer.png'))
  page.keyboard.press('Escape')
  expect(view_panel).not_to_be_visible()
  assert page.get_by_role('button',name='Canvas view options',exact=True).evaluate(
    '(el)=>document.activeElement===el')
 page.set_viewport_size({'width':1440,'height':900})
 page.get_by_role('button',name='Project menu').click()
 expect(page.locator('.floating-menu-panel.project-menu-content')).to_be_visible()
 page.get_by_role('heading',name='Piano roll').click()
 expect(page.locator('.floating-menu-panel.project-menu-content')).not_to_be_visible()
 record('Project/View menus stay topmost, in viewport, keyboard-accessible and dismiss correctly')

 # Primary sound choice must be visible without scrolling the desktop inspector.
 panel=page.locator('.inspector-panel:not([hidden])').bounding_box()
 trigger=page.locator('.sound-picker-trigger').first.bounding_box()
 assert trigger and panel and trigger['y']+trigger['height']<=panel['y']+panel['height']-16
 record('Sound selection is discoverable without inspector scrolling')
 # Numeric fields must allow incomplete intermediate text while typing.
 tempo=page.get_by_role('spinbutton',name='Tempo')
 tempo.focus()
 tempo.press('ControlOrMeta+A')
 page.keyboard.type('90')
 assert tempo.input_value()=='90'
 tempo.press('Enter')
 assert tempo.input_value()=='90'
 tempo.focus();tempo.press('ControlOrMeta+A');page.keyboard.type('140')
 assert tempo.input_value()=='140'
 tempo.press('Enter')
 assert tempo.input_value()=='140'
 tempo.focus();tempo.press('ControlOrMeta+A');page.keyboard.type('280')
 tempo.press('Escape')
 assert tempo.input_value()=='140'
 tempo.focus();tempo.press('ControlOrMeta+A');page.keyboard.type('900')
 tempo.press('Enter')
 assert tempo.input_value()=='300'
 tempo.focus();tempo.press('ControlOrMeta+A');page.keyboard.type('120');tempo.press('Enter')
 assert tempo.input_value()=='120'
 record('Tempo accepts multi-digit keyboard drafts, Enter commit, Escape cancel and range clamp')
 # Presets drive the same underlying sliders even while fine-tuning is folded.
 open_composer_group(page,'.expression-disclosure')
 # New composer shortcuts should update both fine-tuning controls without generating notes.
 page.get_by_role('button',name='Groove',exact=True).click()
 assert page.get_by_role('slider',name='Chord tension').input_value()=='34'
 assert page.get_by_role('slider',name='Rhythmic detail').input_value()=='58'
 page.get_by_role('button',name='Warm',exact=True).click()
 assert page.get_by_role('slider',name='Chord tension').input_value()=='12'
 assert page.get_by_role('slider',name='Rhythmic detail').input_value()=='18'
 open_composer_group(page,'.expression-disclosure')
 page.get_by_role('slider',name='Chord tension').fill('30')
 page.get_by_role('slider',name='Rhythmic detail').fill('20')
 record('Quick feel presets drive both expression controls and allow manual refinement')
 # Desktop inspector resize should work with a keyboard and mouse, not just look draggable.
 resizer=page.get_by_role('separator',name='Resize studio sidebar')
 resizer.focus()
 original_width=page.locator('#studio-inspector').bounding_box()['width']
 page.keyboard.press('ArrowRight')
 assert page.locator('#studio-inspector').bounding_box()['width'] > original_width
 box=resizer.bounding_box()
 page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
 page.mouse.down()
 page.mouse.move(box['x']+box['width']/2+34,box['y']+box['height']/2,steps=6)
 page.mouse.up()
 assert page.locator('#studio-inspector').bounding_box()['width'] > original_width+25
 resizer.dblclick()
 assert abs(page.locator('#studio-inspector').bounding_box()['width']-312) <= 2
 dock=page.locator('.compose-actions').bounding_box()
 panel=page.locator('.inspector-panel:not([hidden])').bounding_box()
 assert dock['y'] >= panel['y'] and dock['y']+dock['height'] <= panel['y']+panel['height']+2
 record('Keyboard and pointer sidebar resizing, reset, and pinned generation dock')
 # Curated preset library: search, category filtering, independent preview,
 # selection, and saved instrument state, all in the real browser.
 page.get_by_role('button',name='Preview sound: Classic Analog. Open sound library').click()
 expect(page.get_by_role('dialog',name='Sound library')).to_be_visible()
 assert page.locator('.sound-library-row').count()==49
 expect(page.get_by_role('status').filter(has_text='49 of 49 sounds')).to_be_visible()
 page.get_by_role('searchbox',name='Search presets').fill('no-such-instrument-x')
 assert page.locator('.sound-library-row').count()==0
 expect(page.get_by_role('status').filter(has_text='0 of 49 sounds')).to_be_visible()
 page.get_by_role('button',name='Clear filters',exact=True).click()
 assert page.locator('.sound-library-row').count()==49
 record('Sound-search result count, empty state and clear-filters are discoverable')
 page.get_by_role('button',name='Keys',exact=True).click()
 assert page.locator('.sound-library-row').count()==8
 page.get_by_role('searchbox',name='Search presets').fill('glass piano')
 assert page.locator('.sound-library-row').count()==1
 page.get_by_role('button',name='Preview Glass Piano',exact=True).click()
 page.locator('.sound-library-select').filter(has_text='Glass Piano').click()
 expect(page.get_by_role('dialog',name='Sound library')).not_to_be_visible()
 assert 'Glass Piano' in page.locator('.sound-picker-title').first.inner_text()
 page.wait_for_timeout(650)
 assert snap(page)['synthType']=='glass'
 record('49 expressive sounds remain searchable, categorized, auditionable and persistent')
 page.locator('.sound-picker-trigger').first.click()
 expect(page.get_by_role('dialog',name='Sound library')).to_be_visible()
 # A representative sweep through every synthesis architecture and each
 # preset's actual audio constructors catches Web Audio graph failures.
 page.get_by_role('button',name='All',exact=True).click()
 page.get_by_role('searchbox',name='Search presets').fill('')
 assert page.locator('.sound-library-row').count()==49
 prior=snap(page)['synthType']
 for i in range(49):
  page.locator('.sound-library-row-play').nth(i).click()
  page.wait_for_timeout(60)
 assert snap(page)['synthType']==prior
 assert page.get_by_text('Audio preview could not start',exact=False).count()==0
 record('All 49 preset engines and modulation graphs audition without changing the selected sound')
 page.get_by_role('button',name='Motion & Experimental',exact=True).click()
 assert page.locator('.sound-library-row').count()==3
 page.get_by_role('searchbox',name='Search presets').fill('wow')
 assert page.locator('.sound-library-row').count()==1
 assert 'Magnetic Warble' in page.locator('.sound-library-row').first.inner_text()
 page.get_by_role('searchbox',name='Search presets').fill('')
 page.get_by_role('button',name='All',exact=True).click()
 record('Timbral and modulation descriptors are searchable, including experimental sounds')
 page.locator('.inspector-panel:not([hidden])').evaluate("(el) => { el.scrollTop += 40; el.dispatchEvent(new Event('scroll')); }")
 expect(page.get_by_role('dialog',name='Sound library')).to_be_visible()
 page.keyboard.press('Escape')
 expect(page.get_by_role('dialog',name='Sound library')).not_to_be_visible()
 record('Sound library remains open during inspector scrolling')
 page.screenshot(path=str(OUTPUT/'empty-desktop.png'))
 page.get_by_role('button',name='Start blank',exact=True).click();page.wait_for_timeout(250)
 x,y=grid_point(page,60,1)
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+80,y,steps=5);page.wait_for_timeout(80);page.mouse.up()
 assert page.get_by_test_id('piano-note').count()==1
 assert page.locator('.piano-key-white').first.evaluate("(el) => getComputedStyle(el).backgroundColor")=='rgb(236, 238, 233)'
 assert page.locator('.piano-key-black').first.evaluate("(el) => getComputedStyle(el).backgroundColor")=='rgb(70, 76, 74)'
 record('Light piano keys retain distinct dark/white-note surfaces')
 record('Mouse draw commits one note without waiting for audio startup')
 # Merely selecting a note must not add a redundant undo operation.
 page.get_by_role('button',name='Select tool').click()
 page.get_by_test_id('note-move').first.click()
 page.get_by_role('button',name='Undo',exact=True).click();assert page.get_by_test_id('piano-note').count()==0
 page.get_by_role('button',name='Redo',exact=True).click();assert page.get_by_test_id('piano-note').count()==1
 record('Selection click does not consume undo; undo/redo restores the gesture')
 before=snap(page)['progression']['notes']
 box=page.get_by_test_id('note-move').first.bounding_box();page.mouse.move(box['x']+6,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+65,box['y']-14,steps=5);page.wait_for_timeout(60);page.mouse.up()
 after=snap(page)['progression']['notes'];assert before!=after
 page.get_by_role('button',name='Undo',exact=True).click();assert snap(page)['progression']['notes']==before
 record('Drag moves note pitch/timing as one reversible gesture')
 box=page.get_by_test_id('note-resize').first.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+100,box['y']+box['height']/2,steps=5);page.wait_for_timeout(60);page.mouse.up()
 assert snap(page)['progression']['notes'][0]['duration']>before[0]['duration']
 page.get_by_role('button',name='Undo',exact=True).click();assert snap(page)['progression']['notes']==before
 record('Resize changes duration and undoes as one step')
 page.get_by_role('button',name='Draw tool').click();x,y=grid_point(page,64,2)
 cdp=page.context.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});page.wait_for_timeout(50)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+40,'y':y}]});page.wait_for_timeout(60)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(80)
 assert page.get_by_test_id('piano-note').count()==2
 record('Real CDP touch drawing commits one note')
 x,y=grid_point(page,65,3)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});page.wait_for_timeout(50)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+30,'y':y}]});page.wait_for_timeout(60)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});page.wait_for_timeout(80)
 assert page.get_by_test_id('piano-note').count()==2
 record('Cancelled touch gesture leaves no phantom note')
 page.get_by_role('button',name='Hand tool').click();before_scroll=page.get_by_role('region',name='Piano roll canvas').evaluate('el=>el.scrollTop')
 x,y=grid_point(page,60,2);page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-30,y-50,steps=5);page.mouse.up()
 after_scroll=page.get_by_role('region',name='Piano roll canvas').evaluate('el=>el.scrollTop')
 assert after_scroll>before_scroll
 record('Hand tool pans without editing notes')
 # Occupied project imports must not silently replace the note work or
 # mixer state. Cancel must preserve the entire current session.
 old_project=snap(page)
 page.locator('input[type=file]').first.set_input_files(str(fixture))
 expect(page.get_by_role('dialog',name='Replace current composition?')).to_be_visible()
 assert snap(page)['progression']==old_project['progression']
 assert snap(page)['trackMix']==old_project['trackMix']
 assert page.get_by_role('button',name='Keep current work',exact=True).evaluate('(el)=>document.activeElement===el')
 page.get_by_role('button',name='Keep current work',exact=True).click()
 assert snap(page)['progression']==old_project['progression']
 record('Import replacement confirmation cancels safely without altering an existing composition')
 import_fixture(page);original=snap(page)['progression']['notes'];assert len(original)==5
 page.get_by_role('combobox',name='Edit track',exact=True).select_option('1')
 assert 'Edit: Bass' in page.locator('.edit-target-indicator').inner_text()
 page.get_by_role('tab',name='Transform',exact=True).click()
 page.get_by_role('button',name='Transpose up 1 semitones',exact=True).click()
 after=snap(page)['progression']['notes']
 for a,n in zip(original,after): assert n['midi']==a['midi']+(1 if a['trackIndex']==1 else 0)
 record('Focused-track transpose changes only visible notes')
 page.get_by_role('combobox',name='Edit track',exact=True).select_option('2')
 expect(page.get_by_role('button',name='Apply quantize',exact=True)).to_be_disabled()
 open_composer_group(page,'.transform-more-disclosure')
 expect(page.get_by_role('button',name='Apply humanize',exact=True)).to_be_disabled()
 assert snap(page)['progression']['notes']==after
 record('Empty-track transforms are disabled, never affect hidden notes')
 page.get_by_role('combobox',name='Edit track',exact=True).select_option('all')
 assert page.locator('.edit-target-indicator').inner_text().startswith('New → ')
 record('Focused track is visible and All-tracks drawing target is explicit')
 page.get_by_role('tab',name='Tracks',exact=True).click()
 bass_strip=page.locator('section.track-strip').filter(has_text='Bass').first
 bass_strip.locator('.track-settings-disclosure > summary').click()
 bass_strip.locator('.sound-picker-trigger').click()
 page.get_by_role('button',name='Bass',exact=True).click()
 page.get_by_role('searchbox',name='Search presets').fill('digital bass')
 assert page.locator('.sound-library-row').count()==1
 page.locator('.sound-library-select').filter(has_text='Digital Bass').click()
 page.wait_for_timeout(550)
 assert snap(page)['trackMix']['1']['synthType']=='fmBass'
 expect(bass_strip.get_by_text('Browser playback sound',exact=False)).to_be_visible()
 expect(bass_strip.get_by_text('GM program 34',exact=False)).to_be_visible()
 record('Track picker discloses browser-only sound and exported GM instrument program')
 record('Track mixer chooses independent expanded presets with audition')
 page.get_by_role('button',name='Mute Bass',exact=True).click();assert snap(page)['trackMix']['1']['muted']
 page.get_by_role('button',name='Solo Keys',exact=True).click();assert snap(page)['trackMix']['0']['solo']
 keys_strip=page.locator('section.track-strip').filter(has_text='Keys').first
 keys_strip.locator('.track-settings-disclosure > summary').click()
 page.get_by_role('slider',name='Keys volume',exact=True).fill('35');assert snap(page)['trackMix']['0']['level']==.35
 record('Track mute, solo and volume persist without altering MIDI notes')
 page.get_by_role('button',name='Play pattern',exact=True).click();page.wait_for_timeout(600)
 expect(page.get_by_role('button',name='Pause playback',exact=True)).to_be_visible()
 page.get_by_role('button',name='Pause playback',exact=True).click()
 expect(page.get_by_role('button',name='Resume playback',exact=True)).to_be_visible()
 page.get_by_role('button',name='Resume playback',exact=True).click()
 expect(page.get_by_role('button',name='Pause playback',exact=True)).to_be_visible()
 page.get_by_role('button',name='Stop playback',exact=True).click()
 expect(page.get_by_role('button',name='Play pattern',exact=True)).to_be_visible()
 record('Browser playback starts, pauses, resumes and stops without errors')
 page.get_by_role('region',name='Piano roll canvas').focus();page.keyboard.press('?')
 expect(page.get_by_role('dialog')).to_be_visible();page.keyboard.press('Tab')
 assert page.evaluate('document.querySelector("dialog").contains(document.activeElement)')
 page.keyboard.press('Escape');expect(page.get_by_role('dialog')).not_to_be_visible()
 record('Shortcut dialog traps focus and Escape dismisses')
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Toggle inspector',exact=True).click()
 expect(page.get_by_role('tab',name='Compose',exact=True)).to_be_visible();page.get_by_role('tab',name='Compose',exact=True).click();page.keyboard.press('ArrowRight')
 expect(page.get_by_role('tab',name='Transform',exact=True)).to_have_attribute('aria-selected','true')
 page.keyboard.press('Escape');expect(page.get_by_role('tab',name='Compose',exact=True)).not_to_be_visible()
 record('Mobile inspector opens, arrow-navigates tabs and closes with Escape')
 # Real browser localStorage restoration, not an in-memory test double.
 page.set_viewport_size({'width':1440,'height':900})
 saved=snap(page)
 page.reload();page.wait_for_timeout(650)
 restored=snap(page)
 assert restored['progression']['notes']==saved['progression']['notes']
 assert restored['trackMix']==saved['trackMix']
 record('Real-origin reload restores MIDI and mixer preferences')
 with page.expect_download() as download_info:
  page.get_by_role('button',name='Export MIDI',exact=True).click()
 exported=OUTPUT/'exported.mid'
 download_info.value.save_as(str(exported))
 assert exported.read_bytes().startswith(b'MThd')
 page.locator('input[type=file]').first.set_input_files(str(exported));page.wait_for_timeout(650)
 confirm_replacement_if_present(page)
 roundtrip=snap(page)['progression']
 assert len(roundtrip['notes'])==len(saved['progression']['notes'])
 assert [t['name'] for t in roundtrip['tracks']]==['Keys','Bass','Empty pad']
 assert roundtrip['tracks'][0]['program']==4
 assert roundtrip['tracks'][1]['program']==33
 record('Real MIDI download retains original GM programs despite changed browser sounds')
 # Test the complete canvas, not an empty-page screenshot.
 page.get_by_role('tab',name='Compose',exact=True).click()
 page.get_by_role('combobox',name='Root key',exact=True).select_option('D')
 page.get_by_role('combobox',name='Scale mode',exact=True).select_option('minor')
 open_composer_group(page,'.expression-disclosure')
 page.get_by_role('slider',name='Chord tension',exact=True).fill('48')
 page.get_by_role('slider',name='Rhythmic detail',exact=True).fill('55')
 page.get_by_role('button',name='Generate pattern',exact=False).click()
 confirm_replacement_if_present(page)
 page.wait_for_timeout(600)
 if page.get_by_role('button',name='Dismiss notification').count(): page.get_by_role('button',name='Dismiss notification').click()
 # Scratch generation also asks permission before overwriting a scored
 # arrangement, rather than hiding destructive replacement behind Undo.
 page.get_by_role('tab',name='Compose',exact=True).click()
 old_for_generation=snap(page)
 page.get_by_role('button',name='Generate pattern',exact=False).click()
 expect(page.get_by_role('dialog',name='Start a new pattern?')).to_be_visible()
 assert snap(page)['progression']==old_for_generation['progression']
 page.get_by_role('button',name='Keep current work',exact=True).click()
 assert snap(page)['progression']==old_for_generation['progression']
 record('Scratch generation requires explicit consent and Cancel preserves existing MIDI')
 # Select bars 2–3 by Shift-dragging the ruler. The loop range is session-local.
 timeline=page.locator('.piano-timeline').last
 ruler=timeline.bounding_box();zoom=snap(page)['zoomX']
 assert ruler and zoom>0
 y=ruler['y']+13
 page.keyboard.down('Shift')
 page.mouse.move(ruler['x']+4*zoom,y);page.mouse.down()
 page.mouse.move(ruler['x']+8*zoom,y,steps=8);page.mouse.up()
 page.keyboard.up('Shift')
 region=snap(page)['loopRegion']
 assert region and abs(region['start']-4)<.01 and abs(region['end']-8)<.01,region
 record('Shift+drag selects a real quarter-note loop region without editing notes')
 page.get_by_role('slider',name='Loop out',exact=True).press('ArrowLeft')
 updated=snap(page)['loopRegion']
 assert abs(updated['end']-(region['end']-.25))<.01,updated
 record('Loop marker adjusts with accessible keyboard arrow controls')
 # Cancelling a touch drag must not commit an invisible loop change.
 handle=page.get_by_test_id('loop-out').bounding_box()
 assert handle
 px=handle['x']+handle['width']-5;py=handle['y']+15
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':px,'y':py}]})
 page.wait_for_timeout(40)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':px-30,'y':py}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
 assert snap(page)['loopRegion']==updated
 record('Cancelled touch resize leaves loop region unchanged')
 page.get_by_role('button',name='Loop playback').click()
 assert snap(page)['isLooping'] is False
 page.get_by_role('button',name='Loop playback').click()
 assert snap(page)['isLooping'] is True
 page.reload();page.wait_for_timeout(650)
 assert snap(page)['loopRegion']==updated and snap(page)['isLooping'] is True
 record('Custom loop markers and looping state persist across browser reload')
 page.locator('.piano-timeline').last.dblclick(position={'x':80,'y':12})
 assert snap(page)['loopRegion'] is None
 record('Ruler double click restores the automatically sized full-pattern loop')
 # Native layered composition: no imported MIDI required.
 page.get_by_role('tab',name='Compose',exact=True).click()
 expect(page.get_by_role('button',name='Single track',exact=True)).to_have_attribute('aria-pressed','true')
 page.get_by_role('button',name='Bass + Harmony',exact=True).click()
 page.get_by_role('button',name='Generate pattern',exact=False).click()
 confirm_replacement_if_present(page)
 generated=snap(page)
 assert generated['generationMode']=='layers'
 assert [t['name'] for t in generated['progression']['tracks']]==['Bass','Harmony']
 assert {n['trackIndex'] for n in generated['progression']['notes']}=={0,1}
 assert generated['trackMix']['0']['synthType']=='sub'
 assert generated['trackMix']['1']['synthType']==generated['synthType']
 expect(page.get_by_role('tab',name='Tracks',exact=True)).to_have_attribute('aria-selected','true')
 record('Optional layered generation creates separately routed Bass and Harmony tracks')
 page.get_by_role('button',name='Add track',exact=True).click()
 added=snap(page)['progression']
 assert added['tracks'][-1]['index']==2 and added['tracks'][-1]['name']=='Track 3'
 assert len(added['notes'])==len(generated['progression']['notes'])
 assert page.get_by_role('combobox',name='Edit track',exact=True).input_value()=='2'
 page.get_by_role('button',name='Draw tool',exact=True).click()
 page.get_by_role('button',name='Fit pattern',exact=True).click()
 # Fit repositions the scroll container on the next layout/effect frame.
 page.wait_for_timeout(300)
 x,y=grid_point(page,64,1)
 page.mouse.click(x,y)
 page.wait_for_timeout(120)
 drawn=snap(page)['progression']
 assert len([n for n in drawn['notes'] if n['trackIndex']==2])==1
 record('Adding an empty track focuses a new lane and drawing writes to it')
 page.locator('section.track-strip').filter(has_text='Track 3').first.locator('.track-settings-disclosure > summary').click()
 page.get_by_role('button',name='Rename Track 3',exact=True).click()
 page.get_by_role('textbox',name='New track name').fill('Melody')
 page.get_by_role('textbox',name='New track name').press('Enter')
 assert snap(page)['progression']['tracks'][-1]['name']=='Melody'
 page.get_by_role('button',name='Duplicate Melody',exact=True).click()
 duplicated=snap(page)['progression']
 assert duplicated['tracks'][-1]['name']=='Melody copy'
 assert len([n for n in duplicated['notes'] if n['trackIndex']==3])==1
 page.locator('section.track-strip').filter(has_text='Melody copy').first.locator('.track-settings-disclosure > summary').click()
 page.get_by_role('button',name='Delete Melody copy',exact=True).click()
 expect(page.get_by_role('alertdialog',name='Delete Melody copy confirmation')).to_be_visible()
 page.get_by_role('button',name='Delete track',exact=True).click()
 assert not any(t['index']==3 for t in snap(page)['progression']['tracks'])
 page.get_by_role('button',name='Undo',exact=True).click()
 restored_track=snap(page)['progression']
 assert restored_track['tracks'][-1]['name']=='Melody copy'
 assert len([n for n in restored_track['notes'] if n['trackIndex']==3])==1
 record('Rename, duplicate, confirm-delete and undo preserve tracks and note identities')
 page.get_by_role('button',name='Mute Melody',exact=True).click()
 assert snap(page)['trackMix']['2']['muted']
 page.reload();page.wait_for_timeout(650)
 persisted=snap(page)
 assert persisted['generationMode']=='layers'
 assert persisted['progression']['tracks'][-1]['name']=='Melody copy'
 assert persisted['trackMix']['2']['muted']
 record('Layered composition, track headers and mixer preferences survive reload')
 with page.expect_download() as layers_download:
  page.get_by_role('button',name='Export MIDI',exact=True).click()
 layered_file=OUTPUT/'layered.mid'
 layers_download.value.save_as(str(layered_file))
 page.locator('input[type=file]').first.set_input_files(str(layered_file));page.wait_for_timeout(650)
 confirm_replacement_if_present(page)
 imported_layers=snap(page)['progression']
 assert [t['name'] for t in imported_layers['tracks']]==['Bass','Harmony','Melody','Melody copy']
 assert len(imported_layers['notes'])==len(persisted['progression']['notes'])
 record('Native four-track composition round-trips through MIDI export and re-import')
 page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='Toggle inspector',exact=True).click()
 page.get_by_role('tab',name='Tracks',exact=True).click()
 expect(page.get_by_role('button',name='Add track',exact=True)).to_be_visible()
 page.get_by_role('button',name='Add track',exact=True).click()
 assert len(snap(page)['progression']['tracks'])==5
 page.keyboard.press('Escape')
 page.set_viewport_size({'width':1440,'height':900})
 record('Mobile Tracks inspector can add a new track without obscured controls')
 # Verify the backward-compatible single-track workflow independently and
 # restore its preview sound picker before the legacy responsive assertions.
 page.get_by_role('tab',name='Compose',exact=True).click()
 page.get_by_role('button',name='Single track',exact=True).click()
 page.get_by_role('button',name='Generate pattern',exact=False).click()
 confirm_replacement_if_present(page)
 single=snap(page)
 assert single['generationMode']=='single'
 assert single['progression'].get('tracks') is None
 assert all(n.get('trackIndex') is None for n in single['progression']['notes'])
 page.get_by_role('tab',name='Compose',exact=True).click()
 record('Single-track generator remains the default-compatible, independent preview workflow')
 metrics=[]
 for width,height in [(1440,900),(1280,720),(1024,768),(768,1024),(390,844),(375,667)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  page.get_by_role('button',name='Fit pattern',exact=True).click();page.wait_for_timeout(200)
  assert page.evaluate('document.documentElement.scrollWidth')<=width
  for name in ['Export MIDI','Project menu','Play pattern','Draw tool','Fit pattern']:
   control=page.get_by_role('button',name=name,exact=True)
   expect(control).to_be_visible()
   box=control.bounding_box()
   assert box and box['x']>=0 and box['x']+box['width']<=width+.5, (width,name,box)
  canvas=page.get_by_role('region',name='Piano roll canvas').bounding_box()
  assert canvas['height']>=300, (width,canvas)
  if height <= 700:
   # On exceptionally short phones verbose tool guidance yields to the
   # note canvas, while direct tool controls remain named and accessible.
   assert not page.locator('.active-tool-readout').is_visible()
   for tool in ['Draw','Select','Slice','Hand','Stamp']:
    expect(page.get_by_role('button',name=tool+' tool',exact=True)).to_be_visible()
  metrics.append({'viewport':[width,height], 'canvas':canvas})
  page.screenshot(path=str(OUTPUT/f'workbench-{width}.png'))
  record(f'{width}×{height}: no clipped primary controls; canvas remains usable')
 # The mobile inspector is a true contained sheet, not a tall page above the editor.
 page.get_by_role('button',name='Toggle inspector',exact=True).click()
 page.get_by_role('tab',name='Compose',exact=True).click()
 page.screenshot(path=str(OUTPUT/'mobile-inspector.png'))
 page.get_by_role('tab',name='Compose',exact=True).click()
 page.locator('.sound-picker-trigger').first.click()
 modal=page.get_by_role('dialog',name='Sound library')
 expect(modal).to_have_attribute('aria-modal','true')
 bounds=modal.bounding_box()
 assert bounds and bounds['x']>=0 and bounds['y']>=0 and bounds['x']+bounds['width']<=375.5 and bounds['y']+bounds['height']<=667.5
 page.keyboard.press('Escape')
 expect(modal).not_to_be_visible()
 record('Mobile sound browser fits the viewport and closes via Escape')
 page.keyboard.press('Escape')
 page.set_viewport_size({'width':1440,'height':900})
 page.get_by_role('tab',name='Transform',exact=True).click()
 page.screenshot(path=str(OUTPUT/'transform-desktop.png'))
 # Quota failure must not be presented as a successful save.
 page.evaluate("() => { Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); }; }")
 page.get_by_role('spinbutton',name='Tempo',exact=True).fill('123')
 page.get_by_role('spinbutton',name='Tempo',exact=True).press('Enter')
 page.wait_for_timeout(500)
 expect(page.get_by_text('Autosave unavailable — export to keep your work',exact=True)).to_be_visible()
 record('Autosave quota failure is reported honestly')
 page.get_by_role('button',name='Select tool').click()
 page.keyboard.press('b')
 expect(page.get_by_role('button',name='Select tool')).to_have_attribute('aria-pressed','true')
 record('Focused controls do not change editing tools via keyboard shortcuts')
 blocked=b.new_page()
 blocked.route('**/assets/index-*.js',lambda route:route.abort())
 blocked.goto(args.url,wait_until='domcontentloaded')
 expect(blocked.locator('#boot-screen')).to_be_visible()
 blocked.wait_for_timeout(6500)
 expect(blocked.get_by_text('The editor did not finish loading.',exact=False)).to_be_visible()
 expect(blocked.get_by_role('button',name='Reload studio')).to_be_visible()
 blocked.close()
 record('Missing entry bundle shows a recovery screen rather than an empty page')
 # A truly fresh session can create a named first track without Generate or Import.
 fresh=b.new_page(viewport={'width':1280,'height':800})
 fresh.on('pageerror',lambda e:errors.append(str(e)))
 fresh.goto(args.url)
 fresh.get_by_role('tab',name='Tracks',exact=True).click()
 fresh.get_by_role('button',name='Add track',exact=True).click()
 first=snap(fresh)
 assert first['progression']['tracks'][0]['name']=='Track 1'
 assert first['progression']['notes']==[]
 assert fresh.get_by_role('combobox',name='Edit track',exact=True).input_value()=='0'
 fresh.locator('input[type=file]').first.set_input_files(str(fixture))
 expect(fresh.get_by_role('dialog',name='Replace current composition?')).to_be_visible()
 fresh.keyboard.press('Escape')
 assert snap(fresh)['progression']==first['progression']
 record('Even named empty tracks are protected from accidental import and Escape cancels')
 fresh.close()
 record('Brand-new blank project can add and focus a first empty track')
 # Melody-conditioned end-to-end workflow on imported multi-track MIDI.
 adaptive=b.new_page(viewport={'width':1280,'height':800})
 adaptive.on('pageerror',lambda e:errors.append(str(e)))
 adaptive.goto(args.url)
 import_fixture(adaptive)
 original=snap(adaptive)['progression']
 adaptive.get_by_role('tab',name='Compose',exact=True).click()
 adaptive.get_by_role('button',name='Follow melody',exact=True).click()
 assert adaptive.locator('.melody-step-heading h4').all_inner_texts()==['Source','Action','Harmonic fit']
 expect(adaptive.locator('.melody-advanced > summary')).to_be_visible()
 assert adaptive.locator('.melody-advanced').get_attribute('open') is None
 adaptive.locator('.melody-advanced > summary').click()
 adaptive.get_by_role('combobox',name='Source melody track',exact=True).select_option('0')
 adaptive.get_by_role('slider',name='Harmonic fit to melody',exact=True).fill('90')
 adaptive.get_by_role('slider',name='Harmony exploration',exact=True).fill('85')
 assert '85% explore' in adaptive.locator('.melody-advanced > summary').inner_text()
 adaptive.get_by_role('button',name='Continue',exact=True).click()
 assert snap(adaptive)['harmonyExploration']==85
 adaptive.get_by_role('button',name='Harmonize',exact=True).click()
 adaptive.get_by_role('button',name='Balanced',exact=True).click()
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(600)
 first=snap(adaptive)
 assert first['melodySourceMode']=='follow'
 assert first['harmonyExploration']==85
 assert first['progression']['notes'][:len(original['notes'])]==original['notes']
 source_tracks=first['progression']['tracks']
 auto=[t for t in source_tracks if t.get('generatedRole') in ('bass','harmony')]
 assert len(auto)==2 and {t['generatedRole'] for t in auto}=={'bass','harmony'}
 assert all(t['sourceTrackIndex']==0 for t in auto)
 assert len(first['progression']['notes'])>len(original['notes'])
 record('Melody follow mode generates separate accompaniment without altering imported notes')
 adaptive.get_by_role('button',name='Try another harmonization',exact=False).click()
 adaptive.wait_for_timeout(600)
 alternate=snap(adaptive)
 assert alternate['progression']['notes'][:len(original['notes'])]==original['notes']
 assert alternate['progression']['tracks']==source_tracks
 assert len([t for t in alternate['progression']['tracks'] if t.get('generatedRole')])==2
 record('Alternative harmonization reuses generated track IDs without duplication')
 adaptive.get_by_role('button',name='Undo',exact=True).click()
 assert snap(adaptive)['progression']==first['progression']
 adaptive.wait_for_timeout(600)
 adaptive.reload();adaptive.wait_for_timeout(650)
 restored_adaptive=snap(adaptive)
 assert restored_adaptive['melodySourceMode']=='follow'
 assert restored_adaptive['progression']==first['progression']
 assert restored_adaptive['harmonicFit']==90
 assert restored_adaptive['harmonyExploration']==85
 record('Adaptive harmony is undoable and persistent across browser reload')
 # Native details is intentionally closed after a page reload; reopen to tune.
 adaptive.locator('.melody-advanced > summary').click()
 # The old deterministic Viterbi path remains available at exploration=0.
 adaptive.get_by_role('slider',name='Harmony exploration',exact=True).fill('0')
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(650)
 legacy_harmony=snap(adaptive)
 assert legacy_harmony['harmonyExploration']==0
 assert legacy_harmony['progression']['notes'][:len(original['notes'])]==original['notes']
 assert legacy_harmony['progression']['tracks']==source_tracks
 record('Exploration zero retains non-destructive legacy chord search')
 adaptive.get_by_role('slider',name='Harmony exploration',exact=True).fill('85')
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(650)
 diverse_harmony=snap(adaptive)
 assert diverse_harmony['harmonyExploration']==85
 assert diverse_harmony["progression"]["notes"][:len(original["notes"])] == original["notes"]
 assert diverse_harmony['progression']['tracks']==source_tracks
 record('Diverse chord search reuses generated tracks and protects source notes')
 # A user can choose explicitly fast harmonic rhythm and then return to
 # evidence-driven pacing without multiplying or damaging source tracks.
 adaptive.get_by_role('button',name='2 / bar',exact=True).click()
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(650)
 fast_pacing=snap(adaptive)
 chord_labels=[c for c in fast_pacing['progression']['chords'] if c.get('generatedSourceTrackIndex')==0]
 assert fast_pacing['harmonicPacing']=='half-bar'
 assert len(chord_labels)==fast_pacing['progression']['totalBars']*2
 assert all(c['duration']==2 and c['timeStart']%2==0 for c in chord_labels)
 assert fast_pacing['progression']['notes'][:len(original['notes'])]==original['notes']
 assert fast_pacing['progression']['tracks']==source_tracks
 record('Explicit two-per-bar chords follow the timeline without changing the melody')
 # Protect the second half of bar one; changing pacing must preserve that
 # exact chord label and its existing bass/harmony note events.
 lock_button=adaptive.get_by_test_id('chord-lock-1')
 expect(lock_button).to_have_attribute('aria-pressed','false')
 lock_button.click()
 expect(lock_button).to_have_attribute('aria-pressed','true')
 locked_snapshot=snap(adaptive)
 locked_chord=locked_snapshot['progression']['chords'][1]
 assert locked_chord['locked'] is True and locked_chord['timeStart']==2 and locked_chord['duration']==2
 owned_indexes={t['index'] for t in source_tracks if t.get('generatedRole') in ('bass','harmony')}
 locked_events=[n for n in locked_snapshot['progression']['notes'] if n.get('trackIndex') in owned_indexes
                and 2<=n['timeStart']<4]
 adaptive.get_by_role('button',name='Each bar',exact=True).click()
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(650)
 infilled=snap(adaptive)
 assert any(c==locked_chord for c in infilled['progression']['chords'])
 assert [n for n in infilled['progression']['notes'] if n.get('trackIndex') in owned_indexes
         and 2<=n['timeStart']<4]==locked_events
 assert infilled['progression']['notes'][:len(original['notes'])]==original['notes']
 expect(adaptive.get_by_role('button',name='Unlock all 1 chord regions')).to_be_visible()
 adaptive.get_by_role('button',name='Unlock all 1 chord regions').click()
 assert all(not c.get('locked') for c in snap(adaptive)['progression']['chords'])
 record('Chord locks preserve exact accompaniment through tempo-pacing changes and unlock safely')
 adaptive.get_by_role('button',name='Adaptive',exact=True).click()
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(650)
 paced=snap(adaptive)
 labels=[c for c in paced['progression']['chords'] if c.get('generatedSourceTrackIndex')==0]
 assert paced['harmonicPacing']=='adaptive'
 assert paced['progression']['totalBars']<=len(labels)<=paced['progression']['totalBars']*2
 assert paced['progression']['notes'][:len(original['notes'])]==original['notes']
 assert paced['progression']['tracks']==source_tracks
 adaptive.wait_for_timeout(650)
 adaptive.reload();adaptive.wait_for_timeout(650)
 assert snap(adaptive)['harmonicPacing']=='adaptive'
 assert snap(adaptive)['harmonyExploration']==85
 record('Adaptive harmonic pacing and exploration persist across browser reload')
 adaptive.screenshot(path=str(OUTPUT/'melody-follow.png'))
 with adaptive.expect_download() as adaptive_download:
  adaptive.get_by_role('button',name='Export MIDI',exact=True).click()
 adaptive_file=OUTPUT/'adaptive.mid'
 adaptive_download.value.save_as(str(adaptive_file))
 assert adaptive_file.read_bytes().startswith(b'MThd')
 adaptive.locator('input[type=file]').first.set_input_files(str(adaptive_file))
 adaptive.wait_for_timeout(650)
 confirm_replacement_if_present(adaptive)
 adaptive_roundtrip=snap(adaptive)['progression']
 assert len(adaptive_roundtrip['notes'])==len(paced['progression']['notes'])
 assert [t['name'] for t in adaptive_roundtrip['tracks']]==[
  'Keys','Bass','Empty pad','Generated Bass','Generated Harmony']
 record('Melody-aware layers export and re-import as standard multi-track MIDI')
 adaptive.close()
 # User-authored chord guides are hard search constraints, not decorative tags.
 guide_page=b.new_page(viewport={'width':1280,'height':800})
 guide_page.on('pageerror',lambda error:errors.append(str(error)))
 guide_page.goto(args.url)
 guide_page.get_by_role('button',name='Generate pattern',exact=True).last.click()
 guide_page.wait_for_timeout(650)
 guide_source=snap(guide_page)['progression']
 assert guide_source['totalBars']==4
 guide_page.get_by_role('tab',name='Compose',exact=True).click()
 guide_page.get_by_role('button',name='Follow melody',exact=True).click()
 guide_page.locator('.melody-advanced > summary').click()
 guide_page.get_by_role('combobox',name='Source melody track',exact=True).select_option('0')
 guide_page.get_by_role('combobox',name='Guide bar').select_option('2')
 guide_page.get_by_role('combobox',name='Guide chord').select_option('G')
 guide_page.get_by_role('button',name='Pin chord',exact=True).click()
 guide_page.get_by_role('combobox',name='Guide chord').select_option('C')
 guide_page.get_by_role('button',name='Avoid chord',exact=True).click()
 guide_page.wait_for_timeout(550)
 guided_project=snap(guide_page)['progression']
 assert sorted(guided_project['harmonyConstraints'],key=lambda g:g['kind'])==sorted([
  {'sourceTrackIndex':0,'bar':1,'kind':'require','chord':'G'},
  {'sourceTrackIndex':0,'bar':1,'kind':'avoid','chord':'C'},
 ],key=lambda g:g['kind'])
 guide_page.get_by_role('button',name='Harmonize melody',exact=False).click()
 guide_page.wait_for_timeout(650)
 guided_result=snap(guide_page)['progression']
 guided_chords=[c for c in guided_result['chords'] if c.get('generatedSourceTrackIndex')==0]
 assert [c['name'] for c in guided_chords if 4<=c['timeStart']<8]==['G']
 assert next(c for c in guided_chords if c['timeStart']==4)['duration']==4
 assert guided_result['notes'][:len(guide_source['notes'])]==guide_source['notes']
 guide_page.reload();guide_page.wait_for_timeout(650)
 restored_guide=snap(guide_page)['progression']
 assert restored_guide['harmonyConstraints']==guided_project['harmonyConstraints']
 guide_page.locator('.melody-advanced > summary').click()
 guide_page.get_by_role('button',name='Remove pinned G from bar 2').click()
 guide_page.get_by_role('button',name='Harmonize melody',exact=False).click()
 guide_page.wait_for_timeout(650)
 excluded_result=snap(guide_page)['progression']
 assert all(c['name']!='C' for c in excluded_result['chords'] if
  c.get('generatedSourceTrackIndex')==0 and 4<=c['timeStart']<8)
 assert len(excluded_result['harmonyConstraints'])==1
 assert excluded_result['harmonyConstraints'][0]['kind']=='avoid'
 record('Chord guide pins full bars, excludes chords, persists, and regenerates safely')
 guide_page.close()
 # Take Lab previews are separate from the saved session and become one
 # undoable history entry only after explicit acceptance.
 take_page=b.new_page(viewport={'width':1280,'height':800})
 take_page.on('pageerror',lambda error:errors.append(str(error)))
 take_page.goto(args.url)
 take_page.locator('input[type=file]').first.set_input_files(str(take_fixture))
 take_page.wait_for_timeout(650)
 take_original=snap(take_page)['progression']
 assert take_original['totalBars']==4
 take_page.get_by_role('tab',name='Compose',exact=True).click()
 take_page.get_by_role('button',name='Follow melody',exact=True).click()
 take_page.get_by_role('slider',name='Harmonic fit to melody').fill('55')
 take_page.locator('.melody-advanced > summary').click()
 take_page.get_by_role('slider',name='Harmony exploration').fill('100')
 take_page.get_by_role('button',name='Harmonize melody',exact=False).click()
 take_page.wait_for_timeout(650)
 take_base=snap(take_page)['progression']
 open_composer_group(take_page,'.take-lab-disclosure')
 expect(take_page.get_by_role('button',name='Explore 3 takes')).to_be_enabled()
 take_page.get_by_role('button',name='Explore 3 takes').click()
 take_page.wait_for_timeout(650)
 take_1=take_page.get_by_role('button',name='Take 1',exact=False)
 expect(take_1).to_have_attribute('aria-pressed','true')
 assert take_page.locator('.editor-main').evaluate('(el)=>el.inert') is True
 assert snap(take_page)['progression']==take_base
 expect(take_page.get_by_role('button',name='Undo')).to_be_disabled()
 take_page.get_by_role('button',name='Play pattern').click()
 take_page.wait_for_timeout(350)
 expect(take_page.get_by_role('button',name='Pause playback')).to_be_visible()
 take_page.get_by_role('button',name='Stop playback').click()
 take_page.get_by_role('button',name='Original',exact=False).click()
 assert take_page.locator('.editor-main').evaluate('(el)=>el.inert') is False
 assert snap(take_page)['progression']==take_base
 take_1.click()
 # Save only the generated accompaniment, never a hidden copy of the melody.
 take_page.locator('.take-diff summary').first.click()
 expect(take_page.get_by_text('Chord transitions:',exact=False).first).to_be_visible()
 take_page.get_by_role('button',name='Save favorite',exact=True).click()
 take_page.wait_for_timeout(700)
 saved_snapshot=snap(take_page)
 assert saved_snapshot['progression']==take_base
 favorite_bank=saved_snapshot['savedHarmonyTakes']
 assert len(favorite_bank['favorites'])==1
 fav=favorite_bank['favorites'][0]
 generated_indices={t['index'] for t in take_base['tracks'] if t.get('generatedRole') in ('bass','harmony')}
 assert all(n['trackIndex'] in generated_indices for n in fav['notes'])
 assert all(c['generatedSourceTrackIndex']==0 for c in fav['chords'])
 expect(take_page.locator('.take-choice').filter(has_text='Favorite 1')).to_have_attribute('aria-pressed','true')
 # One-click listening should start the matching score at the same loop anchor.
 take_page.get_by_role('button',name='Play option 1').click()
 take_page.wait_for_timeout(400)
 expect(take_page.get_by_role('button',name='Pause playback')).to_be_visible()
 take_page.get_by_role('button',name='Next',exact=True).click()
 take_page.wait_for_timeout(400)
 expect(take_page.get_by_role('button',name='Pause playback')).to_be_visible()
 take_page.get_by_role('button',name='Play reference').click()
 take_page.wait_for_timeout(400)
 expect(take_page.get_by_role('button',name='Pause playback')).to_be_visible()
 take_page.get_by_role('button',name='Stop playback').click()
 take_page.reload(); take_page.wait_for_timeout(700)
 assert snap(take_page)['progression']==take_base
 assert len(snap(take_page)['savedHarmonyTakes']['favorites'])==1
 # Unsaved UI disclosure state intentionally resets after reload; the saved
 # take itself remains in the session and is visible on opening Compare.
 open_composer_group(take_page,'.take-lab-disclosure')
 expect(take_page.locator('.take-choice').filter(has_text='Favorite 1')).to_be_visible()
 take_page.locator('.take-choice').filter(has_text='Favorite 1').click()
 assert take_page.locator('.editor-main').evaluate('(el)=>el.inert') is True
 take_page.get_by_role('button',name='Accept selected take',exact=True).click()
 take_page.wait_for_timeout(650)
 accepted_take=snap(take_page)['progression']
 assert accepted_take!=take_base
 assert accepted_take['notes'][:len(take_original['notes'])]==take_original['notes']
 assert take_page.locator('.editor-main').evaluate('(el)=>el.inert') is False
 take_page.get_by_role('button',name='Undo').click()
 take_page.wait_for_timeout(650)
 assert snap(take_page)['progression']==take_base
 # Undo returns to the original base, so its explicit saved favorite remains
 # compatible and can be deleted without altering the working score.
 expect(take_page.get_by_role('button',name='Remove favorite 1')).to_be_visible()
 take_page.get_by_role('button',name='Remove favorite 1').click()
 take_page.wait_for_timeout(650)
 assert snap(take_page)['progression']==take_base
 assert len(snap(take_page)['savedHarmonyTakes']['favorites'])==0
 record('Take Lab persists compact favorites, explains changes, auditions at one loop anchor and accepts one undoable take')
 # A melody with existing Bass/Harmony invokes scoped reharmonization of B.
 open_composer_group(take_page,'.song-form-disclosure')
 take_page.get_by_role('button',name='Build 16-bar song form',exact=True).click()
 take_page.wait_for_timeout(750)
 formed=snap(take_page)['progression']
 assert formed['totalBars']==16
 assert [section['label'] for section in formed['arrangementSections']]==[
  'A','A′','B','A (return)']
 assert formed['notes'][:len(take_base['notes'])]==take_base['notes']
 assert len([chord for chord in formed['chords'] if chord.get('generatedSourceTrackIndex')==0
  and 32<=chord['timeStart']<48])>=4
 record('Melody-aware song form retains original section and reharmonizes a contrasting bridge')
 take_page.close()
 # Native projects preserve editable sections, settings, and metadata when
 # exported/opened; malformed files and Cancel must leave the current score.
 project_page=b.new_page(viewport={'width':1280,'height':800})
 project_page.on('pageerror',lambda e:errors.append(str(e)))
 project_page.goto(args.url)
 project_page.get_by_role('button',name='Generate pattern',exact=True).last.click()
 project_page.wait_for_timeout(650)
 seed_score=snap(project_page)['progression']
 assert seed_score['totalBars']==4
 project_page.get_by_role('tab',name='Compose',exact=True).click()
 open_composer_group(project_page,'.song-form-disclosure')
 project_page.get_by_role('button',name='Build 16-bar song form',exact=True).click()
 project_page.wait_for_timeout(650)
 expanded=snap(project_page)
 assert expanded['progression']['totalBars']==16
 assert expanded['progression']['notes'][:len(seed_score['notes'])]==seed_score['notes']
 assert [section['startBar'] for section in expanded['progression']['arrangementSections']]==[0,4,8,12]
 assert project_page.locator('.song-form-marker').count()==4
 project_page.locator('.project-menu > summary').click()
 with project_page.expect_download() as project_download:
  project_page.get_by_role('button',name='Save MIDI Spark project').click()
 project_file=OUTPUT/'song-form.midispark'
 project_download.value.save_as(str(project_file))
 assert project_file.read_bytes().startswith(b'{')
 native=json.loads(project_file.read_text())
 assert native['format']=='midi-spark-project' and native['version']==1
 assert native['session']['progression']==expanded['progression']
 assert native['session']['songFormPreference']=='AABA'
 # A damaged file is rejected without losing the current score.
 invalid_project=OUTPUT/'broken.midispark'
 invalid_project.write_text('{broken')
 project_page.locator('input[aria-label="Open MIDI Spark project file"]').set_input_files(str(invalid_project))
 project_page.wait_for_timeout(500)
 assert snap(project_page)['progression']==expanded['progression']
 # Replace with a new pattern, then Cancel a native import.
 project_page.get_by_role('button',name='Generate pattern',exact=False).click()
 confirm_replacement_if_present(project_page)
 project_page.wait_for_timeout(650)
 other_score=snap(project_page)['progression']
 assert other_score!=expanded['progression']
 project_page.get_by_role('combobox',name='Root key').select_option('D')
 project_page.locator('input[aria-label="Open MIDI Spark project file"]').set_input_files(str(project_file))
 expect(project_page.get_by_role('dialog',name='Open native project?')).to_be_visible()
 project_page.get_by_role('button',name='Keep current work').click()
 assert snap(project_page)['progression']==other_score
 project_page.locator('input[aria-label="Open MIDI Spark project file"]').set_input_files(str(project_file))
 project_page.get_by_role('button',name='Open and replace').click()
 project_page.wait_for_timeout(750)
 restored_project=snap(project_page)
 assert restored_project['progression']==expanded['progression']
 assert restored_project['root']==native['session']['root']
 assert restored_project['songFormPreference']=='AABA'
 project_page.reload();project_page.wait_for_timeout(750)
 assert snap(project_page)['progression']==expanded['progression']
 open_composer_group(project_page,'.song-form-disclosure')
 expect(project_page.get_by_role('list',name='Current arrangement sections')).to_be_visible()
 record('Native project file restores all song sections and settings after invalid-file and Cancel safety checks')
 project_page.close()
 # Melody continuation and variation are separate, user-protecting operations.
 motif_page=b.new_page(viewport={'width':1280,'height':800})
 motif_page.on('pageerror',lambda error:errors.append(str(error)))
 motif_page.goto(args.url)
 import_fixture(motif_page)
 motif_source=snap(motif_page)['progression']
 motif_page.get_by_role('tab',name='Compose',exact=True).click()
 motif_page.get_by_role('button',name='Follow melody',exact=True).click()
 motif_page.get_by_role('combobox',name='Source melody track',exact=True).select_option('0')
 motif_page.get_by_role('button',name='Continue',exact=True).click()
 motif_page.get_by_role('slider',name='Melodic creative distance',exact=True).fill('64')
 motif_page.get_by_role('button',name='2',exact=True).click()
 motif_page.get_by_role('button',name='Continue melody',exact=False).click()
 motif_page.wait_for_timeout(650)
 continued=snap(motif_page)
 source_count=len(motif_source['notes'])
 assert continued['progression']['notes'][:source_count]==motif_source['notes']
 tail_tracks=[t for t in continued['progression']['tracks'] if t.get('generatedRole')=='continuation']
 assert len(tail_tracks)==1 and tail_tracks[0]['sourceTrackIndex']==0
 tail_index=tail_tracks[0]['index']
 assert continued['progression']['totalBars']>=3
 tail_notes=[n for n in continued['progression']['notes'] if n['trackIndex']==tail_index]
 assert len(tail_notes)>0 and all(n['timeStart']>=4 for n in tail_notes)
 record('Continue melody extends a drawn/imported phrase on a separate owned track')
 motif_page.get_by_role('button',name='Try another continuation',exact=False).click()
 motif_page.wait_for_timeout(650)
 continued_again=snap(motif_page)
 assert [t for t in continued_again['progression']['tracks'] if t.get('generatedRole')=='continuation']==tail_tracks
 assert continued_again['progression']['notes'][:source_count]==motif_source['notes']
 record('Alternative continuation reuses the same track and never duplicates source notes')
 motif_page.get_by_role('button',name='Harmonize',exact=True).click()
 motif_page.get_by_role('button',name='Harmonize melody',exact=False).click()
 motif_page.wait_for_timeout(650)
 arranged=snap(motif_page)
 owned=[c for c in arranged['progression']['chords'] if c.get('generatedSourceTrackIndex')==0]
 assert arranged['progression']['totalBars']<=len(owned)<=2*arranged['progression']['totalBars']
 assert sum(c['duration'] for c in owned)==arranged['progression']['totalBars']*4
 assert arranged['progression']['notes'][:source_count]==motif_source['notes']
 assert [n for n in arranged['progression']['notes'] if n.get('trackIndex')==tail_index]==[n for n in continued_again['progression']['notes'] if n.get('trackIndex')==tail_index]
 record('Adaptive harmony follows a linked continuation without rewriting either melody')
 motif_page.get_by_role('button',name='Reimagine',exact=True).click()
 motif_page.get_by_role('button',name='Reimagine melody',exact=False).click()
 motif_page.wait_for_timeout(650)
 variation=snap(motif_page)
 var_tracks=[t for t in variation['progression']['tracks'] if t.get('generatedRole')=='variation']
 assert len(var_tracks)==1 and var_tracks[0]['sourceTrackIndex']==0
 var_index=var_tracks[0]['index']
 assert variation['trackMix'][str(var_index)]['solo'] is True
 assert len([n for n in variation['progression']['notes'] if n['trackIndex']==var_index])>0
 assert variation['progression']['notes'][:source_count]==motif_source['notes']
 record('Reimagine creates a solo-auditioned alternative and preserves the original')
 motif_page.get_by_role('button',name='Undo',exact=True).click()
 assert snap(motif_page)['progression']==arranged['progression']
 motif_page.get_by_role('button',name='Redo',exact=True).click()
 assert snap(motif_page)['progression']==variation['progression']
 motif_page.wait_for_timeout(650)
 motif_page.reload();motif_page.wait_for_timeout(650)
 restored_motif=snap(motif_page)
 assert restored_motif['progression']==variation['progression']
 assert restored_motif['melodyTask']=='reimagine'
 assert restored_motif['motifCreativity']==64
 assert restored_motif['continuationBars']==2
 record('Motif creation, undo/redo and creative controls survive browser reload')
 with motif_page.expect_download() as motif_download:
  motif_page.get_by_role('button',name='Export MIDI',exact=True).click()
 motif_file=OUTPUT/'motif.mid'
 motif_download.value.save_as(str(motif_file))
 assert motif_file.read_bytes().startswith(b'MThd')
 motif_page.locator('input[type=file]').first.set_input_files(str(motif_file))
 motif_page.wait_for_timeout(650)
 confirm_replacement_if_present(motif_page)
 motif_roundtrip=snap(motif_page)['progression']
 assert len(motif_roundtrip['notes'])==len(variation['progression']['notes'])
 assert len(motif_roundtrip['tracks'])==len(variation['progression']['tracks'])
 record('Continued and reimagined notes round-trip through standard multi-track MIDI')
 motif_page.close()
 # Phrase scope integration: selection, a real timeline loop, and safe retry.
 phrase=b.new_page(viewport={'width':1280,'height':800})
 phrase.on('pageerror',lambda error:errors.append(str(error)))
 phrase.goto(args.url)
 import_fixture(phrase)
 original_phrase=snap(phrase)['progression']
 phrase.get_by_role('combobox',name='Edit track',exact=True).select_option('0')
 phrase.get_by_role('button',name='Select tool',exact=True).click()
 phrase.get_by_test_id('note-move').first.click()
 phrase.get_by_test_id('note-move').nth(1).click(modifiers=['Shift'])
 phrase.get_by_role('tab',name='Compose',exact=True).click()
 phrase.get_by_role('button',name='Follow melody',exact=True).click()
 open_composer_group(phrase,'.melody-scope-disclosure')
 phrase.get_by_role('button',name='Selected',exact=True).click()
 expect(phrase.get_by_text('2 source notes selected',exact=False)).to_be_visible()
 phrase.get_by_role('button',name='Continue',exact=True).click()
 phrase.get_by_role('button',name='2',exact=True).click()
 phrase.get_by_role('button',name='Continue melody',exact=False).click()
 phrase.wait_for_timeout(650)
 scoped=snap(phrase)
 assert scoped['melodyPhraseScope']=='selected'
 assert scoped['progression']['notes'][:len(original_phrase['notes'])]==original_phrase['notes']
 output=[t for t in scoped['progression']['tracks'] if t.get('generatedRole')=='continuation']
 assert len(output)==1
 continuation_id=output[0]['index']
 assert all(n['timeStart']>=4 for n in scoped['progression']['notes'] if n['trackIndex']==continuation_id)
 expect(phrase.get_by_text('2 source notes selected',exact=False)).to_be_visible()
 record('Selected-note continuation protects source notes and retains the selection for retry')
 phrase.get_by_role('button',name='Try another continuation',exact=False).click()
 phrase.wait_for_timeout(650)
 retry=snap(phrase)
 assert retry['progression']['tracks']==scoped['progression']['tracks']
 assert retry['progression']['notes'][:len(original_phrase['notes'])]==original_phrase['notes']
 record('Repeated selected-phrase generation retains source selection and owned track ID')
 # Explicit timeline loop, not a programmatic in-memory shortcut.
 timeline=phrase.locator('.piano-timeline').last
 ruler=timeline.bounding_box()
 zoom=snap(phrase)['zoomX']
 y=ruler['y']+13
 phrase.keyboard.down('Shift')
 phrase.mouse.move(ruler['x']+.5*zoom,y)
 phrase.mouse.down()
 phrase.mouse.move(ruler['x']+2.5*zoom,y,steps=8)
 phrase.mouse.up()
 phrase.keyboard.up('Shift')
 selected_loop=snap(phrase)['loopRegion']
 assert selected_loop is not None and selected_loop['end']>selected_loop['start']
 phrase.get_by_role('button',name='Loop range',exact=True).click()
 phrase.get_by_role('button',name='Reimagine',exact=True).click()
 phrase.get_by_role('button',name='Reimagine melody',exact=False).click()
 phrase.wait_for_timeout(650)
 looped=snap(phrase)
 assert looped['melodyPhraseScope']=='loop' and looped['loopRegion']==selected_loop
 assert looped['progression']['notes'][:len(original_phrase['notes'])]==original_phrase['notes']
 variants=[t for t in looped['progression']['tracks'] if t.get('generatedRole')=='variation']
 assert len(variants)==1
 variation_notes=[n for n in looped['progression']['notes'] if n['trackIndex']==variants[0]['index']]
 assert len(variation_notes)==2
 record('Shift-dragged loop selects a specific source phrase and survives generation')
 phrase.get_by_role('button',name='Harmonize',exact=True).click()
 phrase.get_by_role('button',name='Harmonize melody',exact=False).click()
 phrase.wait_for_timeout(650)
 local=snap(phrase)
 labels=[c for c in local['progression']['chords'] if c.get('generatedSourceTrackIndex')==0]
 assert labels and all(c['timeStart']<4 for c in labels)
 assert local['progression']['notes'][:len(original_phrase['notes'])]==original_phrase['notes']
 assert [n for n in local['progression']['notes'] if n.get('trackIndex')==variants[0]['index']]==variation_notes
 record('Loop-scoped harmonization updates covered bars without altering melody variants')
 phrase.wait_for_timeout(650)
 phrase.reload()
 phrase.wait_for_timeout(650)
 persisted_phrase=snap(phrase)
 assert persisted_phrase['melodyPhraseScope']=='loop'
 assert persisted_phrase['loopRegion']==selected_loop
 assert persisted_phrase['progression']==local['progression']
 record('Source-phrase preference and real loop range persist through browser reload')
 phrase.close()
 # Touch-only source loop selection: no Shift key or ruler precision needed.
 mobile_loop=b.new_page(viewport={'width':390,'height':844},has_touch=True)
 mobile_loop.on('pageerror',lambda error:errors.append(str(error)))
 mobile_loop.goto(args.url)
 mobile_loop.get_by_role('button',name='Generate pattern',exact=True).last.click()
 mobile_loop.wait_for_timeout(650)
 loop_original=snap(mobile_loop)['progression']
 assert loop_original['totalBars']==4
 mobile_loop.get_by_role('button',name='Toggle inspector',exact=True).click()
 mobile_loop.get_by_role('button',name='Follow melody',exact=True).click()
 open_composer_group(mobile_loop,'.melody-scope-disclosure')
 mobile_loop.get_by_role('button',name='Loop range',exact=True).click()
 mobile_loop.get_by_role('combobox',name='Loop from bar',exact=True).select_option('2')
 mobile_loop.get_by_role('combobox',name='Loop through bar',exact=True).select_option('3')
 assert snap(mobile_loop)['loopRegion']=={'start':4,'end':12}
 record('Touch-only mobile bar selectors create a precise loop without Shift-drag')
 mobile_loop.get_by_role('button',name='Use full pattern',exact=True).click()
 assert snap(mobile_loop)['loopRegion']=={'start':0,'end':16}
 mobile_loop.get_by_role('button',name='Clear loop selection',exact=True).click()
 assert snap(mobile_loop)['loopRegion'] is None
 mobile_loop.get_by_role('combobox',name='Loop from bar',exact=True).select_option('2')
 mobile_loop.get_by_role('combobox',name='Loop through bar',exact=True).select_option('3')
 mobile_loop.get_by_role('button',name='Harmonize melody',exact=False).click()
 mobile_loop.wait_for_timeout(650)
 touch_result=snap(mobile_loop)
 assert touch_result['progression']['notes'][:len(loop_original['notes'])]==loop_original['notes']
 assert all(4<=c['timeStart']<12 for c in touch_result['progression']['chords'] if c.get('generatedSourceTrackIndex')==0)
 record('Touch-selected loop harmonizes only requested bars without replacing authored melody')
 mobile_loop.close()
 # Keyboard-only note navigation and precision editing for imported multitrack MIDI.
 keyedit=b.new_page(viewport={'width':390,'height':844},has_touch=True)
 keyedit.on('pageerror',lambda error:errors.append(str(error)))
 keyedit.goto(args.url)
 import_fixture(keyedit)
 keyedit.get_by_role('combobox',name='Edit track',exact=True).select_option('0')
 assert keyedit.get_by_test_id('piano-note').count()==3
 keyedit.get_by_test_id('piano-note').first.focus()
 keyedit.keyboard.press('ArrowRight')
 keyedit.wait_for_timeout(70)
 keyedit.keyboard.press('Enter')
 picked=keyedit.locator('[data-testid="piano-note"][data-selected="true"]')
 assert picked.count()==1
 index=int(picked.get_attribute('data-note-index'))
 before_edit=snap(keyedit)['progression']['notes']
 keyedit.keyboard.press('Alt+ArrowUp')
 assert snap(keyedit)['progression']['notes'][index]['midi']==before_edit[index]['midi']+1
 keyedit.keyboard.press('ControlOrMeta+z')
 assert snap(keyedit)['progression']['notes']==before_edit
 keyedit.keyboard.press(']')
 assert snap(keyedit)['progression']['notes'][index]['duration']>before_edit[index]['duration']
 keyedit.keyboard.press('ControlOrMeta+z')
 assert snap(keyedit)['progression']['notes']==before_edit
 record('Keyboard note navigation, single-note selection, pitch and duration edits undo cleanly')
 # Undo clears note selection, so explicitly reselect before editing velocity.
 keyedit.locator('[data-testid="piano-note"][data-note-index="'+str(index)+'"]').focus()
 keyedit.keyboard.press('Enter')
 keyedit.locator('.note-precision-summary').click()
 vel=keyedit.get_by_test_id('precision-note-velocity')
 vel.fill('62');vel.press('Tab')
 exact=snap(keyedit)['progression']['notes']
 assert abs(exact[index]['velocity']-.62)<.001
 assert all(n==before_edit[i] for i,n in enumerate(exact) if i!=index)
 keyedit.get_by_role('button',name='Increase selected velocity by 10 percentage points').click()
 assert abs(snap(keyedit)['progression']['notes'][index]['velocity']-.72)<.001
 assert vel.input_value()=='72'
 assert keyedit.locator('.velocity-hit-target[tabindex="0"]').count()==1
 record('Exact numeric velocity entry and ten-point nudges update the displayed value and isolate neighbors')
 keyedit.get_by_test_id('piano-note').nth(1).focus()
 keyedit.keyboard.press('Delete')
 assert len(snap(keyedit)['progression']['notes'])==4
 keyedit.keyboard.press('ControlOrMeta+z')
 assert len(snap(keyedit)['progression']['notes'])==5
 keyedit.get_by_role('combobox',name='Edit track',exact=True).select_option('1')
 assert keyedit.get_by_test_id('piano-note').count()==2
 assert keyedit.get_by_test_id('precision-note-select').locator('option').count()==3
 record('Keyboard Delete/Undo and precision chooser respect focused-track isolation')
 keyedit.close()
 # Compact editing tools remain recognizable with 40px targets at 320/390.
 touch_tools=b.new_page(viewport={'width':320,'height':740},has_touch=True)
 touch_tools.on('pageerror',lambda error:errors.append(str(error)))
 touch_tools.goto(args.url)
 for width in (320,390):
  touch_tools.set_viewport_size({'width':width,'height':844})
  for label in ('Draw','Select','Slice','Hand','Stamp'):
   button=touch_tools.get_by_role('button',name=label+' tool')
   button.click()
   rect=button.bounding_box()
   assert rect['width']>=40 and rect['height']>=40,(width,label,rect)
   assert label+' tool' in touch_tools.locator('.active-tool-readout').inner_text()
   assert touch_tools.locator('.active-tool-readout').is_visible()
  assert touch_tools.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 record('Compact 320/390px tool sweep gives permanent mode instructions and 40px targets')
 touch_tools.close()
 # 390px Follow Melody task hierarchy keeps Generate dock visible and
 # advanced settings discoverable without forcing every slider onscreen.
 melody_mobile=b.new_page(viewport={'width':390,'height':844},has_touch=True)
 melody_mobile.on('pageerror',lambda error:errors.append(str(error)))
 melody_mobile.goto(args.url)
 import_fixture(melody_mobile)
 melody_mobile.get_by_role('button',name='Toggle inspector',exact=True).click()
 melody_mobile.get_by_role('tab',name='Compose',exact=True).click()
 melody_mobile.get_by_role('button',name='Follow melody',exact=True).click()
 assert melody_mobile.locator('.melody-step-heading h4').all_inner_texts()==['Source','Action','Harmonic fit']
 assert melody_mobile.locator('.melody-advanced').get_attribute('open') is None
 expect(melody_mobile.get_by_role('button',name='Harmonize melody',exact=False)).to_be_visible()
 melody_mobile.get_by_role('button',name='Continue',exact=True).click()
 expect(melody_mobile.get_by_role('slider',name='Melodic creative distance')).to_be_visible()
 expect(melody_mobile.get_by_role('button',name='Continue melody',exact=False)).to_be_visible()
 record('390px melody workflow exposes task essentials and expandable advanced settings')
 melody_mobile.close()
 # Measure each label against the rendered neutral/earth surface it sits
 # on, not a hard-coded dark-green backdrop from the previous theme.
 reading=b.new_page(viewport={'width':1440,'height':900},has_touch=True)
 reading.on('pageerror',lambda error:errors.append(str(error)))
 reading.goto(args.url)
 samples=reading.evaluate("""() => {
  const tests=[
   ['.compose-panel .panel-version',11],
   ['.compose-compact-intro .eyebrow',11],
   ['.compose-panel .field-control > span',12],
   ['.compose-compact-intro p',12],
   ['.compose-disclosure > summary > span',12],
   ['.editor-footnote',12],
   ['.app-status',12]
  ];
  const linear=c=>{c=c/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  const luminance=a=>.2126*linear(a[0])+.7152*linear(a[1])+.0722*linear(a[2]);
  const parse=value=>{
    const match=value.match(/rgba?\(([^)]+)\)/);
    return match?match[1].split(/[ ,/]+/).filter(Boolean).map(Number):null;
  };
  const surface=element=>{
    for(let el=element;el instanceof HTMLElement;el=el.parentElement){
      const css=getComputedStyle(el);
      const solid=parse(css.backgroundColor);
      if(solid && (solid[3]??1)>=0.98)return solid.slice(0,3);
      // The inspector uses a subtle charcoal gradient: take its lighter
      // first color stop as the conservative contrast background.
      const gradient=parse(css.backgroundImage);
      if(gradient && (gradient[3]??1)>=0.98)return gradient.slice(0,3);
    }
    return [215,217,213];
  };
  return tests.map(([selector,minSize])=>{
   const el=document.querySelector(selector);
   if(!el)return {selector,missing:true};
   const style=getComputedStyle(el),foreground=parse(style.color).slice(0,3);
   const bg=surface(el), fg=luminance(foreground), backdrop=luminance(bg);
   return {selector,minSize,fontSize:parseFloat(style.fontSize),background:bg,
     contrast:(Math.max(fg,backdrop)+.05)/(Math.min(fg,backdrop)+.05)};
  });
 }""")
 assert all(not s.get('missing') and s['fontSize']>=s['minSize'] and s['contrast']>=4.5 for s in samples),samples
 record('Computed inspector and status typography meets sampled 11/12px sizes and 4.5:1 contrast')
 for width,height in ((320,740),(390,844),(768,1024),(1440,900)):
  reading.set_viewport_size({'width':width,'height':height})
  reading.wait_for_timeout(120)
  assert reading.evaluate('document.documentElement.scrollWidth')<=width+1,(width,'horizontal overflow')
  reading.screenshot(path=str(OUTPUT/f'typography-{width}.png'))
 record('Typography screenshots at 320, 390, 768 and 1440 pixels without horizontal overflow')
 reading.close()
 # Emulate 200% browser zoom by reducing CSS viewport size while keeping the
 # physical 1440×900 pixels. body.style.zoom does not reflow media queries.
 zoomed=b.new_page(viewport={'width':720,'height':450},device_scale_factor=2,has_touch=True)
 zoomed.on('pageerror',lambda error:errors.append(str(error)))
 zoomed.goto(args.url)
 zoomed.get_by_role('button',name='Toggle inspector',exact=True).click()
 zoomed.wait_for_timeout(400)
 expect(zoomed.get_by_role('button',name='Generate pattern',exact=False).first).to_be_visible()
 inspector_box=zoomed.locator('#studio-inspector').bounding_box()
 assert inspector_box and inspector_box['x']>=-1 and inspector_box['x']+inspector_box['width']<=721,inspector_box
 expect(zoomed.get_by_role('button',name='Fit pattern',exact=True)).to_be_visible()
 assert zoomed.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
 zoomed.screenshot(path=str(OUTPUT/'typography-200-percent.png'))
 record('200% effective CSS viewport reflows primary Generate and Fit controls')
 zoomed.close()
 # Source meter is disclosed alongside the editor, survives autosave, and
 # does not pretend that the fixed 4/4 grid follows the source bar lines.
 meter=b.new_page(viewport={'width':1280,'height':800})
 meter.on('pageerror',lambda error:errors.append(str(error)))
 meter.goto(args.url)
 meter.locator('input[type=file]').first.set_input_files(str(meter_fixture))
 expect(meter.locator('.meter-import-warning')).to_contain_text('Imported meter: 3/4')
 expect(meter.locator('.time-signature')).to_contain_text('4/4 editor grid')
 assert snap(meter)['progression']['sourceTimeSignatures']==['3/4']
 meter.reload();meter.wait_for_timeout(350)
 expect(meter.locator('.meter-import-warning')).to_contain_text('Imported meter: 3/4')
 record('Imported 3/4 meter warning persists while the 4/4 editor remains explicit')
 meter.close()
 assert not errors,errors
 record('No browser page errors during the complete suite')
 (OUTPUT/'geometry.json').write_text(json.dumps(metrics,indent=2))
 b.close()
(OUTPUT/'results.json').write_text(json.dumps({'passed':len(results),'checks':results,'errors':errors},indent=2))
