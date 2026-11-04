// Port of Core/DeterministicRandom.cs (xorshift64). Uses BigInt so results are bit-identical to Unity:
// the same seed produces the same deck order in Unity and on the web.
const MASK = (1n << 64n) - 1n;

export class DeterministicRandom {
  private state: bigint;

  constructor(seed: number) {
    const u = BigInt(seed >>> 0); // (ulong)(uint)seed
    this.state = (u * 0x9E3779B97F4A7C15n + 0x632BE59BD9B4E019n) & MASK;
    if (this.state === 0n) this.state = 0x2545F4914F6CDD1Dn;
    for (let i = 0; i < 4; i++) this.nextULong();
  }

  nextULong(): bigint {
    let s = this.state;
    s ^= (s << 13n) & MASK;
    s ^= s >> 7n;
    s ^= (s << 17n) & MASK;
    this.state = s;
    return s;
  }

  next(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return Number(this.nextULong() % BigInt(maxExclusive));
  }

  shuffle<T>(list: T[]): void {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.next(i + 1);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
  }
}
