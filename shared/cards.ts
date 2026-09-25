import { SHOP_INDEX, START_INDEX, TAX_INDEX, type GroupId } from './board.ts'
import type { ShopItem } from './types.ts'

// Landing on a CHANCE (This Way / That Way) or UNO (?) tile: the dice total that brought you there picks the result.

export type FateEffect =
  | { kind: 'goTo'; tile: number }
  | { kind: 'surrender' }
  | { kind: 'payEach'; amount: number }
  | { kind: 'collectEach'; amount: number }
  | { kind: 'rentMult'; mult: number; payments: number }
  | { kind: 'jail' }
  | { kind: 'setBoost' }
  | { kind: 'pay'; amount: number }
  | { kind: 'collect'; amount: number }
  | { kind: 'item'; item: 'taxHouseFree' | 'taxCardFree' | 'jailCard' }
  | { kind: 'shopBan' }
  | { kind: 'yourPlace' }
  | { kind: 'skipStart' }
  | { kind: 'destroyOwn' }
  | { kind: 'breakOther' }

export interface FateEntry {
  title: string
  text: string
  effect: FateEffect
}

export const CHANCE_TABLE: Record<number, FateEntry> = {
  2: { title: 'Go to Tax', text: 'Move to the Tax spot and pay your taxes.', effect: { kind: 'goTo', tile: TAX_INDEX } },
  3: { title: 'Go to Token Shop', text: 'Move to the Token Shop.', effect: { kind: 'goTo', tile: SHOP_INDEX } },
  4: { title: 'Surrender a card', text: 'Give one of your property cards back to the bank.', effect: { kind: 'surrender' } },
  5: { title: 'Go to START', text: 'Move to START and collect your reward.', effect: { kind: 'goTo', tile: START_INDEX } },
  6: { title: 'Give 5,000 to each player', text: 'Pay every other player 5,000.', effect: { kind: 'payEach', amount: 5000 } },
  7: { title: 'Half rent', text: 'Pay only half rent on your next 2 rent payments to other players.', effect: { kind: 'rentMult', mult: 0.5, payments: 2 } },
  8: { title: 'Go to Jail', text: 'Go straight to jail.', effect: { kind: 'jail' } },
  9: { title: 'Set bonus +2,000', text: 'Your set bonus increases by 2,000 for 2 rounds, counted from this spot.', effect: { kind: 'setBoost' } },
  10: { title: '20,000 loss', text: 'Pay 20,000 to the bank.', effect: { kind: 'pay', amount: 20000 } },
  11: { title: 'Free house tax card', text: 'Your next Tax visit skips the house & hotel tax.', effect: { kind: 'item', item: 'taxHouseFree' } },
  12: { title: '100,000 loss', text: 'Pay 100,000 to the bank.', effect: { kind: 'pay', amount: 100000 } },
}

export const UNO_TABLE: Record<number, FateEntry> = {
  2: { title: 'Card tax free', text: 'Your next Tax visit skips the card tax.', effect: { kind: 'item', item: 'taxCardFree' } },
  3: { title: 'Shop ban', text: 'You are banned from the Token Shop for 1 visit.', effect: { kind: 'shopBan' } },
  4: { title: 'Go to your place', text: 'Jump to one of your own properties.', effect: { kind: 'yourPlace' } },
  5: { title: 'No START reward', text: 'You will not get the START reward the next time.', effect: { kind: 'skipStart' } },
  6: { title: 'Collect 5,000 from each player', text: 'Every other player pays you 5,000.', effect: { kind: 'collectEach', amount: 5000 } },
  7: { title: '1.5x rent', text: 'Pay 1.5x rent on your next 2 rent payments to other players.', effect: { kind: 'rentMult', mult: 1.5, payments: 2 } },
  8: { title: 'Free jail card', text: 'Get a jail card for free.', effect: { kind: 'item', item: 'jailCard' } },
  9: { title: 'Double rent', text: 'Pay double rent on your next 2 rent payments to other players.', effect: { kind: 'rentMult', mult: 2, payments: 2 } },
  10: { title: '20,000 profit', text: 'Collect 20,000 from the bank.', effect: { kind: 'collect', amount: 20000 } },
  11: { title: 'Destroy a building', text: 'Destroy one of your houses or your hotel.', effect: { kind: 'destroyOwn' } },
  12: { title: 'Get 100,000', text: 'Collect 100,000 from the bank.', effect: { kind: 'collect', amount: 100000 } },
}

/** Token Shop "Random roll": one die */
export const RANDOM_ROLL_TABLE: Record<number, FateEntry> = {
  1: { title: 'Free house tax card', text: 'Your next Tax visit skips the house & hotel tax.', effect: { kind: 'item', item: 'taxHouseFree' } },
  2: { title: 'Go to START', text: 'Move to START and collect your reward.', effect: { kind: 'goTo', tile: START_INDEX } },
  3: { title: '10,000 loss', text: 'Pay 10,000 to the bank.', effect: { kind: 'pay', amount: 10000 } },
  4: { title: 'Break another house', text: 'Destroy one house or hotel of another player.', effect: { kind: 'breakOther' } },
  5: { title: 'Go to your place', text: 'Jump to one of your own properties.', effect: { kind: 'yourPlace' } },
  6: { title: 'Get 20,000', text: 'Collect 20,000 from the bank.', effect: { kind: 'collect', amount: 20000 } },
}

export interface ShopEntry {
  id: ShopItem
  name: string
  price: number
  text: string
  /** Groups the buyer must own at least one card of */
  requiresGroups?: GroupId[]
  requiresUltimate?: boolean
}

export const SHOP_ITEMS: ShopEntry[] = [
  { id: 'startCard', name: 'Start card', price: 3000, text: 'On your turn (before or after rolling), jump to START and collect the START reward.' },
  { id: 'ultimateStartCard', name: 'Ultimate Start card', price: 5000, text: 'Same as the Start card. Only for Ultimate START owners.', requiresUltimate: true },
  { id: 'jailCard', name: 'Jail card', price: 17000, text: 'Walk out of jail for free.' },
  { id: 'ultimateStart', name: 'Ultimate START', price: 100000, text: 'Permanent upgrade: collect 10,000 instead of 5,000 every time you cross or land on START.' },
  { id: 'taxCardFree', name: 'Tax for card', price: 8000, text: 'Your next Tax visit skips the card tax (1,000 per card).' },
  { id: 'taxHouseFree', name: 'Tax for house & hotel', price: 11000, text: 'Your next Tax visit skips the house & hotel tax.' },
  { id: 'random', name: 'Random roll', price: 12000, text: 'Roll one die: 1 free house tax card · 2 go to START · 3 lose 10,000 · 4 break another player’s house · 5 go to your place · 6 get 20,000.' },
  {
    id: 'sinister',
    name: 'Sinister 6 card',
    price: 8000,
    text: 'Activate on your turn: +2,000 rent on each of your “6” cards for 2 rounds, counted from where you activate it.',
    requiresGroups: ['6', 'G'],
  },
  {
    id: 'web',
    name: 'Web card',
    price: 17000,
    text: 'When an opponent lands on your place, glue them there for 3 more turns. They pay you rent every turn.',
    requiresGroups: ['W'],
  },
  {
    id: 'symbiote',
    name: 'Symbiote card',
    price: 12000,
    text: 'On your turn, pull an opponent onto one of your places and make them pay rent.',
    requiresGroups: ['S'],
  },
]
