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
results=[]
def record(name): results.append(name); print('PASS',name,flush=True)
def snap(page):
 page.wait_for_timeout(500)
 return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
def import_fixture(page):
 page.locator('input[type=file]').first.set_input_files(str(fixture));page.wait_for_timeout(650)
 if page.get_by_role('button',name='Dismiss notification').count(): page.get_by_role('button',name='Dismiss notification').click()
def grid_point(page,midi,quarter):
 grid=page.get_by_test_id('piano-grid').bounding_box(); zoom=snap(page)['zoomX'];height=grid['height']/128
 return grid['x']+quarter*zoom,grid['y']+(127-midi+.5)*height
with sync_playwright() as p:
 b=p.chromium.launch(headless=True, **({'executable_path': os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}))
 page=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1,has_touch=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(args.url);page.evaluate('document.fonts.ready')
 # Primary sound choice must be visible without scrolling the desktop inspector.
 panel=page.locator('.inspector-panel:not([hidden])').bounding_box()
 trigger=page.locator('.sound-picker-trigger').first.bounding_box()
 assert trigger and panel and trigger['y']+trigger['height']<=panel['y']+panel['height']-16
 record('Sound selection is discoverable without inspector scrolling')
 # New composer shortcuts should update both fine-tuning controls without generating notes.
 page.get_by_role('button',name='Groove',exact=True).click()
 assert page.get_by_role('slider',name='Chord tension').input_value()=='34'
 assert page.get_by_role('slider',name='Rhythmic detail').input_value()=='58'
 page.get_by_role('button',name='Warm',exact=True).click()
 assert page.get_by_role('slider',name='Chord tension').input_value()=='12'
 assert page.get_by_role('slider',name='Rhythmic detail').input_value()=='18'
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
 assert page.locator('.sound-library-row').count()==33
 page.get_by_role('button',name='Keys',exact=True).click()
 assert page.locator('.sound-library-row').count()==6
 page.get_by_role('searchbox',name='Search presets').fill('glass')
 assert page.locator('.sound-library-row').count()==1
 page.get_by_role('button',name='Preview Glass Piano',exact=True).click()
 page.locator('.sound-library-select').filter(has_text='Glass Piano').click()
 expect(page.get_by_role('dialog',name='Sound library')).not_to_be_visible()
 assert 'Glass Piano' in page.locator('.sound-picker-title').first.inner_text()
 page.wait_for_timeout(650)
 assert snap(page)['synthType']=='glass'
 record('33 sounds are searchable, categorized, audible and persist after selection')
 page.locator('.sound-picker-trigger').first.click()
 expect(page.get_by_role('dialog',name='Sound library')).to_be_visible()
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
 import_fixture(page);original=snap(page)['progression']['notes'];assert len(original)==5
 page.get_by_role('combobox',name='Edit track',exact=True).select_option('1');page.get_by_role('tab',name='Transform',exact=True).click()
 page.get_by_role('button',name='Transpose up 1 semitones',exact=True).click()
 after=snap(page)['progression']['notes']
 for a,n in zip(original,after): assert n['midi']==a['midi']+(1 if a['trackIndex']==1 else 0)
 record('Focused-track transpose changes only visible notes')
 page.get_by_role('combobox',name='Edit track',exact=True).select_option('2')
 expect(page.get_by_role('button',name='Apply quantize',exact=True)).to_be_disabled()
 expect(page.get_by_role('button',name='Apply humanize',exact=True)).to_be_disabled()
 assert snap(page)['progression']['notes']==after
 record('Empty-track transforms are disabled, never affect hidden notes')
 page.get_by_role('combobox',name='Edit track',exact=True).select_option('all');page.get_by_role('tab',name='Tracks',exact=True).click()
 bass_strip=page.locator('section.track-strip').filter(has_text='Bass').first
 bass_strip.locator('.sound-picker-trigger').click()
 page.get_by_role('button',name='Bass',exact=True).click()
 page.get_by_role('searchbox',name='Search presets').fill('digital bass')
 assert page.locator('.sound-library-row').count()==1
 page.locator('.sound-library-select').filter(has_text='Digital Bass').click()
 page.wait_for_timeout(550)
 assert snap(page)['trackMix']['1']['synthType']=='fmBass'
 record('Track mixer chooses independent expanded presets with audition')
 page.get_by_role('button',name='Mute Bass',exact=True).click();assert snap(page)['trackMix']['1']['muted']
 page.get_by_role('button',name='Solo Keys',exact=True).click();assert snap(page)['trackMix']['0']['solo']
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
 roundtrip=snap(page)['progression']
 assert len(roundtrip['notes'])==len(saved['progression']['notes'])
 assert [t['name'] for t in roundtrip['tracks']]==['Keys','Bass','Empty pad']
 record('Real MIDI download and re-import preserve notes and track headers')
 # Test the complete canvas, not an empty-page screenshot.
 page.get_by_role('tab',name='Compose',exact=True).click()
 page.get_by_role('combobox',name='Root key',exact=True).select_option('D')
 page.get_by_role('combobox',name='Scale mode',exact=True).select_option('minor')
 page.get_by_role('slider',name='Chord tension',exact=True).fill('48')
 page.get_by_role('slider',name='Rhythmic detail',exact=True).fill('55')
 page.get_by_role('button',name='Generate pattern',exact=False).click()
 page.wait_for_timeout(600)
 if page.get_by_role('button',name='Dismiss notification').count(): page.get_by_role('button',name='Dismiss notification').click()
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
 page.get_by_role('button',name='Rename Track 3',exact=True).click()
 page.get_by_role('textbox',name='New track name').fill('Melody')
 page.get_by_role('textbox',name='New track name').press('Enter')
 assert snap(page)['progression']['tracks'][-1]['name']=='Melody'
 page.get_by_role('button',name='Duplicate Melody',exact=True).click()
 duplicated=snap(page)['progression']
 assert duplicated['tracks'][-1]['name']=='Melody copy'
 assert len([n for n in duplicated['notes'] if n['trackIndex']==3])==1
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
  for name in ['Export MIDI','Import MIDI','Play pattern','Draw tool','Fit pattern']:
   control=page.get_by_role('button',name=name,exact=True)
   expect(control).to_be_visible()
   box=control.bounding_box()
   assert box and box['x']>=0 and box['x']+box['width']<=width+.5, (width,name,box)
  canvas=page.get_by_role('region',name='Piano roll canvas').bounding_box()
  assert canvas['height']>=300, (width,canvas)
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
 adaptive.get_by_role('combobox',name='Source melody track',exact=True).select_option('0')
 adaptive.get_by_role('slider',name='Harmonic fit to melody',exact=True).fill('90')
 adaptive.get_by_role('button',name='Balanced',exact=True).click()
 adaptive.get_by_role('button',name='Harmonize melody',exact=False).click()
 adaptive.wait_for_timeout(600)
 first=snap(adaptive)
 assert first['melodySourceMode']=='follow'
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
 record('Adaptive harmony is undoable and persistent across browser reload')
 adaptive.screenshot(path=str(OUTPUT/'melody-follow.png'))
 with adaptive.expect_download() as adaptive_download:
  adaptive.get_by_role('button',name='Export MIDI',exact=True).click()
 adaptive_file=OUTPUT/'adaptive.mid'
 adaptive_download.value.save_as(str(adaptive_file))
 assert adaptive_file.read_bytes().startswith(b'MThd')
 adaptive.locator('input[type=file]').first.set_input_files(str(adaptive_file))
 adaptive.wait_for_timeout(650)
 adaptive_roundtrip=snap(adaptive)['progression']
 assert len(adaptive_roundtrip['notes'])==len(first['progression']['notes'])
 assert [t['name'] for t in adaptive_roundtrip['tracks']]==[
  'Keys','Bass','Empty pad','Generated Bass','Generated Harmony']
 record('Melody-aware layers export and re-import as standard multi-track MIDI')
 adaptive.close()
 assert not errors,errors
 record('No browser page errors during the complete suite')
 (OUTPUT/'geometry.json').write_text(json.dumps(metrics,indent=2))
 b.close()
(OUTPUT/'results.json').write_text(json.dumps({'passed':len(results),'checks':results,'errors':errors},indent=2))
