import { BookOpen } from 'lucide-react'
import { GROUPS, type TileKind } from '@shared/board.ts'
import { CHANCE_TABLE, RANDOM_ROLL_TABLE, SHOP_ITEMS, UNO_TABLE, type FateEntry } from '@shared/cards.ts'
import {
  JAIL_BAIL,
  JAIL_DOUBLET_TRIES,
  JAIL_MAX_TURNS,
  LEASE_ROUNDS,
  SET_BONUS,
  SET_BONUS_MIN_CARDS,
  SPIDERVERSE_FEE,
  TAX_PER_CARD,
  TAX_PER_HOTEL,
  TAX_PER_HOUSE,
  ULTIMATE_START_REWARD,
} from '@shared/rules.ts'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types.ts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@/store'

const n = (v: number) => v.toLocaleString('en-US')

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="font-comic text-xl tracking-wider text-red-400">{title}</h3>
      <div className="space-y-1 text-sm text-white/85 [&_b]:text-white">{children}</div>
    </section>
  )
}

function FateTable({ table, die = '2 dice' }: { table: Record<number, FateEntry>; die?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-white/5 px-2.5 py-1 text-[11px] tracking-wider text-muted-foreground uppercase">Roll {die}</div>
      {Object.entries(table).map(([roll, e]) => (
        <div key={roll} className="flex gap-3 border-t px-2.5 py-1.5 text-sm">
          <span className="w-5 shrink-0 text-right font-mono font-bold text-amber-300">{roll}</span>
          <span>
            <b>{e.title}</b> <span className="text-white/65">· {e.text}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export type RuleTopic = Exclude<TileKind, 'property'> | 'property'

/** Rules for one kind of board spot, shown when a player clicks that spot. */
export function TileRules({ topic, settings = DEFAULT_SETTINGS }: { topic: RuleTopic; settings?: Settings }) {
  switch (topic) {
    case 'start':
      return (
        <Section title="START">
          <p>
            Every time you cross or land on START you get <b>{n(settings.salary)}</b>.
          </p>
          <p>
            <b>Ultimate START</b> ({n(100_000)}, offered to everyone at the start of the game and sold in the Token Shop) upgrades this to <b>{n(ULTIMATE_START_REWARD)}</b> every round.
          </p>
          <p>A Start card or Ultimate Start card (Token Shop) jumps you to START on your turn, before or after you roll.</p>
        </Section>
      )
    case 'chance':
      return (
        <Section title="CHANCE (This Way / That Way / Another Way)">
          <p>Roll 2 dice and follow the result.</p>
          <FateTable table={CHANCE_TABLE} />
        </Section>
      )
    case 'uno':
      return (
        <Section title="UNO ( ? )">
          <p>Roll 2 dice and follow the result. “Next 2 turns” effects start on your next turn.</p>
          <FateTable table={UNO_TABLE} />
        </Section>
      )
    case 'tax':
      return (
        <Section title="Tax">
          <p>
            Pay <b>{n(TAX_PER_CARD)}</b> for each card you own, <b>{n(TAX_PER_HOUSE)}</b> for each house and <b>{n(TAX_PER_HOTEL)}</b> for each hotel.
          </p>
          <p>A “Tax for card” or “Tax for house & hotel” card waives that part once.</p>
        </Section>
      )
    case 'shop':
      return (
        <Section title="Token Shop (spider emblem)">
          <p>Land here to buy power cards. They can only be bought here.</p>
          <div className="overflow-hidden rounded-lg border">
            {SHOP_ITEMS.map((i, k) => (
              <div key={i.id} className="flex gap-3 border-t px-2.5 py-1.5 text-sm first:border-t-0">
                <span className="w-5 shrink-0 text-right font-mono text-white/50">{k + 1}</span>
                <span className="flex-1">
                  <b>{i.name}</b> <span className="text-white/65">· {i.text}</span>
                  {i.requiresGroups && (
                    <span className="ml-1 text-[11px] text-amber-300">Needs a “{GROUPS[i.requiresGroups[0]].symbol}” card.</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-amber-200">{n(i.price)}</span>
              </div>
            ))}
          </div>
          <FateTable table={RANDOM_ROLL_TABLE} die="1 die (Random roll)" />
        </Section>
      )
    case 'jail':
      return (
        <Section title="Jail">
          <p>
            Landing here, a Go to Jail result, or three doublets in a row locks you up for up to <b>{JAIL_MAX_TURNS} turns</b>. You get <b>no income</b> in jail (nobody pays you
            rent).
          </p>
          <p>
            To get out: pay <b>{n(JAIL_BAIL)}</b>, roll a <b>doublet</b> ({JAIL_DOUBLET_TRIES} chances), or use a Jail card.
          </p>
          <p>
            When you get out you hold a <b>Criminal card</b>: you can’t buy or build on the first spot you land on.
          </p>
        </Section>
      )
    case 'spiderverse':
      return (
        <Section title="Spider-Verse">
          <p>
            Pay <b>{n(SPIDERVERSE_FEE)}</b> to use one power:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              <b>Teleport power</b>: jump to any spot on the board right now.
            </li>
            <li>
              <b>Come reverse</b>: get a Reverse card; on a later turn, return to this Spider-Verse spot.
            </li>
            <li>
              <b>Jail no cost</b>: get a Jail card.
            </li>
          </ul>
        </Section>
      )
    case 'lease':
      return (
        <Section title="Lease">
          <p>When you land here you can lease a card for {LEASE_ROUNDS} rounds:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              <b>From the unowned pile</b>: choose base, 1-3 houses or hotel, and pay that level’s lease value from the card every round.
            </li>
            <li>
              <b>From another player</b> (or lease yours out): both players must agree. The card is leased at the level it has, and the renter pays the owner the lease value every
              round.
            </li>
          </ul>
          <p>
            The renter collects the card’s rent while leasing, but gets no set bonus. After {LEASE_ROUNDS} rounds the card goes back to its owner or the unowned pile.
          </p>
        </Section>
      )
    case 'property':
      return (
        <Section title="Property cards">
          <p>Land on an unowned card to buy it. Build a house (up to 3, then a hotel) on any card you own, on your turn, for the card’s BUILD cost.</p>
          <p>
            <b>Set bonus</b>: hold {SET_BONUS_MIN_CARDS} or more cards of the same color set and each of them earns <b>+{n(SET_BONUS)}</b> rent.
          </p>
          <p>Short on coins? Sell a building (half its cost) or a card (half its value) back to the bank.</p>
        </Section>
      )
  }
}

const ORDER: RuleTopic[] = ['property', 'start', 'uno', 'chance', 'tax', 'shop', 'jail', 'spiderverse', 'lease']

export function RulesContent({ settings = DEFAULT_SETTINGS }: { settings?: Settings }) {
  return (
    <div className="space-y-5">
      <Section title="Goal">
        <p>
          Roll 2 dice and move <b>anticlockwise</b>. Buy the Spider-Verse, collect rent and bankrupt your rivals. Everyone starts with <b>{n(settings.startingCash)}</b> WebCoins.
          A doublet lets you roll again; three in a row sends you to jail.
        </p>
      </Section>
      {ORDER.map((t) => (
        <TileRules key={t} topic={t} settings={settings} />
      ))}
      <Section title="Power cards">
        <p>
          <b>Sinister 6</b>: needs a “6” card. Activate it on your turn: +2,000 rent on each of your “6” cards for 2 rounds.
        </p>
        <p>
          <b>Web</b>: needs a “W” card. When an opponent lands on your place, glue them there for 3 more turns; they pay you rent each turn.
        </p>
        <p>
          <b>Symbiote</b>: needs an “S” card. On your turn, pull an opponent onto one of your places and they pay rent. Cards can be combined.
        </p>
      </Section>
      <Section title="Trading & voice">
        <p>Trade cards and coins with anyone at any time. Join voice to talk; M toggles your mic.</p>
      </Section>
    </div>
  )
}

export function RulesDialog({ settings, trigger }: { settings?: Settings; trigger?: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm">
            <BookOpen /> Rules
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-comic text-3xl tracking-wider">How to play Webopoly</DialogTitle>
          <DialogDescription>A Spider-Verse property trading game for 2-6 players.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-3">
          <RulesContent settings={settings} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

/** Opens when a player clicks a special spot on the board. */
export function TileRulesDialog({ settings }: { settings: Settings }) {
  const topic = useStore((s) => s.ruleTopic)
  const set = useStore((s) => s.set)
  return (
    <Dialog open={!!topic} onOpenChange={(o) => !o && set({ ruleTopic: null })}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Spot rules</DialogTitle>
          <DialogDescription className="sr-only">Rules for this spot on the board</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-3">{topic && <TileRules topic={topic} settings={settings} />}</ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
