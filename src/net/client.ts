// Port of Network/IMatchClient.cs + Game/RemoteBotOpponent.cs.
// The UI only talks to an IMatchClient. Today it is a LocalMatchClient wrapping the MatchAuthority;
// a future online client implements the same interface and forwards commands to a server-side authority.
import { GameContent } from '../core/content';
import { botChoose, CommandError, CommandResult, MatchAuthority, MatchPhase, PrivatePlayerView, PublicMatchState, RoundResult, SubmitCardCommand } from '../core/match';
import { DeterministicRandom } from '../core/random';
import { PlayerSlot, TestRuleOptions } from '../core/types';
import { addUpdate } from '../ui/engine';

export interface IMatchClient {
  readonly content: GameContent;
  readonly publicState: PublicMatchState;
  readonly controlledSlots: readonly PlayerSlot[];
  controls(slot: PlayerSlot): boolean;
  getPrivateView(slot: PlayerSlot): PrivatePlayerView;
  submit(command: SubmitCardCommand): CommandResult;
  readyForNextRound(slot: PlayerSlot): CommandResult;
  requestNewMatch(seed: number, options: TestRuleOptions | null): void;
  requestOptions(options: TestRuleOptions): void;
  onPublicStateChanged: ((s: PublicMatchState) => void)[];
  onRoundResolved: ((r: RoundResult) => void)[];
}

const fail = (message: string): CommandResult => ({ ok: false, error: CommandError.WrongPhase, message });

export class LocalMatchClient implements IMatchClient {
  readonly controlledSlots: PlayerSlot[];
  onPublicStateChanged: ((s: PublicMatchState) => void)[] = [];
  onRoundResolved: ((r: RoundResult) => void)[] = [];

  constructor(private authority: MatchAuthority, ...controlled: PlayerSlot[]) {
    this.controlledSlots = controlled.length > 0 ? controlled : [PlayerSlot.P1, PlayerSlot.P2];
    authority.onStateChanged.push(() => { const s = authority.getPublicState(); for (const f of this.onPublicStateChanged) f(s); });
    authority.onRoundResolved.push(r => { for (const f of this.onRoundResolved) f(r); });
  }
  get content() { return this.authority.content; }
  get publicState() { return this.authority.getPublicState(); }
  controls(slot: PlayerSlot) { return this.controlledSlots.includes(slot); }
  getPrivateView(slot: PlayerSlot) {
    if (!this.controls(slot)) throw new Error(`This client does not control ${PlayerSlot[slot]}.`);
    return this.authority.getPrivateView(slot);
  }
  submit(command: SubmitCardCommand) {
    if (!this.controls(command.slot)) return fail('제어하지 않는 플레이어입니다.');
    return this.authority.submit(command);
  }
  readyForNextRound(slot: PlayerSlot) {
    if (!this.controls(slot)) return fail('제어하지 않는 플레이어입니다.');
    return this.authority.readyForNextRound(slot);
  }
  requestNewMatch(seed: number, options: TestRuleOptions | null) {
    if (options) this.authority.setOptions(options);
    this.authority.startNewMatch(seed);
  }
  requestOptions(options: TestRuleOptions) { this.authority.setOptions(options); }
}

/** Online-preview opponent: plays P2 like a remote player through its own client (think time 1.0–2.4 s). */
export class RemoteBotOpponent {
  thinkSeconds = { x: 1.0, y: 2.4 };
  private client: LocalMatchClient;
  private rng: DeterministicRandom;
  private timer = -1;
  private readyRound = -1;
  private lastRound = -1;
  enabled = true;

  constructor(authority: MatchAuthority, private slot: PlayerSlot, seed: number) {
    this.client = new LocalMatchClient(authority, slot);
    this.rng = new DeterministicRandom(seed ^ 0x2f6b);
    addUpdate(this);
  }

  update(dt: number) {
    if (!this.enabled) return;
    const s = this.client.publicState;
    if (s.round !== this.lastRound) { if (s.round < this.lastRound) this.readyRound = -1; this.lastRound = s.round; this.timer = -1; }
    switch (s.phase) {
      case MatchPhase.WaitingForSubmissions: {
        if (s.players[this.slot].submitted) return;
        if (this.timer < 0) this.timer = this.thinkSeconds.x + (this.rng.next(1000) / 1000) * Math.max(0, this.thinkSeconds.y - this.thinkSeconds.x);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = -1;
          const cmd = botChoose(this.client.content, this.client.getPrivateView(this.slot), s.field, s.options, this.rng);
          cmd.slot = this.slot;
          this.client.submit(cmd);
        }
        break;
      }
      case MatchPhase.RoundResolved:
        if (this.readyRound === s.round) return;
        this.readyRound = s.round;
        this.client.readyForNextRound(this.slot);
        break;
    }
  }
}
