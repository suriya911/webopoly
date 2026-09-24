import { BookOpen } from 'lucide-react'
import { GROUPS } from '@shared/board.ts'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types.ts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

const n = (v: number) => v.toLocaleString('en-US')

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="font-comic text-xl tracking-wider text-red-400">{title}</h3>
      <div className="space-y-1 text-sm text-white/85 [&_b]:text-white">{children}</div>
    </section>
  )
}

export function RulesContent({ settings = DEFAULT_SETTINGS }: { settings?: Settings }) {
  return (
    <div className="space-y-5">
      <Section title="Goal">
        <p>Buy up the Spider-Verse, charge rent, and drive every rival into bankruptcy. Last spider standing wins (or the richest when the time limit ends).</p>
      </Section>
      <Section title="Your turn">
        <p>
          Roll <b>two dice</b> and move clockwise. Everyone starts with <b>{n(settings.startingCash)} WebCoins</b>. Passing <b>START</b> pays{' '}
          <b>{n(settings.salary)}</b>; landing exactly on it pays an extra <b>5,000</b>.
        </p>
        <p>
          <b>Doubles</b> let you roll again. Three doubles in a row sends you straight to The Raft.
        </p>
      </Section>
      <Section title="Properties (30 cards, 6 groups of 5)">
        <p>Land on an unowned property to buy it at the card price, or pass.</p>
        <p>
          <b>Rent</b>: land-only rent from the card, <b>doubled</b> if the owner holds all 5 of the group. Houses raise rent to the 1H / 2H / 3H values, and the 4th
          level is a <b>Web HQ</b> (the H row).
        </p>
        <p>
          <b>Building</b>: own at least <b>{settings.buildRequirement} of 5</b> in a group, then build one level at a time on your turn for the card’s BUILD cost
          {settings.buildCostPct !== 100 ? ` (x${settings.buildCostPct}%)` : ''}.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.values(GROUPS).map((g) => (
            <span key={g.id} className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${g.color}22`, color: g.color, border: `1px solid ${g.color}55` }}>
              {g.id} · {g.name}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Leasing (the L column)">
        <p>
          Short on coins? <b>Lease</b> a property to the bank and receive its Lease value for its current level. A leased property collects no rent and can’t be built on.
          Buy it back any time on your turn for the lease value <b>+10%</b>.
        </p>
      </Section>
      <Section title="Special tiles">
        <p>
          <b>? Spider-Sense</b>: draw a card: cash, fines, jumps, a free pardon from The Raft, and more.
        </p>
        <p>
          <b>This Way / That Way / Another Way</b>: pick a sign. <i>This Way</i> moves you 3 forward, <i>That Way</i> 3 back (you resolve the new tile), <i>Another Way</i>{' '}
          web-swings you to the other signpost for a 2,000 bonus.
        </p>
        <p>
          <b>City Tax</b>: pay 10% of your net worth (min 2,000, max 15,000).
        </p>
        <p>
          <b>The Raft (Jail)</b>: landing on it, a Rhino card, or three doubles locks you up. On your turn roll for doubles (up to 3 tries), pay <b>{n(settings.bail)}</b> bail,
          or use a pardon card. After the third miss you pay bail and move. You still collect rent while locked up.
        </p>
        <p>
          <b>Spider-Sense Stash</b>: {settings.stashPot ? 'taxes, fines and bail pile up in a pot. Land here to grab it all.' : 'a safe spot. Nothing happens.'}
        </p>
        <p>
          <b>Lease Office</b>: collect a 2,000 grant, and buy back leases interest-free for the rest of your turn.
        </p>
        <p>
          <b>Multiverse Portal</b>: pay 2,000 to jump to any property on the board (no START salary), or stay put.
        </p>
      </Section>
      <Section title="Debt & bankruptcy">
        <p>
          If you can’t pay, lease properties to raise coins. If you still can’t, you’re bankrupt: a player creditor takes everything you own, otherwise it goes back to the bank.
        </p>
      </Section>
      <Section title="Trading">
        <p>Offer any mix of properties and coins to another player at any time. Trading is the key to completing your 5-card sets!</p>
      </Section>
      <Section title="Voice & chat">
        <p>
          Hit <b>Join voice</b> to talk. <b>M</b> toggles your mic. Voice is peer-to-peer. Use the chat and emoji reactions to trash-talk.
        </p>
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
