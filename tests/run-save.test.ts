import { describe, it, expect } from 'vitest';
import { SaveStore } from '../src/core/save';
const fixture = () => {
  const data = new Map<string,string>(); let fail = '';
  const storage = { getItem: (k:string) => data.get(k) ?? null, setItem(k:string,v:string) { if (k.includes(fail) && fail) throw Error('quota'); data.set(k,v); }, removeItem(k:string) {data.delete(k);} };
  return { data, storage, fail: (key:string) => {fail=key;} };
};
describe('繁盛記の保存と報酬の復旧', () => {
  it('保存失敗を成功扱いしない', () => { const f=fixture(); const s=new SaveStore(f.storage); const m=s.loadRun(); f.fail('run'); expect(() => s.saveRun(m)).toThrow(); });
  it('古いタブによる上書きを拒む', () => { const f=fixture(); const a=new SaveStore(f.storage), b=new SaveStore(f.storage); const ma=a.loadRun(), mb=b.loadRun(); ma.loop=2; a.saveRun(ma); expect(() => b.saveRun(mb)).toThrow(); expect(a.loadRun().loop).toBe(2); });
  it('報酬保存失敗を再起動後に一度だけ復旧する', async () => { const f=fixture(); const s=new SaveStore(f.storage); const m=s.loadRun(); m.loop=2; f.fail('collection'); await expect(s.commitRun(m,{runId:'x',amount:3000,achievements:[]})).rejects.toThrow(); expect(s.loadRun().paid).not.toContain('x'); f.fail(''); const restarted=new SaveStore(f.storage); await restarted.commitRun(restarted.loadRun()); expect(restarted.loadCollection().coins).toBe(3000); expect(restarted.loadRun().paid).toContain('x'); await restarted.commitRun(restarted.loadRun()); expect(restarted.loadCollection().coins).toBe(3000); });
  it('実績保存失敗も先に進行と一緒に残す', async () => { const f=fixture(); const s=new SaveStore(f.storage); f.fail('records'); await expect(s.commitRun(s.loadRun(),{runId:null,amount:0,achievements:['run-clear']})).rejects.toThrow(); f.fail(''); const t=new SaveStore(f.storage); await t.commitRun(t.loadRun()); expect(t.loadRecords().unlocked['run-clear']).toBeTruthy(); });
  it('進行の最初の保存に失敗したら報酬は付与せず、再試行できる', async () => {
    const f=fixture(), s=new SaveStore(f.storage), m=s.loadRun(); f.fail('run');
    await expect(s.commitRun(m,{runId:'first',amount:100,achievements:[]})).rejects.toThrow();
    expect(s.loadCollection().coins).toBe(0); f.fail(''); await s.commitRun(m);
    expect(s.loadCollection().coins).toBe(100);
  });
  it('受領済み保存だけが失敗しても、履歴200件後の復旧で二重付与しない', async () => {
    const f=fixture(); let writes=0;
    const s=new SaveStore({...f.storage,setItem(k,v){if(k.includes('run') && ++writes===2)throw Error('ack failed');f.storage.setItem(k,v);}});
    await expect(s.commitRun(s.loadRun(),{runId:'ack',amount:3000,achievements:[]})).rejects.toThrow();
    expect(s.loadCollection().coins).toBe(3000);
    s.updateCollection(c=>({...c,credited:Array.from({length:200},(_,i)=>`normal:${i}`)}));
    const restarted=new SaveStore(f.storage); await restarted.commitRun(restarted.loadRun());
    expect(restarted.loadCollection().coins).toBe(3000); expect(restarted.loadRun().paid).toContain('ack');
  });
  it('報酬の保存先が読み取れないときに空データで上書きしない', async () => {
    const f=fixture();f.storage.setItem('lastorder2.collection.v1',JSON.stringify({coins:900,owned:{},credited:[]}));
    const s=new SaveStore({...f.storage,getItem(k){if(k.includes('collection'))throw Error('denied');return f.storage.getItem(k);}});
    await expect(s.commitRun(s.loadRun(),{runId:'read',amount:3000,achievements:[]})).rejects.toThrow();
    expect(JSON.parse(f.storage.getItem('lastorder2.collection.v1')!).coins).toBe(900);
  });

});
