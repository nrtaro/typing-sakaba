import { describe,it,expect,vi } from 'vitest';
vi.mock('../src/ui/sprites',()=>({FAM:{},PORTRAIT:{},CRATE:{},DEER:[],ICON:{},MERCHANT:{},RABBIT:[],WALKERS:[],guestSprite(){}}));
import { Game } from '../src/ui/game';
import { signature,newRun,emptyMeta } from '../src/core/run';
import { descOf, PAIRS, pairKey } from '../src/core/build';
import { RunUI } from '../src/ui/runMode';
import { SaveStore } from '../src/core/save';
describe('入力と方針のレビュー修正',()=>{
 it('IMEを検出した時点で停止し、英数入力だけでは再開せずEnterで再開する',()=>{
  const g=Object.assign(Object.create(Game.prototype),{mode:'play',paused:false,imePaused:false,t:2,artState:'ready',menu:{reset:vi.fn()},sound:{unlock:vi.fn()},nameEntry:null});
  const key=(key:string,isComposing=false)=>({key,isComposing,preventDefault:vi.fn(),repeat:false}) as unknown as KeyboardEvent;
  g.onKey(key('Process',true)); expect(g.paused).toBe(true); expect(g.imePaused).toBe(true);
  g.onKey(key('a')); expect(g.paused).toBe(true);
  g.onKey(key('Enter')); expect(g.paused).toBe(false); expect(g.imePaused).toBe(false);
 });
 it('主力は外した方針も含めた全日程の直接売上推計で選ぶ',()=>{const r=newRun(emptyMeta(),1,'sig');r.owned=[{id:'nushi',lv:1}];r.yen={matome:50000,nushi:100};expect(signature(r)).toBe('matome');});
 it('おもてなしの説明に発動の最低間隔がある',()=>{expect(descOf('omotenashi',1)).toContain('2秒');});
 it('未解放の方針を今すぐ足せるように勧めない',()=>{const ui=new RunUI({store:new SaveStore(null)} as never);const hint=(ui as unknown as {hint(c:boolean,o:{id:'oomori';lv:number}[],p:string[]):string}).hint(false,[{id:'oomori',lv:1}],PAIRS.filter(p=>p.a!=='makanai' && p.b!=='makanai').map(p=>pairKey(p.a,p.b)));expect(hint).not.toContain('まかない');});
});
