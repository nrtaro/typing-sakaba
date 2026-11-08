import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/save';
import { Sound } from '../src/ui/audio';

function setup() {
  const buffer = { duration: 80 };
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; loopStart: number; loopEnd: number; loop: boolean; playbackRate: { value: number } }[] = [];
  const decode = vi.fn(async () => buffer);
  const request = vi.fn(async (_url: string, _options: RequestInit): Promise<Partial<Response>> => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
  const gain = () => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn().mockReturnThis() });
  const context = {
    state: 'running',
    sampleRate: 44100,
    currentTime: 0,
    destination: {},
    createGain: gain,
    createDynamicsCompressor: () => ({
      threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: vi.fn(),
    }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(44100) }),
    createBufferSource: () => {
      const source = { playbackRate: { value: 1 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), loop: false, loopStart: 0, loopEnd: 0 };
      sources.push(source);
      return source;
    },
    decodeAudioData: decode,
  };
  vi.stubGlobal('window', { AudioContext: class { constructor() { return context; } } });
  vi.stubGlobal('fetch', request);
  return { sound: new Sound({ ...DEFAULT_SETTINGS }), request, sources };
}

afterEach(() => vi.unstubAllGlobals());

it('最初の操作後にタイトル曲を流し、配布元のループ位置を使う', async () => {
  const { sound, request, sources } = setup();
  sound.play('title');
  expect(request).not.toHaveBeenCalled();
  sound.unlock();
  await vi.waitFor(() => expect(sources[0]?.start).toHaveBeenCalledOnce());
  expect(request.mock.calls[0][0]).toMatch(/title\.ogg$/);
  expect(sources[0]).toMatchObject({ loop: true, loopStart: 187642 / 44100, loopEnd: 3297305 / 44100 });
  sound.play('title');
  expect(request).toHaveBeenCalledOnce();
  sound.stop();
  expect(sources[0].stop).toHaveBeenCalledOnce();
});

it('場面が切り替わった後に届いた曲を再生しない', async () => {
  const { sound, request, sources } = setup();
  let finish!: (response: Partial<Response>) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  sound.unlock();
  sound.play('morning');
  sound.play('night');
  await vi.waitFor(() => expect(sources[0]?.start).toHaveBeenCalledOnce());
  expect(request.mock.calls[0][1].signal?.aborted).toBe(true);
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(sources).toHaveLength(1);
  expect(sources[0].loopStart).toBe(730857 / 44100);
  sound.stop();
});

it('夜の営業は調達から戻ったときも盛り上がる部分から始まる', async () => {
  const { sound, sources } = setup();
  sound.unlock();
  sound.play('night');
  await vi.waitFor(() => expect(sources[0]?.start).toHaveBeenCalledOnce());
  expect(sources[0].start).toHaveBeenCalledWith(0, 8.25);

  sound.play('fishing');
  await vi.waitFor(() => expect(sources[1]?.start).toHaveBeenCalledOnce());
  expect(sources[1].start).toHaveBeenCalledWith(0, 0);

  sound.play('night');
  await vi.waitFor(() => expect(sources[2]?.start).toHaveBeenCalledOnce());
  expect(sources[2].start).toHaveBeenCalledWith(0, 8.25);
  expect(sources[2]).toMatchObject({ loopStart: 730857 / 44100, loopEnd: 2921016 / 44100 });
  sound.stop();
});

it('一度読んだ曲は、場面を行き来しても読み直さない', async () => {
  const { sound, request, sources } = setup();
  sound.unlock();
  sound.play('night');
  await vi.waitFor(() => expect(sources[0]?.start).toHaveBeenCalledOnce());
  sound.play('fishing');
  await vi.waitFor(() => expect(sources[1]?.start).toHaveBeenCalledOnce());
  sound.play('night');
  await vi.waitFor(() => expect(sources[2]?.start).toHaveBeenCalledOnce());
  expect(request.mock.calls.filter((c) => /night\.ogg$/.test(String(c[0])))).toHaveLength(1);
  sound.stop();
});

it('閉店前の速さは控えめにする（音程が上がりすぎないように）', async () => {
  const { sound, sources } = setup();
  sound.unlock();
  sound.play('night');
  await vi.waitFor(() => expect(sources[0]?.start).toHaveBeenCalledOnce());
  sound.setRate(1.25);
  expect(sources[0].playbackRate.value).toBeCloseTo(1.075);
  sound.stop();
});
