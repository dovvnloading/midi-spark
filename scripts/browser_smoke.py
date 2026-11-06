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
 page.get_by_role('button',name='Mute Bass',exact=True).click();assert snap(page)['trackMix']['1']['muted']
 page.get_by_role('button',name='Solo Keys',exact=True).click();assert snap(page)['trackMix']['0']['solo']
 page.get_by_role('slider',name='Keys volume',exact=True).fill('35');assert snap(page)['trackMix']['0']['level']==.35
 record('Track mute, solo and volume persist without altering MIDI notes')
 page.get_by_role('button',name='Play pattern',exact=True).click();page.wait_for_timeout(600)
 expect(page.get_by_role('button',name='Stop playback',exact=True)).to_be_visible()
 page.get_by_role('button',name='Stop playback',exact=True).click();expect(page.get_by_role('button',name='Play pattern',exact=True)).to_be_visible()
 record('Browser playback starts and stops without runtime errors')
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
 assert not errors,errors
 record('No browser page errors during the complete suite')
 (OUTPUT/'geometry.json').write_text(json.dumps(metrics,indent=2))
 b.close()
(OUTPUT/'results.json').write_text(json.dumps({'passed':len(results),'checks':results,'errors':errors},indent=2))
